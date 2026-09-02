from __future__ import annotations

import json
import os
import uuid

from .deepseek_client import call_deepseek_json
from .engine import run_basic_edit
from .models import AdvancedEditPlan, EditPlanClip, TimelineClip
from .probe import probe_video
from .silence_editor import render_timeline
from .transcription import transcribe_video


def analyze_long_video(source_path: str, work_dir: str, instruction: str, duration_mode: str = "medium", style: str = "viral", progress=None) -> dict:
    os.makedirs(work_dir, exist_ok=True)
    if progress:
        progress("transcribing", 15, "正在完整转录长视频")
    transcript = transcribe_video(source_path, work_dir)
    if transcript.get("status") != "ok":
        raise RuntimeError(transcript.get("status") or "ASR_FAILED")
    with open(os.path.join(work_dir, "full_transcript.json"), "w", encoding="utf-8") as f:
        json.dump(transcript, f, ensure_ascii=False, indent=2)
    if progress:
        progress("analyzing", 45, "正在分析候选片段")
    candidates = stage_a_candidates(transcript)
    with open(os.path.join(work_dir, "stage_a_candidates.json"), "w", encoding="utf-8") as f:
        json.dump(candidates, f, ensure_ascii=False, indent=2)
    if progress:
        progress("planning", 78, "正在生成剪辑方案")
    target = {"short": 60.0, "medium": 120.0, "long": 180.0}.get(duration_mode, 120.0)
    plan = stage_b_plan(candidates, instruction, target, style, transcript)
    path = os.path.join(work_dir, "advanced_plan.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(plan.to_dict(), f, ensure_ascii=False, indent=2)
    return {"plan": plan.to_dict(), "plan_path": path, "transcript_path": os.path.join(work_dir, "full_transcript.json")}


def stage_a_candidates(transcript: dict) -> list[dict]:
    segments = transcript.get("segments") or []
    candidates: list[dict] = []
    for chunk in _chunks(segments):
        prompt = (
            "从下面原片字幕中找强观点、冲突句、金句、故事、案例、解释、结论。"
            "只返回 JSON 数组，字段 start/end/text/theme/type/score。text 必须来自原片，不要改写。\n"
            f"字幕：{chunk}"
        )
        try:
            data = call_deepseek_json(prompt, model="deepseek-v4-pro", retries=2)
            if isinstance(data, list):
                candidates.extend(_validate_candidates(data, segments))
        except Exception:
            candidates.extend(_fallback_candidates(chunk))
    return sorted(candidates, key=lambda x: float(x.get("score", 0)), reverse=True)[:80]


def stage_b_plan(candidates: list[dict], instruction: str, target_duration: float, style: str, transcript: dict) -> AdvancedEditPlan:
    prompt = (
        "根据候选片段和用户要求生成短视频剪辑方案。只返回合法 JSON 对象："
        "title, summary, estimated_duration, clips。clips 字段包含 source_start/source_end/text/role/reason/order/enabled。"
        "不要编造原话，text 必须使用候选片段原文。\n"
        f"用户要求：{instruction}\n目标时长：{target_duration}\n风格：{style}\n候选：{candidates[:60]}"
    )
    try:
        data = call_deepseek_json(prompt, model="deepseek-v4-pro", retries=2)
        if not isinstance(data, dict):
            raise ValueError("bad plan")
        clips = []
        for idx, item in enumerate(data.get("clips") or []):
            start = float(item.get("source_start", item.get("start", 0)) or 0)
            end = float(item.get("source_end", item.get("end", 0)) or 0)
            text = _text_for_range(transcript, start, end) or str(item.get("text") or "")
            if end > start and text:
                clips.append(EditPlanClip(str(item.get("id") or f"clip_{idx+1}"), start, end, text, str(item.get("role") or "main"), str(item.get("reason") or ""), bool(item.get("enabled", True)), int(item.get("order") or idx + 1)))
        if clips:
            return AdvancedEditPlan(str(data.get("title") or instruction[:40] or "AI高级剪辑"), str(data.get("summary") or ""), sum(c.source_end - c.source_start for c in clips if c.enabled), clips, style, target_duration)
    except Exception:
        pass
    clips = []
    total = 0.0
    for idx, item in enumerate(candidates):
        start, end = float(item["start"]), float(item["end"])
        text = _text_for_range(transcript, start, end) or str(item.get("text") or "")
        clips.append(EditPlanClip(f"clip_{idx+1}", start, end, text, str(item.get("type") or "main"), str(item.get("theme") or ""), True, idx + 1))
        total += end - start
        if total >= target_duration:
            break
    return AdvancedEditPlan(instruction[:40] or "AI高级剪辑", "按候选片段评分自动生成", total, clips, style, target_duration)


def render_advanced_plan(source_path: str, work_dir: str, plan: dict, basic_options: dict, progress=None, process_handle=None, should_cancel=None) -> dict:
    enabled = [c for c in (plan.get("clips") or []) if c.get("enabled", True)]
    enabled.sort(key=lambda x: int(x.get("order") or 0))
    clips = [TimelineClip(float(c["source_start"]), float(c["source_end"]), "keep", c.get("role", "selected")) for c in enabled]
    if not clips:
        raise RuntimeError("NO_ENABLED_CLIPS")
    compilation = os.path.join(work_dir, "advanced_compilation.mp4")
    render_timeline(source_path, compilation, clips, probe_video(source_path), process_handle, should_cancel)
    return run_basic_edit(
        compilation,
        basic_options.get("pace", "compact"),
        basic_options.get("subtitle_template", "yellow"),
        basic_options.get("material_density", "normal"),
        basic_options.get("material_library"),
        os.path.join(work_dir, "basic_package"),
        progress,
        process_handle,
        should_cancel,
        title_prefix=plan.get("title") or os.path.splitext(os.path.basename(source_path))[0],
    )


def patch_plan(plan: dict, patch: dict) -> dict:
    out = dict(plan or {})
    if "title" in patch:
        out["title"] = str(patch["title"])[:120]
    changes = {str(c.get("id")): c for c in patch.get("clips", []) if isinstance(c, dict)}
    clips = []
    for clip in out.get("clips") or []:
        item = dict(clip)
        change = changes.get(str(item.get("id")))
        if change:
            if "enabled" in change:
                item["enabled"] = bool(change["enabled"])
            if "order" in change:
                item["order"] = int(change["order"])
        clips.append(item)
    out["clips"] = sorted(clips, key=lambda x: int(x.get("order") or 0))
    out["estimated_duration"] = sum(float(c["source_end"]) - float(c["source_start"]) for c in out["clips"] if c.get("enabled", True))
    return out


def _chunks(segments: list[dict]) -> list[list[dict]]:
    chunks, current, chars, start = [], [], 0, None
    for seg in segments:
        if start is None:
            start = float(seg.get("start") or 0)
        current.append({"start": seg.get("start"), "end": seg.get("end"), "text": seg.get("text")})
        chars += len(str(seg.get("text") or ""))
        if chars >= 2000 or float(seg.get("end") or 0) - start >= 480:
            chunks.append(current)
            current, chars, start = [], 0, None
    if current:
        chunks.append(current)
    return chunks


def _validate_candidates(items: list[dict], segments: list[dict]) -> list[dict]:
    valid = []
    for item in items:
        try:
            start, end = float(item.get("start")), float(item.get("end"))
        except Exception:
            continue
        text = _text_for_range({"segments": segments}, start, end)
        if not text:
            continue
        valid.append({"start": start, "end": end, "text": text, "theme": str(item.get("theme") or ""), "type": str(item.get("type") or "main"), "score": int(item.get("score") or 60)})
    return valid


def _fallback_candidates(chunk: list[dict]) -> list[dict]:
    return [{"start": float(s.get("start") or 0), "end": float(s.get("end") or 0), "text": str(s.get("text") or ""), "theme": "原片重点", "type": "main", "score": 60} for s in chunk[:8] if s.get("text")]


def _text_for_range(transcript: dict, start: float, end: float) -> str:
    texts = [str(s.get("text") or "").strip() for s in transcript.get("segments") or [] if float(s.get("start") or 0) < end and float(s.get("end") or 0) > start]
    return "".join(texts).strip()
