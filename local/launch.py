"""Double-click launcher. A host capability stays on this Mac."""

import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
URL = "http://127.0.0.1:8764"


def ready():
    try:
        with urlopen(URL + "/health", timeout=0.5) as r:
            remote = json.load(r)
            record = ROOT / ".runtime" / "room" / "instance.json"
            if (
                remote.get("service") != "founders-cafe"
                or not record.exists()
                or remote.get("instance")
                != json.loads(record.read_text()).get("instance")
            ):
                raise SystemExit("端口正由其他程序使用。")
            return True
    except OSError:
        return False


def main():
    data = ROOT / ".runtime" / "room"
    if "--stop" in sys.argv:
        if ready():
            pid = json.loads((data / "instance.json").read_text())["pid"]
            command = subprocess.check_output(
                ["ps", "-ww", "-p", str(pid), "-o", "command="], text=True
            ).strip()
            if command != " ".join(
                [str(ROOT / ".venv" / "bin" / "python"), str(ROOT / "server.py")]
            ):
                raise SystemExit("进程与本项目启动器不匹配，已保留运行。")
            os.kill(pid, signal.SIGTERM)
            for _ in range(50):
                if not ready():
                    break
                time.sleep(0.1)
            else:
                raise SystemExit("服务仍在关闭，请稍后再检查。")
        print("本机咖啡馆已关闭。")
        return
    if not ready():
        data.mkdir(mode=0o700, parents=True, exist_ok=True)
        with (data / "server.log").open("a") as out:
            worker = subprocess.Popen(
                [str(ROOT / ".venv" / "bin" / "python"), str(ROOT / "server.py")],
                cwd=ROOT,
                stdin=subprocess.DEVNULL,
                stdout=out,
                stderr=out,
                start_new_session=True,
            )
        for _ in range(80):
            if ready():
                break
            if worker.poll() is not None:
                raise SystemExit("启动失败，请查看 .runtime/room/server.log")
            time.sleep(0.2)
        else:
            raise SystemExit("服务还未准备好。")
    if "--serve-only" not in sys.argv:
        token = (data / "host-pass").read_text().strip()
        if sys.platform == "darwin":
            subprocess.run(
                ["open", "-a", "Google Chrome", URL + "/#pass=" + token], check=True
            )
        else:
            import webbrowser

            webbrowser.open(URL + "/#pass=" + token)
    print("本机咖啡馆已就绪。", URL)


if __name__ == "__main__":
    main()
