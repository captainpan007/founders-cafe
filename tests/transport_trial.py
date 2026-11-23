"""Timed loopback path through the actual room server, using synthetic macOS voices."""

import asyncio
import json
import tempfile
import time
from contextlib import AsyncExitStack
from pathlib import Path
from uuid import uuid4

import numpy as np
from aiohttp import ClientSession, CookieJar
from aiohttp.test_utils import TestServer
from language_trial import CASES, speech

from server import Cafe


async def bench():
    rows = []
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        service = Cafe(root / "room")
        async with AsyncExitStack() as stack:
            web = await stack.enter_async_context(TestServer(service.app()))
            url = str(web.make_url("/")).rstrip("/")
            clients = []
            for idx in range(2):
                http = await stack.enter_async_context(
                    ClientSession(
                        cookie_jar=CookieJar(unsafe=True), headers={"Origin": url}
                    )
                )
                async with http.post(
                    url + "/api/enter",
                    json={"pass": service.sign("invite", uuid4().hex, "member")},
                ) as r:
                    r.raise_for_status()
                ws = await stack.enter_async_context(http.ws_connect(url + "/room"))
                await ws.receive_json()
                clients.append((http, ws))
            (host, out), (audience, feed) = clients

            async def read_host():
                async for _ in out:
                    pass

            reader = asyncio.create_task(read_host())

            async def stop_reader():
                reader.cancel()
                await asyncio.gather(reader, return_exceptions=True)

            stack.push_async_callback(stop_reader)

            async def action(client, op, **fields):
                async with client.post(
                    url + "/api/action", json={"action": op, **fields}
                ) as res:
                    res.raise_for_status()

            async def until(predicate):
                async with asyncio.timeout(20):
                    while True:
                        d = (await feed.receive_json())["data"]
                        v = predicate(d)
                        if v:
                            return v

            async def translation(src, dst, text):
                async with audience.post(
                    url + "/api/translate",
                    json={"text": text, "source": src, "target": dst},
                ) as res:
                    res.raise_for_status()
                    return (await res.json())["text"]

            await action(host, "seat", seat=0)
            await action(audience, "seat", seat=1)
            await action(
                host,
                "apply",
                title="Founder conversations",
                goal="Discuss one real next step",
            )
            await action(host, "confirm")
            st = (await until(lambda d: d["stage"]))["id"]
            await action(host, "mic", stage=st, on=True)
            for idx, (src, text) in enumerate(CASES):
                dst = "en" if src == "zh" else "zh"
                await action(host, "speakLang", lang=src)
                started = time.perf_counter()
                await action(host, "say", stage=st, text=text)
                await until(
                    lambda d: any(
                        x["kind"] == "talk" and x["text"] == text
                        for x in d["stage"]["lines"]
                    )
                )
                direct = await translation(src, dst, text)
                text_ms = round((time.perf_counter() - started) * 1000)
                pcm = await asyncio.to_thread(speech, text, src, root)
                # Feed 100 ms PCM packets at microphone pace. All audio remains in this trial.
                pcm += b"\0" * (25600 + (-len(pcm) % 3200))
                last_voice = None
                for off in range(0, len(pcm), 3200):
                    packet = pcm[off : off + 3200]
                    await out.send_bytes(st.encode() + packet)
                    vals = np.frombuffer(packet, dtype="<i2").astype(np.float32)
                    if np.sqrt(np.mean(vals * vals)) > 200:
                        last_voice = time.perf_counter()
                    await asyncio.sleep(0.1)

                def caption(d):
                    items = [x for x in d["stage"]["lines"] if x["kind"] == "caption"]
                    return items[idx] if len(items) > idx else None

                line = await until(caption)
                translated = await translation(src, dst, line["text"])
                rows.append(
                    dict(
                        source=src,
                        input=text,
                        translation=direct,
                        text_ms=text_ms,
                        transcript=line["text"],
                        subtitle=translated,
                        speech_ms=round((time.perf_counter() - last_voice) * 1000),
                    )
                )
    return rows


if __name__ == "__main__":
    print(json.dumps(asyncio.run(bench()), ensure_ascii=False, indent=2))
