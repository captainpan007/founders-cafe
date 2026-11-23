"""Start the dedicated public beta and point its free, fixed entry at the live room."""

import fcntl
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time
from urllib.error import URLError
from urllib.request import urlopen

from entry import publish

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / ".runtime/public-room"
FIXED = "https://founders-cafe.xiongmaopan7.workers.dev/"


def start():
    DATA.mkdir(mode=0o700, parents=True, exist_ok=True)
    binary = shutil.which("cloudflared") or ROOT / ".runtime/bin/cloudflared"
    # Never replace a live room. The café server owns its own writer lock.
    with (
        (DATA / "launch.lock").open("a") as lease,
        (DATA / "instance.lock").open("a") as writer,
    ):
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            fcntl.flock(writer, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("公开房间正在运行。", FIXED)
            return
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        with (
            tempfile.TemporaryFile(mode="w+") as tunnel_log,
            (DATA / "server.log").open("a") as server_log,
        ):
            tunnel = subprocess.Popen(
                [
                    binary,
                    "tunnel",
                    "--no-autoupdate",
                    "--protocol",
                    "http2",
                    "--url",
                    f"http://127.0.0.1:{port}",
                ],
                stdin=subprocess.DEVNULL,
                stdout=tunnel_log,
                stderr=tunnel_log,
            )
            server = None
            try:
                origin = None
                for _ in range(120):
                    log = os.pread(tunnel_log.fileno(), 32768, 0).decode(
                        errors="replace"
                    )
                    match = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", log)
                    if match:
                        origin = match.group()
                        break
                    if tunnel.poll() is not None:
                        break
                    time.sleep(0.5)
                if not origin:
                    raise RuntimeError("未能取得公网房间地址")
                fcntl.flock(writer, fcntl.LOCK_UN)
                server = subprocess.Popen(
                    [
                        ROOT / ".venv/bin/python",
                        ROOT / "server.py",
                        "--port",
                        str(port),
                        "--data",
                        DATA,
                        "--public-origin",
                        origin,
                    ],
                    cwd=ROOT,
                    stdin=subprocess.DEVNULL,
                    stdout=server_log,
                    stderr=server_log,
                )
                for _ in range(20):
                    if server.poll() is not None:
                        raise RuntimeError("公开房间启动失败")
                    try:
                        with urlopen(origin + "/health", timeout=3):
                            break
                    except (OSError, URLError):
                        time.sleep(1)
                publish(origin)
                print("公开入口", FIXED, flush=True)
                while server.poll() is None and tunnel.poll() is None:
                    time.sleep(2)
            finally:
                for child in (server, tunnel):
                    if child and child.poll() is None:
                        child.terminate()
                        try:
                            child.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            child.kill()
                            child.wait()


if __name__ == "__main__":
    start()
