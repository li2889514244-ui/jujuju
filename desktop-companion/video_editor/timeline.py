from __future__ import annotations

from .models import TimelineClip


def normalize_timeline(clips: list[TimelineClip | dict]) -> list[TimelineClip]:
    normalized: list[TimelineClip] = []
    for item in clips or []:
        clip = item if isinstance(item, TimelineClip) else TimelineClip(**item)
        action = str(clip.action or "").strip().lower()
        if action not in {"keep", "remove"}:
            raise ValueError(f"INVALID_TIMELINE_ACTION:{action}")
        normalized.append(
            TimelineClip(
                source_start=round(float(clip.source_start), 3),
                source_end=round(float(clip.source_end), 3),
                action=action,
                reason=str(clip.reason or ""),
            )
        )
    normalized.sort(key=lambda c: (c.source_start, c.source_end))
    return merge_adjacent_clips(normalized)


def merge_adjacent_clips(clips: list[TimelineClip], gap_tolerance: float = 0.015) -> list[TimelineClip]:
    merged: list[TimelineClip] = []
    for clip in clips:
        if not merged:
            merged.append(clip)
            continue
        prev = merged[-1]
        if prev.action == clip.action and prev.reason == clip.reason and abs(prev.source_end - clip.source_start) <= gap_tolerance:
            prev.source_end = max(prev.source_end, clip.source_end)
        else:
            merged.append(clip)
    return merged


def validate_timeline(clips: list[TimelineClip], source_duration: float) -> None:
    last_end = 0.0
    for clip in clips:
        if clip.source_start < -0.001 or clip.source_end < -0.001:
            raise ValueError("INVALID_TIMELINE_NEGATIVE_TIME")
        if clip.source_end <= clip.source_start:
            raise ValueError("INVALID_TIMELINE_RANGE")
        if clip.source_end > source_duration + 0.05:
            raise ValueError("INVALID_TIMELINE_OVER_SOURCE_DURATION")
        if clip.source_start < last_end - 0.05:
            raise ValueError("INVALID_TIMELINE_OVERLAP")
        last_end = max(last_end, clip.source_end)


def calculate_output_duration(clips: list[TimelineClip]) -> float:
    return round(sum(c.source_end - c.source_start for c in clips if c.action == "keep"), 3)
