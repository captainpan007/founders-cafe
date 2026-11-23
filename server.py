import argparse
import asyncio
import contextlib
import fcntl
import hashlib
import hmac
import ipaddress
import json
import os
import secrets
import ssl
import sys
import time
from collections import OrderedDict, defaultdict, deque
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import numpy as np
from aiohttp import WSMsgType, web

from language import transcribe, translate
from room import Room, Rule, check, field

ROOT = Path(__file__).resolve().parent
COOKIE = "founders_cafe_session"
ASSETS = {
    "index.html",
    "style.css",
    "app.js",
    "scene.js",
    "audio.js",
    "capture.js",
    "favicon.png",
}
DAY = 86400


def atomic(path, data):
    tmp = path.with_suffix(".tmp")
    fd = os.open(tmp, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(data)
    tmp.replace(path)


class Cafe:
    def __init__(self, folder, clock=time.time, extra_host=None, public_origin=None):
        self.allowed_hosts = {"127.0.0.1", "localhost", "::1"}
        self.public_origin = public_origin
        if public_origin:
            self.allowed_hosts.add(urlsplit(public_origin).hostname)
        if extra_host:
            self.allowed_hosts.add(extra_host)
        folder.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.lock = (folder / "instance.lock").open("a")
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.lock.close()
            raise
        keyfile = folder / "key"
        if not keyfile.exists():
            atomic(keyfile, secrets.token_hex(32))
        self.key = bytes.fromhex(keyfile.read_text())
        self.instance = uuid4().hex
        self.store = folder / "connections.json"
        self.room = Room(
            json.loads(self.store.read_text()) if self.store.exists() else None, clock
        )
        for c in self.room.db["cards"].values():
            if c["expires"] is None:
                c["expires"] = clock() + 7 * DAY
        self.room.prune()
        self.save()
        self.clients = defaultdict(set)
        self.audio = bytearray()
        self.preroll = deque(maxlen=3)
        self.audio_stage = None
        self.silent = 0
        self.voiced = False
        self.speech_queue = asyncio.Queue(maxsize=5)
        self.tasks = []
        self.requests = defaultdict(deque)
        self.cache = OrderedDict()
        self.translating = {}
        self.slots = asyncio.Semaphore(2)

    def save(self):
        atomic(
            self.store,
            json.dumps(self.room.db, ensure_ascii=False, separators=(",", ":")),
        )

    def sign(self, purpose, who, role):
        body = f"{purpose}.{who}.{role}"
        return (
            body + "." + hmac.new(self.key, body.encode(), hashlib.sha256).hexdigest()
        )

    def parse(self, token, purpose):
        a = (token or "").split(".")
        if len(a) != 4 or a[0] != purpose or a[2] not in ("guest", "member", "host"):
            return None
        if not hmac.compare_digest(self.sign(*a[:3]), token):
            return None
        return a[1], a[2]

    def member(self, req):
        info = self.parse(req.cookies.get(COOKIE), "session")
        if not info:
            raise web.HTTPUnauthorized()
        self.room.person(*info)
        return info[0]

    def scoped(self, req):
        origin = req.headers.get("Origin", "")
        if origin != (self.public_origin or f"{req.scheme}://{req.host}"):
            raise web.HTTPForbidden()

    def limited(self, key, count, seconds):
        q = self.requests[key]
        now = time.monotonic()
        while q and q[0] <= now - seconds:
            q.popleft()
        if len(q) >= count:
            raise web.HTTPTooManyRequests()
        q.append(now)

    @staticmethod
    async def notify_socket(sock, payload):
        async with asyncio.timeout(2):
            await sock.send_str(payload)

    async def broadcast(self):
        self.room.rev += 1
        deadline = []
        for who, sockets in list(self.clients.items()):
            if not sockets:
                continue
            payload = json.dumps(
                {"type": "room", "data": self.room.view(who)}, ensure_ascii=False
            )
            deadline.extend(self.notify_socket(sock, payload) for sock in list(sockets))
        if deadline:
            await asyncio.gather(*deadline, return_exceptions=True)

    async def bootstrap(self, req):
        self.scoped(req)
        data = await req.json()
        old = self.parse(req.cookies.get(COOKIE), "session")
        if data.get("pass"):
            info = self.parse(data["pass"], "invite")
            if not info:
                self.limited(("redeem", req.remote), 30, 60)
                raise Rule("badPass")
        elif old:
            info = old
        else:
            self.limited(("guest", req.remote), 180, 60)
            info = (uuid4().hex, "guest")
        who, role = info
        self.room.person(who, role)
        if old and old[0] != who and old[1] == "guest":
            prior = old[0]
            idx = self.room.seats_for(prior)
            self.room.leave(prior)
            if (
                idx is not None
                and who not in self.room.seats
                and not (self.room.stage and self.room.stage["who"] == who)
                and idx in self.room.available()
            ):
                self.room.seats[idx] = who
        self.save()
        response = web.json_response({"ok": True})
        response.set_cookie(
            COOKIE,
            self.sign("session", who, role),
            httponly=True,
            samesite="Strict",
            secure=req.secure or bool(self.public_origin),
            max_age=90 * DAY,
            path="/",
        )
        return response

    async def action(self, req):
        self.scoped(req)
        who = self.member(req)
        data = await req.json()
        self.limited(("act", who), 90, 30)
        check(isinstance(data, dict), "invalid")
        kind = data.get("action")
        if kind == "invite":
            check(self.room.person(who)["role"] == "host", "private")
            return web.json_response(
                {"pass": self.sign("invite", uuid4().hex, "member")}
            )
        check(who in self.room.online, "offline")
        request_id = data.get("requestId")
        seen = self.room.person(who).setdefault("seen", {})
        if request_id is not None:
            check(isinstance(request_id, str) and len(request_id) <= 64, "invalid")
            fingerprint = hashlib.sha256(
                json.dumps(data, sort_keys=True).encode()
            ).hexdigest()
            if request_id in seen:
                check(seen[request_id] == fingerprint, "invalid")
                return web.json_response({"ok": True})
        if kind in ("chat", "replyPublic", "proposePublic"):
            self.limited(("chat", who), 8, 10)
        transitioned = self.room.tick()
        try:
            self.room.action(who, kind, data)
        except Rule:
            if transitioned:
                self.sync_mic()
                self.save()
                await self.broadcast()
            raise
        if request_id is not None:
            seen[request_id] = fingerprint
            if len(seen) > 128:
                del seen[next(iter(seen))]
        self.save()
        self.sync_mic()
        await self.broadcast()
        return web.json_response({"ok": True})

    async def translated(self, req):
        self.scoped(req)
        who = self.member(req)
        self.limited(("tr", who), 180, 60)
        d = await req.json()
        text = field(d, "text", 650)
        src = d.get("source")
        dst = d.get("target")
        check(src in ("zh", "en") and dst in ("zh", "en"), "invalid")
        key = (src, dst, text)
        if key not in self.cache:
            if key not in self.translating:
                if len(self.translating) >= 32:
                    raise web.HTTPTooManyRequests()
                self.translating[key] = asyncio.create_task(self.run_translation(key))
            return web.json_response(
                {"text": await asyncio.shield(self.translating[key])}
            )
        return web.json_response({"text": self.cache[key]})

    async def run_translation(self, key):
        try:
            async with self.slots:
                result = await asyncio.to_thread(translate, key[2], *key[:2])
            if not result:
                raise ValueError("No translation")
            self.cache[key] = result
            if len(self.cache) > 512:
                self.cache.popitem(last=False)
            return result
        finally:
            self.translating.pop(key, None)

    def sync_mic(self):
        s = self.room.stage
        current = (s["id"], s["who"]) if s and s["mic"] else None
        if current != self.audio_stage:
            self.last_packet = time.monotonic()
            if self.audio_stage and self.voiced:
                self.enqueue()
            self.audio.clear()
            self.preroll.clear()
            self.silent = 0
            self.voiced = False
            self.audio_stage = current

    def enqueue(self):
        s = self.room.stage
        if (
            self.audio_stage
            and s
            and s["id"] == self.audio_stage[0]
            and len(self.audio) >= 6400
        ):
            try:
                self.speech_queue.put_nowait(
                    (
                        *self.audio_stage,
                        self.room.person(s["who"])["lang"],
                        bytes(self.audio),
                    )
                )
            except asyncio.QueueFull:
                s["captionIssue"] = True
        self.audio.clear()
        self.silent = 0
        self.voiced = False

    async def packet(self, who, data):
        # First 32 bytes bind every PCM packet to its originating stage.
        s = self.room.stage
        if not (
            s and s["mic"] and s["who"] == who and not self.room.person(who)["muted"]
        ):
            return
        if not (
            32 < len(data) <= 32 + 6400
            and (len(data) - 32) % 2 == 0
            and data[:32] == s["id"].encode()
        ):
            return
        now = time.monotonic()
        bucket = self.requests[("pcm", who)]
        while bucket and bucket[0] <= now - 1:
            bucket.popleft()
        if len(bucket) >= 16:
            return
        bucket.append(now)
        self.sync_mic()
        self.last_packet = time.monotonic()
        pcm = data[32:]
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32)
        active = np.sqrt(np.mean(samples * samples)) > 200
        if not self.voiced and not active:
            self.preroll.append(pcm)
        if active or self.voiced:
            if not self.voiced:
                self.audio.extend(b"".join(self.preroll))
                self.preroll.clear()
            self.voiced = True
            self.audio.extend(pcm)
            self.silent = 0 if active else self.silent + len(pcm)
            if self.silent >= 19200 or len(self.audio) >= 224000:
                self.enqueue()
        for person, sockets in list(self.clients.items()):
            if person != who and person in self.room.seats:
                for ws in list(sockets):
                    if getattr(ws, "listening", False):
                        transport = ws.cafe_transport
                        if transport and transport.get_write_buffer_size() < 65536:
                            with contextlib.suppress(
                                RuntimeError, ConnectionError, TimeoutError
                            ):
                                await asyncio.wait_for(ws.send_bytes(data), 0.15)

    async def speech_worker(self):
        while True:
            stage, who, lang, pcm = await self.speech_queue.get()
            s = self.room.stage
            if not s or s["id"] != stage:
                continue
            try:
                words = await asyncio.to_thread(transcribe, pcm, lang, s["terms"])
                if (
                    words
                    and self.room.stage is s
                    and not self.room.person(who)["muted"]
                ):
                    self.room.line(who, words[:600], "caption", lang)
                    await self.broadcast()
            except Exception:
                if self.room.stage is s:
                    s["captionIssue"] = True
                    await self.broadcast()

    async def socket(self, req):
        self.scoped(req)
        who = self.member(req)
        ws = web.WebSocketResponse(heartbeat=15, max_msg_size=18000)
        await ws.prepare(req)
        ws.cafe_transport = req.transport
        self.clients[who].add(ws)
        self.room.join(who)
        await self.broadcast()
        try:
            async for msg in ws:
                if msg.type == WSMsgType.BINARY:
                    await self.packet(who, msg.data)
                elif msg.type == WSMsgType.TEXT and msg.data in ("listen", "quiet"):
                    ws.listening = msg.data == "listen"
        finally:
            self.clients[who].discard(ws)
            if not self.clients[who]:
                del self.clients[who]
                self.room.disconnect(who)
            await self.broadcast()
        return ws

    async def timer(self):
        step = 0
        while True:
            await asyncio.sleep(0.4)
            step += 1
            changed = self.room.tick()
            if self.audio_stage and time.monotonic() - self.last_packet > 8:
                s = self.room.stage
                if s and s["id"] == self.audio_stage[0]:
                    s["mic"] = False
                    changed = True
            if step % 150 == 0:
                changed = self.room.prune() or changed
                self.cache.clear()
                for key, seq in list(self.requests.items()):
                    if not seq or seq[-1] < time.monotonic() - 120:
                        self.requests.pop(key, None)
            if changed:
                self.sync_mic()
                self.save()
                await self.broadcast()

    def app(self):
        @web.middleware
        async def errors(req, handler):
            # Loopback-only host allowlist also prevents DNS rebinding.
            if urlsplit("//" + req.host).hostname not in self.allowed_hosts:
                raise web.HTTPForbidden()
            try:
                r = await handler(req)
            except Rule as e:
                r = web.json_response({"error": str(e)}, status=409)
            except (json.JSONDecodeError, TypeError, AttributeError):
                r = web.json_response({"error": "invalid"}, status=400)
            if not r.prepared:
                r.headers.update(
                    {
                        "Cache-Control": "no-store",
                        "X-Content-Type-Options": "nosniff",
                        "Referrer-Policy": "no-referrer",
                        "Content-Security-Policy": "default-src 'self'; connect-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'",
                    }
                )
            return r

        app = web.Application(middlewares=[errors], client_max_size=12000)

        async def static(req):
            name = req.match_info.get("name") or "index.html"
            if name not in ASSETS:
                raise web.HTTPNotFound()
            return web.FileResponse(ROOT / "public" / name)

        async def health(_):
            return web.json_response(
                {"service": "founders-cafe", "version": 2, "instance": self.instance}
            )

        app.add_routes(
            [
                web.get("/", static),
                web.get("/health", health),
                web.post("/api/enter", self.bootstrap),
                web.post("/api/action", self.action),
                web.post("/api/translate", self.translated),
                web.get("/room", self.socket),
                web.get("/{name}", static),
            ]
        )

        async def life(app):
            self.tasks = [
                asyncio.create_task(self.timer()),
                asyncio.create_task(self.speech_worker()),
            ]
            yield
            for t in self.tasks:
                t.cancel()
            await asyncio.gather(*self.tasks, return_exceptions=True)
            self.lock.close()

        app.cleanup_ctx.append(life)

        async def shutdown(_):
            for sockets in list(self.clients.values()):
                for ws in list(sockets):
                    await ws.close()

        app.on_shutdown.append(shutdown)
        return app


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8764)
    ap.add_argument("--data", type=Path, default=ROOT / ".runtime" / "room")
    ap.add_argument(
        "--private-ip",
        help="Explicit private LAN address; requires a trusted TLS cert and key",
    )
    ap.add_argument(
        "--public-origin",
        help="Exact external HTTPS origin served through a loopback-only reverse proxy",
    )
    ap.add_argument("--cert", type=Path)
    ap.add_argument("--tls-key", type=Path)
    args = ap.parse_args()
    tls = None
    if args.private_ip:
        ip = ipaddress.ip_address(args.private_ip)
        if (
            not ip.is_private
            or ip.is_unspecified
            or ip.is_loopback
            or not (args.cert and args.tls_key)
        ):
            ap.error(
                "LAN preview requires a specific private address and TLS certificate/key"
            )
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(args.cert, args.tls_key)
    if args.public_origin:
        import re

        if args.private_ip or not re.fullmatch(
            r"https://[a-z0-9.-]+", args.public_origin
        ):
            ap.error(
                "--public-origin requires an HTTPS hostname with a loopback listener"
            )
        if args.data.resolve() == (ROOT / ".runtime/room").resolve():
            ap.error("use a dedicated public room data directory")
    c = Cafe(args.data, extra_host=args.private_ip, public_origin=args.public_origin)
    handoff = os.environ.pop("CAFE_IDLE_RESTART_SEATS", "")
    if os.environ.pop("CAFE_IDLE_RESTART_STDIN", "") == "1":
        handoff = sys.stdin.buffer.read(1024 * 1024)
    if handoff:
        snapshot = json.loads(handoff)
        c.room.resume_listeners(
            snapshot["seats"], snapshot["observed"], snapshot.get("chat", [])
        )
    hostfile = args.data / "host-pass"
    if not hostfile.exists():
        atomic(hostfile, c.sign("invite", secrets.token_hex(16), "host"))
    atomic(
        args.data / "instance.json",
        json.dumps({"instance": c.instance, "pid": os.getpid()}),
    )
    web.run_app(
        c.app(),
        host=args.private_ip or "127.0.0.1",
        port=args.port,
        ssl_context=tls,
        access_log=None,
    )
