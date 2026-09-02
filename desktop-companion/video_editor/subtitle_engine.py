from __future__ import annotations

import os
import re

from .models import SubtitleSegment

PUNCT = set("，。！？；；,.!?")


def build_subtitle_segments(transcript: dict, max_chars: int = 22) -> list[SubtitleSegment]:
    result: list[SubtitleSegment] = []
    for segment in transcript.get("segments") or []:
        words = segment.get("words") or []
        if not words:
            text = str(segment.get("text") or "").strip()
            if text:
                result.append(SubtitleSegment(float(segment.get("start") or 0), float(segment.get("end") or 0), text[:max_chars], []))
            continue
        bucket: list[dict] = []
        text = ""
        for word in words:
            token = str(word.get("word") or "").strip()
            if not token:
                continue
            bucket.append(word)
            text += token
            should_break = len(re.sub(r"\s+", "", text)) >= max_chars or token[-1:] in PUNCT
            if should_break:
                result.append(_segment_from_words(bucket))
                bucket, text = [], ""
        if bucket:
            result.append(_segment_from_words(bucket))
    for idx in range(1, len(result)):
        if result[idx].start < result[idx - 1].end:
            result[idx].start = result[idx - 1].end
        if result[idx].end - result[idx].start < 0.5:
            result[idx].end = result[idx].start + 0.5
    return result


def _segment_from_words(words: list[dict]) -> SubtitleSegment:
    text = "".join(str(w.get("word") or "").strip() for w in words).strip()
    return SubtitleSegment(float(words[0].get("start") or 0), float(words[-1].get("end") or 0), text, words)


def _srt_time(value: float) -> str:
    ms = int(round(float(value) * 1000))
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, ms = divmod(rem, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def write_srt(segments: list[SubtitleSegment], path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for idx, seg in enumerate(segments, 1):
            f.write(f"{idx}\n{_srt_time(seg.start)} --> {_srt_time(seg.end)}\n{seg.text}\n\n")


def _ass_time(value: float) -> str:
    cs = int(round(float(value) * 100))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02}:{s:02}.{cs:02}"


def write_ass(segments: list[SubtitleSegment], path: str, template: str = "yellow") -> None:
    styles = {
        "minimal": ("Microsoft YaHei", 64, "&H00FFFFFF", "&H00000000", 220),
        "yellow": ("Microsoft YaHei", 66, "&H00FFFFFF", "&H00000000", 220),
        "business": ("Microsoft YaHei", 62, "&H00FFFFFF", "&H00000000", 240),
        "emotion": ("Microsoft YaHei", 68, "&H00FFFFFF", "&H00000000", 260),
    }
    font, size, color, outline, margin = styles.get(template, styles["yellow"])
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font},{size},{color},&H000000FF,{outline},&H00000000,1,0,0,0,100,100,0,0,1,4,0,2,60,60,{margin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(header)
        for seg in segments:
            f.write(f"Dialogue: 0,{_ass_time(seg.start)},{_ass_time(seg.end)},Default,,0,0,0,,{seg.text}\n")


def generate_captions(transcript: dict, work_dir: str, template: str = "yellow") -> dict:
    os.makedirs(work_dir, exist_ok=True)
    segments = build_subtitle_segments(transcript)
    srt = os.path.join(work_dir, "captions.srt")
    ass = os.path.join(work_dir, "captions.ass")
    write_srt(segments, srt)
    write_ass(segments, ass, template)
    return {"segments": [s.to_dict() for s in segments], "srt_path": srt, "ass_path": ass, "subtitle_count": len(segments)}
