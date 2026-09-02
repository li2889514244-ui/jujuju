from __future__ import annotations

import json
import shutil
import subprocess

from .models import VideoInfo


def get_ffmpeg_binary() -> str | None:
    return shutil.which("ffmpeg")


def get_ffprobe_binary() -> str | None:
    return shutil.which("ffprobe")


def probe_video(path: str) -> VideoInfo:
    ffprobe = get_ffprobe_binary()
    if not ffprobe:
        raise RuntimeError("FFPROBE_MISSING")
    cmd = [
        ffprobe,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
    if result.returncode != 0:
        raise RuntimeError("FFPROBE_FAILED")
    data = json.loads(result.stdout or "{}")
    streams = data.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio = next((s for s in streams if s.get("codec_type") == "audio"), {})
    fps = 30.0
    rate = video.get("avg_frame_rate") or video.get("r_frame_rate") or ""
    if "/" in rate:
        num, den = rate.split("/", 1)
        try:
            fps = float(num) / float(den or 1)
        except Exception:
            fps = 30.0
    return VideoInfo(
        path=path,
        duration=float((data.get("format") or {}).get("duration") or 0),
        width=int(video.get("width") or 0),
        height=int(video.get("height") or 0),
        fps=round(fps or 30.0, 3),
        video_codec=str(video.get("codec_name") or ""),
        audio_codec=str(audio.get("codec_name") or ""),
        has_audio=bool(audio),
    )
