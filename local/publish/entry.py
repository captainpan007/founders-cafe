"""Publish the café's fixed, static Cloudflare entry after verifying its live public room."""

import argparse
import html
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.request import urlopen


def publish(origin):
    if not re.fullmatch(r"https://[a-z0-9-]+\.trycloudflare\.com", origin):
        raise ValueError("Expected an HTTPS café preview hostname")
    with urlopen(origin + "/health", timeout=15) as response:
        if json.load(response).get("service") != "founders-cafe":
            raise ValueError("Café health check did not match")
    wrangler = shutil.which("wrangler")
    if not wrangler:
        raise RuntimeError("Wrangler is required to publish the fixed link")
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        assets = root / "public"
        assets.mkdir()
        (assets / "index.html").write_text(
            '<!doctype html><html lang="en"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            "<title>Founders’ Café</title><h1>Founders’ Café</h1>"
            f'<a href="{html.escape(origin)}/">Enter the café · 进入咖啡馆</a></html>'
        )
        (assets / "_redirects").write_text(f"/ {origin}/ 302\n")
        (assets / "_headers").write_text(
            "/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n"
        )
        (root / "wrangler.json").write_text(
            json.dumps(
                dict(
                    name="founders-cafe",
                    compatibility_date="2026-11-01",
                    workers_dev=True,
                    preview_urls=False,
                    assets=dict(directory="./public"),
                )
            )
        )
        subprocess.run(
            [wrangler, "deploy", "--config", str(root / "wrangler.json")],
            cwd=root,
            env={**os.environ, "WRANGLER_SEND_METRICS": "false"},
            check=True,
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("origin")
    publish(parser.parse_args().origin.rstrip("/"))
