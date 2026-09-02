from __future__ import annotations

import json
import os
import re
import subprocess

from .models import TimelineClip, VideoInfo
from .ffmpeg_runner import ProcessHandle, run_process
from .probe import get_ffmpeg_binary, probe_video
from .timeline import calculate_output_duration, normalize_timeline, validate_timeline

PACE_PRESETS = {
    "natural": {"min": 0.80, "short_max": 1.50, "short_keep": 0.35, "long_keep": 0.40},
    "compact": {"min": 0.55, "short_max": 1.20, "short_keep": 0.22, "long_keep": 0.25},
    "fast": {"min": 0.35, "short_max": 0.80, "short_keep": 0.12, "long_keep": 0.15},
}


def detect_silences(source_path: str, min_silence: float, noise_threshold: str = "-35dB") -> list[dict]:
    ffmpeg = get_ffmpeg_binary()
    if not ffmpeg:
        raise RuntimeError("FFMPEG_MISSING")
    cmd = [ffmpeg, "-hide_banner", "-i", source_path, "-af", f"silencedetect=n={noise_threshold}:d={min_silence}", "-f", "null", "-"]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=1800)
    text = (result.stderr or "") + "\n" + (result.stdout or "")
    starts = [float(x) for x in re.findall(r"silence_start:\s*([0-9.]+)", text)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*([0-9.]+)", text)]
    silences = []
    for start, end in zip(starts, ends):
        if end > start:
            silences.append({"start": start, "end": end, "duration": end - start})
    return silences


def build_silence_timeline(source_duration: float, silences: list[dict], pace: str = "compact") -> list[TimelineClip]:
    preset = PACE_PRESETS.get(pace) or PACE_PRESETS["compact"]
    remove_ranges: list[tuple[float, float, str]] = []
    guard = 0.04
    for silence in silences:
        start = max(0.0, float(silence["start"]))
        end = min(source_duration, float(silence["end"]))
        duration = end - start
        if duration < preset["min"]:
            continue
        keep = preset["short_keep"] if duration <= preset["short_max"] else preset["long_keep"]
        if start <= 0.05 or end >= source_duration - 0.05:
            keep = min(max(keep, 0.2), duration)
            if start <= 0.05:
                remove_ranges.append((start + keep, max(start + keep, end - guard), "leading_silence"))
            else:
                remove_ranges.append((min(end - keep, start + guard), end, "trailing_silence"))
            continue
        remove_len = max(0.0, duration - keep)
        if remove_len <= 0.01:
            continue
        keep_start = start + (duration - keep) / 2
        keep_end = keep_start + keep
        remove_ranges.append((start + guard, max(start + guard, keep_start), "long_silence"))
        remove_ranges.append((min(keep_end, end - guard), end - guard, "long_silence"))

    clips: list[TimelineClip] = []
    cursor = 0.0
    for start, end, reason in sorted(remove_ranges):
        if end <= start:
            continue
        if start > cursor:
            clips.append(TimelineClip(cursor, start, "keep", "speech"))
        clips.append(TimelineClip(start, end, "remove", reason))
        cursor = max(cursor, end)
    if cursor < source_duration:
        clips.append(TimelineClip(cursor, source_duration, "keep", "speech"))
    clips = normalize_timeline(clips)
    validate_timeline(clips, source_duration)
    return clips


def render_timeline(source_path: str, output_path: str, clips: list[TimelineClip], info: VideoInfo | None = None, process_handle: ProcessHandle | None = None, should_cancel=None) -> None:
    ffmpeg = get_ffmpeg_binary()
    if not ffmpeg:
        raise RuntimeError("FFMPEG_MISSING")
    info = info or probe_video(source_path)
    keeps = [c for c in clips if c.action == "keep"]
    if not keeps:
        raise RuntimeError("NO_KEEP_CLIPS")
    parts = []
    labels = []
    for idx, clip in enumerate(keeps):
        parts.append(f"[0:v]trim=start={clip.source_start:.3f}:end={clip.source_end:.3f},setpts=PTS-STARTPTS[v{idx}]")
        if info.has_audio:
            parts.append(f"[0:a]atrim=start={clip.source_start:.3f}:end={clip.source_end:.3f},asetpts=PTS-STARTPTS[a{idx}]")
            labels.append(f"[v{idx}][a{idx}]")
        else:
            labels.append(f"[v{idx}]")
    concat = "".join(labels) + f"concat=n={len(keeps)}:v=1:a={1 if info.has_audio else 0}[outv]" + ("[outa]" if info.has_audio else "")
    filter_complex = ";".join(parts + [concat])
    cmd = [ffmpeg, "-y", "-i", source_path, "-filter_complex", filter_complex, "-map", "[outv]"]
    if info.has_audio:
        cmd += ["-map", "[outa]", "-c:a", "aac", "-b:a", "192k"]
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(info.fps or 30), output_path]
    result = run_process(cmd, timeout=7200, handle=process_handle, should_cancel=should_cancel)
    if result.returncode != 0:
        raise RuntimeError("FFMPEG_RENDER_FAILED")


def cut_silence(source_path: str, work_dir: str, pace: str = "compact", noise_threshold: str = "-35dB", process_handle: ProcessHandle | None = None, should_cancel=None) -> dict:
    os.makedirs(work_dir, exist_ok=True)
    info = probe_video(source_path)
    preset = PACE_PRESETS.get(pace) or PACE_PRESETS["compact"]
    silences = detect_silences(source_path, preset["min"], noise_threshold)
    timeline = build_silence_timeline(info.duration, silences, pace)
    output_path = os.path.join(work_dir, "rough_cut.mp4")
    render_timeline(source_path, output_path, timeline, info, process_handle, should_cancel)
    output_duration = calculate_output_duration(timeline)
    plan = {
        "source_duration": info.duration,
        "output_duration": output_duration,
        "removed_duration": round(info.duration - output_duration, 3),
        "preset": pace,
        "silence_count": len(silences),
        "timeline": [c.to_dict() for c in timeline],
    }
    with open(os.path.join(work_dir, "silence_plan.json"), "w", encoding="utf-8") as f:
        json.dump(plan, f, ensure_ascii=False, indent=2)
    return {"output_path": output_path, "plan": plan, "video_info": info.to_dict()}
