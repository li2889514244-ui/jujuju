from __future__ import annotations

import json
import os
import time
import uuid
import shutil
from pathlib import Path

from .material_library import scan_materials
from .material_matcher import match_materials
from .renderer import burn_subtitles
from .silence_editor import cut_silence
from .subtitle_engine import generate_captions
from .transcription import transcribe_video


def work_root() -> str:
    return os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "MatrixFlow", "video-editor")


def export_root() -> str:
    return os.path.join(str(Path.home()), "Videos", "Pixingyun", "Exports")


def _safe_name(value: str) -> str:
    keep = []
    for ch in value:
        keep.append(ch if ch not in '\\/:*?"<>|' else "_")
    return "".join(keep).strip(" .")[:80] or "Pixingyun_AI"


def run_basic_edit(source_path: str, pace: str = "compact", subtitle_template: str = "yellow", material_density: str = "normal", material_library: str | None = None, task_dir: str | None = None, progress=None, process_handle=None, should_cancel=None, title_prefix: str | None = None) -> dict:
    start = time.time()
    warnings: list[str] = []
    task_dir = task_dir or os.path.join(work_root(), f"basic_{uuid.uuid4().hex[:10]}")
    os.makedirs(task_dir, exist_ok=True)
    if progress:
        progress("cutting_silence", 15, "正在剪掉气口")
    rough = cut_silence(source_path, task_dir, pace, process_handle=process_handle, should_cancel=should_cancel)
    rough_path = rough["output_path"]
    if progress:
        progress("transcribing", 42, "正在识别字幕")
    transcript = transcribe_video(rough_path, task_dir)
    if transcript.get("status") == "ok":
        if progress:
            progress("subtitles", 60, "正在生成字幕")
        captions = generate_captions(transcript, task_dir, subtitle_template)
    else:
        warnings.append(transcript.get("status") or "ASR_FAILED")
        captions = {"segments": [], "srt_path": None, "ass_path": None, "subtitle_count": 0}
    if progress:
        progress("materials", 72, "正在匹配本地素材")
    materials = scan_materials(material_library)
    inserts = match_materials(captions["segments"], materials, material_density) if captions["segments"] else []
    if material_density != "off" and not materials:
        warnings.append("MATERIAL_LIBRARY_EMPTY")
    with open(os.path.join(task_dir, "materials.json"), "w", encoding="utf-8") as f:
        json.dump({"library": material_library, "materials": materials, "inserts": [i.to_dict() for i in inserts]}, f, ensure_ascii=False, indent=2)
    if progress:
        progress("rendering", 88, "正在合成 MP4")
    final_path = os.path.join(task_dir, "final.mp4")
    render = burn_subtitles(rough_path, captions["ass_path"], final_path, inserts, process_handle=process_handle, should_cancel=should_cancel)
    os.makedirs(export_root(), exist_ok=True)
    source_stem = _safe_name(title_prefix or os.path.splitext(os.path.basename(source_path))[0])
    export_name = f"{source_stem}_AI基础_{time.strftime('%Y%m%d_%H%M%S')}.mp4"
    export_path = os.path.join(export_root(), export_name)
    shutil.copy2(final_path, export_path)
    stats = {
        "source_duration": rough["plan"]["source_duration"],
        "output_duration": rough["plan"]["output_duration"],
        "removed_silence": rough["plan"]["removed_duration"],
        "subtitle_count": captions["subtitle_count"],
        "material_count": render.get("material_count", 0),
        "processing_seconds": round(time.time() - start, 2),
        **render,
        "internal_output_path": final_path,
        "output_path": export_path,
    }
    warnings = list(dict.fromkeys(warnings))
    with open(os.path.join(task_dir, "result.json"), "w", encoding="utf-8") as f:
        json.dump({"stats": stats, "warnings": warnings}, f, ensure_ascii=False, indent=2)
    return {"task_dir": task_dir, "output_path": export_path, "stats": stats, "warnings": warnings}
