from __future__ import annotations

import os
import shutil
import uuid
import subprocess

from .ffmpeg_runner import ProcessHandle, run_process
from .models import MaterialInsert
from .probe import get_ffmpeg_binary, get_ffprobe_binary, probe_video


def check_disk_space(source_path: str, output_dir: str) -> None:
    source_size = os.path.getsize(source_path)
    free = shutil.disk_usage(output_dir).free
    required = max(int(source_size * 2.5), 512 * 1024 * 1024)
    if free < required:
        raise RuntimeError("DISK_SPACE_LOW")


def _escape_filter_path(path: str) -> str:
    return path.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


def _is_image(path: str) -> bool:
    return os.path.splitext(path)[1].lower() in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def _valid_material(raw) -> MaterialInsert | None:
    try:
        item = raw if isinstance(raw, MaterialInsert) else MaterialInsert(**raw)
    except Exception:
        return None
    if item.end <= item.start or not os.path.isfile(item.source_path):
        return None
    ffprobe = get_ffprobe_binary()
    if ffprobe:
        try:
            result = subprocess.run([ffprobe, "-v", "error", "-show_streams", item.source_path], capture_output=True, text=True, timeout=20)
            if result.returncode != 0:
                return None
        except Exception:
            return None
    return item


def burn_subtitles(source_path: str, ass_path: str | None, output_path: str, materials: list[MaterialInsert | dict] | None = None, process_handle: ProcessHandle | None = None, should_cancel=None) -> dict:
    ffmpeg = get_ffmpeg_binary()
    if not ffmpeg:
        raise RuntimeError("FFMPEG_MISSING")
    out_dir = os.path.dirname(output_path) or "."
    os.makedirs(out_dir, exist_ok=True)
    check_disk_space(source_path, out_dir)
    info = probe_video(source_path)
    valid_materials = [_valid_material(m) for m in (materials or [])]
    valid_materials = [m for m in valid_materials if m is not None]
    cmd = [ffmpeg, "-y", "-i", source_path]
    for item in valid_materials:
        if _is_image(item.source_path):
            cmd += ["-loop", "1", "-t", f"{item.end - item.start:.3f}", "-i", item.source_path]
        else:
            cmd += ["-ss", "0", "-t", f"{item.end - item.start:.3f}", "-i", item.source_path]

    filters = ["[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[base0]"]
    current = "base0"
    successful_materials = []
    for idx, item in enumerate(valid_materials, 1):
        dur = item.end - item.start
        scaled = f"mat{idx}"
        out = f"base{idx}"
        filters.append(f"[{idx}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,setpts=PTS-STARTPTS+{item.start:.3f}/TB[{scaled}]")
        filters.append(f"[{current}][{scaled}]overlay=0:0:enable='between(t,{item.start:.3f},{item.end:.3f})'[{out}]")
        current = out
        successful_materials.append(item)
    if ass_path and os.path.isfile(ass_path):
        filters.append(f"[{current}]ass='{_escape_filter_path(ass_path)}'[outv]")
    else:
        filters.append(f"[{current}]null[outv]")

    cmd += ["-filter_complex", ";".join(filters), "-map", "[outv]", "-map", "0:a?"]
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(info.fps or 30), "-c:a", "aac", "-b:a", "192k", "-shortest", output_path]
    tmp_output = output_path + f".{uuid.uuid4().hex[:6]}.tmp.mp4"
    cmd[-1] = tmp_output
    result = run_process(cmd, timeout=7200, handle=process_handle, should_cancel=should_cancel)
    if result.returncode != 0:
        if os.path.exists(tmp_output):
            try:
                os.remove(tmp_output)
            except OSError:
                pass
        raise RuntimeError("FFMPEG_RENDER_FAILED")
    os.replace(tmp_output, output_path)
    final = probe_video(output_path)
    return {"output_path": output_path, "final_resolution": f"{final.width}x{final.height}", "final_fps": final.fps, "final_file_size": os.path.getsize(output_path), "material_count": len(successful_materials)}
