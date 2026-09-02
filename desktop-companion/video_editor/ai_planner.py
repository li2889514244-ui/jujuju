from __future__ import annotations

from .models import AdvancedEditPlan, EditPlanClip


def fallback_plan_from_transcript(transcript: dict, instruction: str = "", target_duration: float = 120.0, style: str = "viral") -> AdvancedEditPlan:
    clips: list[EditPlanClip] = []
    total = 0.0
    for idx, seg in enumerate(transcript.get("segments") or []):
        dur = float(seg.get("end") or 0) - float(seg.get("start") or 0)
        if dur <= 0:
            continue
        clips.append(EditPlanClip(f"clip_{idx+1}", float(seg.get("start") or 0), float(seg.get("end") or 0), str(seg.get("text") or ""), "main", "fallback transcript order", True, len(clips) + 1))
        total += dur
        if total >= target_duration:
            break
    return AdvancedEditPlan(instruction[:40] or "AI剪辑方案", "按原片语义顺序选择片段", total, clips, style, target_duration)
