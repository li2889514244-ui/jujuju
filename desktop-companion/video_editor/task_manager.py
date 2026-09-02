from __future__ import annotations

import os
import threading
import time
import uuid

from .engine import run_basic_edit, work_root
from .ffmpeg_runner import CancelledError, ProcessHandle
from .task_store import init_store, load_task, load_tasks, save_task

_tasks: dict[str, dict] = {}
_handles: dict[str, ProcessHandle] = {}
_lock = threading.RLock()
_heavy_lock = threading.Lock()

init_store()


def _persist(task_id: str) -> None:
    task = _tasks.get(task_id)
    if task:
        save_task(task)


def _update(task_id: str, **values) -> None:
    with _lock:
        task = _tasks.setdefault(task_id, {})
        task.update(values)
        _persist(task_id)


def start_basic_task(payload: dict) -> dict:
    task_id = f"ve_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    task_dir = os.path.join(work_root(), task_id)
    task = {
        "id": task_id,
        "mode": "basic",
        "status": "queued",
        "progress": 0,
        "current_step": "等待剪辑任务",
        "source_path": payload.get("source_path"),
        "output_path": None,
        "stats": {},
        "warnings": [],
        "task_dir": task_dir,
        "config": dict(payload or {}),
        "cancel_requested": False,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    with _lock:
        _tasks[task_id] = task
        save_task(task)
    threading.Thread(target=_run_basic_worker, args=(task_id, payload, task_dir), daemon=True).start()
    return {"task_id": task_id}


def start_advanced_analyze_task(payload: dict) -> dict:
    task_id = f"adv_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    task_dir = os.path.join(work_root(), task_id)
    task = {
        "id": task_id,
        "mode": "advanced",
        "status": "queued",
        "progress": 0,
        "current_step": "等待 AI 分析",
        "source_path": payload.get("source_path"),
        "output_path": None,
        "stats": {},
        "warnings": [],
        "task_dir": task_dir,
        "config": dict(payload or {}),
        "plan": {},
        "cancel_requested": False,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    with _lock:
        _tasks[task_id] = task
        save_task(task)
    threading.Thread(target=_run_advanced_analyze_worker, args=(task_id, payload, task_dir), daemon=True).start()
    return {"task_id": task_id}


def _run_basic_worker(task_id: str, payload: dict, task_dir: str) -> None:
    handle = ProcessHandle()
    _handles[task_id] = handle
    with _heavy_lock:
        if get_task(task_id).get("cancel_requested"):
            _update(task_id, status="cancelled", current_step="已取消", finished_at=time.strftime("%Y-%m-%d %H:%M:%S"))
            return

        def should_cancel():
            return bool(get_task(task_id).get("cancel_requested"))

        def progress(status, pct, step):
            if should_cancel():
                raise CancelledError("TASK_CANCELLED")
            _update(task_id, status=status, progress=pct, current_step=step)

        try:
            result = run_basic_edit(
                payload.get("source_path", ""),
                payload.get("pace", "compact"),
                payload.get("subtitle_template", "yellow"),
                payload.get("material_density", "normal"),
                payload.get("material_library"),
                task_dir,
                progress,
                process_handle=handle,
                should_cancel=should_cancel,
            )
            _update(task_id, status="done", progress=100, current_step="剪辑完成", output_path=result["output_path"], stats=result["stats"], warnings=result["warnings"], finished_at=time.strftime("%Y-%m-%d %H:%M:%S"))
        except (CancelledError, RuntimeError) as exc:
            status = "cancelled" if str(exc) == "TASK_CANCELLED" else "error"
            if status == "cancelled":
                _cleanup_partial_outputs(task_dir)
            _update(task_id, status=status, current_step="已取消" if status == "cancelled" else str(exc), error_code=str(exc).split(":")[0], error=str(exc), finished_at=time.strftime("%Y-%m-%d %H:%M:%S"))
        except Exception as exc:
            _update(task_id, status="error", current_step="剪辑失败", error_code=type(exc).__name__, error=str(exc), finished_at=time.strftime("%Y-%m-%d %H:%M:%S"))
        finally:
            _handles.pop(task_id, None)


def _run_advanced_analyze_worker(task_id: str, payload: dict, task_dir: str) -> None:
    try:
        from .advanced_engine import analyze_long_video

        def progress(status, pct, step):
            if get_task(task_id).get("cancel_requested"):
                raise CancelledError("TASK_CANCELLED")
            _update(task_id, status=status, progress=pct, current_step=step)

        result = analyze_long_video(
            payload.get("source_path", ""),
            task_dir,
            payload.get("instruction", ""),
            payload.get("duration_mode", "medium"),
            payload.get("style", "viral"),
            progress,
        )
        _update(task_id, status="awaiting_confirmation", progress=100, current_step="等待确认剪辑方案", plan=result["plan"], finished_at=time.strftime("%Y-%m-%d %H:%M:%S"))
    except CancelledError as exc:
        _update(task_id, status="cancelled", current_step="已取消", error_code=str(exc), error=str(exc), finished_at=time.strftime("%Y-%m-%d %H:%M:%S"))
    except Exception as exc:
        _update(task_id, status="error", current_step="AI 分析失败", error_code=type(exc).__name__, error=str(exc), finished_at=time.strftime("%Y-%m-%d %H:%M:%S"))


def patch_advanced_plan(task_id: str, patch: dict) -> dict:
    from .advanced_engine import patch_plan

    task = get_task(task_id)
    if not task:
        return {}
    plan = patch_plan(task.get("plan") or {}, patch or {})
    _update(task_id, plan=plan, status="awaiting_confirmation", current_step="等待确认剪辑方案")
    return get_task(task_id)


def start_advanced_render_task(task_id: str, options: dict) -> dict:
    task = get_task(task_id)
    if not task:
        raise RuntimeError("TASK_NOT_FOUND")
    with _lock:
        _tasks[task_id] = {**task, "cancel_requested": False}
    threading.Thread(target=_run_advanced_render_worker, args=(task_id, options or {}), daemon=True).start()
    return {"task_id": task_id}


def _run_advanced_render_worker(task_id: str, options: dict) -> None:
    handle = ProcessHandle()
    _handles[task_id] = handle
    with _heavy_lock:
        try:
            from .advanced_engine import render_advanced_plan

            task = get_task(task_id)
            task_dir = task.get("task_dir") or os.path.join(work_root(), task_id)

            def should_cancel():
                return bool(get_task(task_id).get("cancel_requested"))

            def progress(status, pct, step):
                if should_cancel():
                    raise CancelledError("TASK_CANCELLED")
                _update(task_id, status=status, progress=pct, current_step=step)

            _update(task_id, status="rendering", progress=5, current_step="正在重组选中片段")
            result = render_advanced_plan(task.get("source_path", ""), task_dir, task.get("plan") or {}, options, progress, handle, should_cancel)
            stats = dict(result.get("stats") or {})
            stats["used_clip_count"] = len([c for c in (task.get("plan") or {}).get("clips", []) if c.get("enabled", True)])
            _update(task_id, status="done", progress=100, current_step="高级剪辑完成", output_path=result["output_path"], stats=stats, warnings=result.get("warnings") or [], finished_at=time.strftime("%Y-%m-%d %H:%M:%S"))
        except (CancelledError, RuntimeError) as exc:
            status = "cancelled" if str(exc) == "TASK_CANCELLED" else "error"
            _update(task_id, status=status, current_step="已取消" if status == "cancelled" else str(exc), error_code=str(exc).split(":")[0], error=str(exc), finished_at=time.strftime("%Y-%m-%d %H:%M:%S"))
        except Exception as exc:
            _update(task_id, status="error", current_step="高级剪辑失败", error_code=type(exc).__name__, error=str(exc), finished_at=time.strftime("%Y-%m-%d %H:%M:%S"))
        finally:
            _handles.pop(task_id, None)


def _cleanup_partial_outputs(task_dir: str) -> None:
    for name in ("final.mp4", "advanced_compilation.mp4"):
        path = os.path.join(task_dir, name)
        if os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass


def get_task(task_id: str) -> dict:
    with _lock:
        if task_id in _tasks:
            return dict(_tasks[task_id])
    return load_task(task_id)


def list_tasks() -> list[dict]:
    persisted = load_tasks(20)
    with _lock:
        by_id = {t["id"]: t for t in persisted}
        by_id.update({k: dict(v) for k, v in _tasks.items()})
    return sorted(by_id.values(), key=lambda x: x.get("created_at", ""), reverse=True)[:20]


def cancel_task(task_id: str) -> dict:
    _update(task_id, cancel_requested=True)
    handle = _handles.get(task_id)
    if handle:
        handle.terminate()
    task = get_task(task_id)
    if task.get("status") == "queued":
        _update(task_id, status="cancelled", current_step="已取消", finished_at=time.strftime("%Y-%m-%d %H:%M:%S"))
    return get_task(task_id)
