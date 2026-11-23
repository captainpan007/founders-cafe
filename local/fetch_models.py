"""Download only the two Argos translation pairs and the pinned Whisper small model."""

import hashlib
import json
import shutil
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / ".runtime" / "models"
REV = "536b0662742c02347bc0e980a01041f333bce120"


def digest(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def fetch(url, path):
    path.parent.mkdir(exist_ok=True, parents=True)
    tmp = path.with_suffix(".partial")
    expected_file = ROOT / "local" / "model_hashes.json"
    expected = json.loads(expected_file.read_text())[url]

    def matches(p):
        return p.is_file() and digest(p) == expected

    if matches(path):
        return
    subprocess.run(
        ["curl", "-fLsS", "--retry", "1", "--max-time", "160", "-o", str(tmp), url],
        check=True,
    )
    if not matches(tmp):
        raise ValueError("Model download failed integrity check")
    tmp.replace(path)


def main():
    from concurrent.futures import ThreadPoolExecutor

    jobs = []
    for pair in ["en_zh", "zh_en"]:
        url = f"https://argos-net.com/v1/translate-{pair}-1_9.argosmodel"
        jobs.append((url, MODELS / f"{pair}.zip"))
    for file in ["config.json", "model.bin", "tokenizer.json", "vocabulary.txt"]:
        jobs.append(
            (
                f"https://huggingface.co/Systran/faster-whisper-small/resolve/{REV}/{file}",
                MODELS / "speech-small" / file,
            )
        )
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda job: fetch(*job), jobs))
    for pair in ["en_zh", "zh_en"]:
        with zipfile.ZipFile(MODELS / f"{pair}.zip") as z:
            for name in z.namelist():
                parts = Path(name).parts[1:]
                if (
                    not parts
                    or z.getinfo(name).is_dir()
                    or any(p in ("..", "/") for p in parts)
                ):
                    continue
                if parts[0] not in (
                    "model",
                    "sentencepiece.model",
                    "metadata.json",
                    "LICENSE",
                    "README.md",
                    "bpe.model",
                ):
                    continue
                dest = MODELS / pair / Path(*parts)
                dest.parent.mkdir(parents=True, exist_ok=True)
                with z.open(name) as src, dest.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
    print(
        json.dumps(
            {u: digest(p) for u, p in jobs},
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
