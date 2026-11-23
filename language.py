"""Offline inference. The process never sends transcripts or audio to a provider."""

import atexit
import json
import re
import select
import subprocess
import time
from functools import lru_cache
from pathlib import Path
from threading import Lock

import ctranslate2
import numpy as np
import sentencepiece as spm
from faster_whisper import WhisperModel

MODELS = Path(__file__).resolve().parent / ".runtime" / "models"
translation_lock = Lock()
speech_lock = Lock()


@lru_cache(maxsize=2)
def pair(source, target):
    folder = MODELS / f"{source}_{target}"
    return spm.SentencePieceProcessor(
        model_file=str(folder / "sentencepiece.model")
    ), ctranslate2.Translator(
        str(folder / "model"),
        device="cpu",
        compute_type="int8",
        inter_threads=1,
        intra_threads=3,
    )


# One local helper for both language directions, with a bounded fallback on failure.
_helper = None
_retry_after = 0


def close_helper():
    global _helper
    if _helper is not None:
        _helper.terminate()
        try:
            _helper.wait(timeout=0.5)
        except subprocess.TimeoutExpired:
            _helper.kill()
            _helper.wait()
        _helper.stdin.close()
        _helper.stdout.close()
        _helper = None


atexit.register(close_helper)


def native_translation(text, source, target):
    global _helper, _retry_after
    binary = MODELS.parent / "local-translate"
    if time.monotonic() < _retry_after or not binary.is_file():
        return None
    try:
        if _helper is None:
            _helper = subprocess.Popen(
                [str(binary)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            )
        req = {"source": source, "target": target, "text": text}
        _helper.stdin.write(json.dumps(req, ensure_ascii=False).encode() + b"\n")
        _helper.stdin.flush()
        if not select.select([_helper.stdout], [], [], 3)[0]:
            raise TimeoutError()
        message = json.loads(_helper.stdout.readline())
        if message.get("text"):
            return message["text"]
    except (OSError, ValueError, TimeoutError):
        pass
    close_helper()
    _retry_after = time.monotonic() + 60
    return None


def translate(text, source, target):
    if source == target:
        return text
    with translation_lock:
        native = native_translation(text, source, target)
        if native:
            return native
        tok, model = pair(source, target)
        chunks = [x for x in re.split(r"(?<=[。！？.!?])\s*|\n+", text.strip()) if x]
        result = model.translate_batch(
            [tok.encode(x, out_type=str) for x in chunks],
            beam_size=4,
            max_decoding_length=350,
        )
        return (
            (" " if target == "en" else "")
            .join("".join(x.hypotheses[0]).replace("▁", " ").strip() for x in result)
            .strip()
        )


@lru_cache(maxsize=1)
def whisper():
    return WhisperModel(
        str(MODELS / "speech-small"),
        device="cpu",
        compute_type="int8",
        cpu_threads=4,
        local_files_only=True,
    )


def transcribe(pcm, lang, terms=""):
    samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768
    with speech_lock:
        segments, _ = whisper().transcribe(
            samples,
            language=lang,
            beam_size=3,
            hotwords=terms or None,
            condition_on_previous_text=False,
            temperature=0,
        )
        return " ".join(
            s.text.strip()
            for s in segments
            if s.no_speech_prob < 0.75 and s.text.strip()
        ).strip()
