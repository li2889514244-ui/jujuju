from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path


def default_model_dir() -> str:
    return os.environ.get(
        "MODEL_DIR",
        os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "MatrixFlow", "models", "faster-whisper-small"),
    )


def cached_whisper_cli_model() -> str | None:
    cache_dir = Path(os.environ.get("WHISPER_CACHE_DIR") or Path.home() / ".cache" / "whisper")
    preferred = [os.environ["WHISPER_MODEL"]] if os.environ.get("WHISPER_MODEL") else []
    for name in preferred + ["small", "base", "tiny"]:
        if (cache_dir / f"{name}.pt").is_file():
            return name
    return None


def _save_transcript(data: dict, work_dir: str) -> dict:
    os.makedirs(work_dir, exist_ok=True)
    with open(os.path.join(work_dir, "transcript.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return data


def _normalize_cli_transcript(raw: dict, language: str) -> dict:
    out_segments = []
    for segment in raw.get("segments") or []:
        start = float(segment.get("start") or 0)
        end = float(segment.get("end") or start)
        words = []
        for word in segment.get("words") or []:
            token = str(word.get("word") or "").strip()
            if token:
                words.append({
                    "start": float(word.get("start") or start),
                    "end": float(word.get("end") or end),
                    "word": token,
                })
        text = str(segment.get("text") or "").strip()
        if text or words:
            out_segments.append({"start": start, "end": end, "text": text, "words": words})
    duration = max([float(s.get("end") or 0) for s in out_segments] or [0.0])
    return {"status": "ok", "language": raw.get("language") or language, "duration": duration, "segments": out_segments}


def _transcribe_with_cached_whisper_cli(source_path: str, work_dir: str, language: str) -> dict | None:
    whisper = shutil.which("whisper")
    model = cached_whisper_cli_model()
    if not whisper or not model:
        return None
    os.makedirs(work_dir, exist_ok=True)
    cmd = [
        whisper,
        source_path,
        "--language",
        language,
        "--model",
        model,
        "--output_format",
        "json",
        "--output_dir",
        work_dir,
        "--word_timestamps",
        "True",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=3600)
    except subprocess.TimeoutExpired:
        return {"status": "ASR_TIMEOUT", "model": model, "segments": [], "language": language, "duration": 0}
    if result.returncode != 0:
        return {"status": "ASR_FAILED", "model": model, "error": (result.stderr or result.stdout or "")[-500:], "segments": [], "language": language, "duration": 0}
    expected = Path(work_dir) / (Path(source_path).stem + ".json")
    candidates = [expected] if expected.is_file() else sorted(Path(work_dir).glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    for path in candidates:
        if path.name == "transcript.json":
            continue
        try:
            data = _normalize_cli_transcript(json.loads(path.read_text(encoding="utf-8")), language)
            data["engine"] = f"whisper-cli:{model}"
            return _save_transcript(data, work_dir)
        except Exception:
            continue
    return {"status": "ASR_FAILED", "model": model, "segments": [], "language": language, "duration": 0}


def transcribe_video(source_path: str, work_dir: str, language: str = "zh", model_dir: str | None = None) -> dict:
    model_path = model_dir or default_model_dir()
    if not os.path.isdir(model_path):
        return _transcribe_with_cached_whisper_cli(source_path, work_dir, language) or {"status": "MODEL_REQUIRED", "model_dir": model_path, "segments": [], "language": language, "duration": 0}
    try:
        from faster_whisper import WhisperModel
    except Exception:
        return _transcribe_with_cached_whisper_cli(source_path, work_dir, language) or {"status": "MODEL_REQUIRED", "model_dir": model_path, "segments": [], "language": language, "duration": 0}

    try:
        import torch
        cuda = bool(torch.cuda.is_available())
    except Exception:
        cuda = False
    try:
        model = WhisperModel(model_path, device="cuda" if cuda else "cpu", compute_type="float16" if cuda else "int8")
        segments, info = model.transcribe(source_path, language=language, beam_size=5, word_timestamps=True)
        out_segments = []
        for segment in segments:
            words = [
                {"start": float(w.start or segment.start), "end": float(w.end or segment.end), "word": str(w.word or "").strip()}
                for w in (segment.words or [])
                if str(w.word or "").strip()
            ]
            out_segments.append({"start": float(segment.start), "end": float(segment.end), "text": segment.text.strip(), "words": words})
    except Exception as exc:
        return _transcribe_with_cached_whisper_cli(source_path, work_dir, language) or {"status": "ASR_FAILED", "model_dir": model_path, "error": str(exc)[-500:], "segments": [], "language": language, "duration": 0}
    data = {"status": "ok", "engine": "faster-whisper", "language": getattr(info, "language", language) or language, "duration": float(getattr(info, "duration", 0) or 0), "segments": out_segments}
    return _save_transcript(data, work_dir)
