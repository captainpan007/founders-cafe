"""Reproducible offline synthetic speech trial on macOS, using the real models."""

import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from language import transcribe, translate

CASES = [
    ("en", "We have not made a profit yet."),
    ("zh", "预算是五十美元。"),
    ("en", "I can help for two hours on Friday."),
    ("zh", "我在找一位产品设计师。"),
    ("en", "We have three paying customers."),
    ("zh", "我们还没有付费客户。"),
    ("en", "The prototype is ready for testing."),
    ("zh", "下周一上午十点开会。"),
    ("en", "I can review the registration page."),
    ("zh", "这是一份有偿的短期工作。"),
    ("en", "Do not share the customer's email."),
    ("zh", "先试用，不用付款。"),
    ("en", "Our budget is fifty dollars, not fifteen."),
    ("zh", "我可以远程工作两周。"),
    ("en", "Let's agree on one small task."),
    ("zh", "这个项目用的是 Python。"),
    ("en", "My name is Alex."),
    ("zh", "我们要招募两位志愿者。"),
    ("en", "We need feedback on the first screen."),
    ("zh", "请先看原文，然后提问。"),
]


def speech(text, lang, folder):
    aiff = folder / "voice.aiff"
    wav = folder / "voice.wav"
    subprocess.run(
        [
            "say",
            "-v",
            "Tingting" if lang == "zh" else "Samantha",
            "-r",
            "155",
            "-o",
            str(aiff),
            text,
        ],
        check=True,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(aiff),
            "-ar",
            "16000",
            "-ac",
            "1",
            str(wav),
        ],
        check=True,
    )
    import wave

    with wave.open(str(wav)) as f:
        return f.readframes(f.getnframes())


def main():
    rows = []
    with tempfile.TemporaryDirectory() as d:
        for src, text in CASES:
            dst = "en" if src == "zh" else "zh"
            t = time.perf_counter()
            direct = translate(text, src, dst)
            ms = round((time.perf_counter() - t) * 1000)
            pcm = speech(text, src, Path(d))
            t = time.perf_counter()
            heard = transcribe(pcm, src)
            result = translate(heard, src, dst) if heard else ""
            rows.append(
                dict(
                    source=src,
                    input=text,
                    translation=direct,
                    text_ms=ms,
                    transcript=heard,
                    subtitle=result,
                    speech_and_translation_ms=round((time.perf_counter() - t) * 1000),
                )
            )
    print(json.dumps(rows, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
