from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

DB_ROOT = Path.home() / "AppData" / "Local" / "MatrixFlow" / "browser-profiles"
DB_PATH = DB_ROOT / "accounts.db"


def _conn() -> sqlite3.Connection:
    DB_ROOT.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS video_edit_tasks (
            id TEXT PRIMARY KEY,
            mode TEXT NOT NULL,
            source_path TEXT DEFAULT '',
            status TEXT DEFAULT 'queued',
            progress INTEGER DEFAULT 0,
            current_step TEXT DEFAULT '',
            config_json TEXT DEFAULT '{}',
            plan_json TEXT DEFAULT '{}',
            result_json TEXT DEFAULT '{}',
            output_path TEXT DEFAULT '',
            error_code TEXT DEFAULT '',
            error_message TEXT DEFAULT '',
            created_at TEXT DEFAULT '',
            updated_at TEXT DEFAULT '',
            finished_at TEXT DEFAULT ''
        )
        """
    )
    return conn


def init_store() -> None:
    conn = _conn()
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        """UPDATE video_edit_tasks
           SET status='interrupted', updated_at=?
           WHERE status IN ('running','rendering','transcribing','cutting_silence','cutting','analyzing','subtitles','materials','queued')""",
        (now,),
    )
    conn.commit()
    conn.close()


def save_task(task: dict) -> None:
    conn = _conn()
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        """INSERT INTO video_edit_tasks
           (id, mode, source_path, status, progress, current_step, config_json,
            plan_json, result_json, output_path, error_code, error_message,
            created_at, updated_at, finished_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             mode=excluded.mode, source_path=excluded.source_path, status=excluded.status,
             progress=excluded.progress, current_step=excluded.current_step,
             config_json=excluded.config_json, plan_json=excluded.plan_json,
             result_json=excluded.result_json, output_path=excluded.output_path,
             error_code=excluded.error_code, error_message=excluded.error_message,
             updated_at=excluded.updated_at, finished_at=excluded.finished_at""",
        (
            task.get("id"),
            task.get("mode", "basic"),
            task.get("source_path", ""),
            task.get("status", "queued"),
            int(task.get("progress") or 0),
            task.get("current_step", ""),
            json.dumps(task.get("config") or {}, ensure_ascii=False),
            json.dumps(task.get("plan") or {}, ensure_ascii=False),
            json.dumps({"stats": task.get("stats") or {}, "warnings": task.get("warnings") or []}, ensure_ascii=False),
            task.get("output_path") or "",
            task.get("error_code") or "",
            task.get("error") or task.get("error_message") or "",
            task.get("created_at") or now,
            now,
            task.get("finished_at") or "",
        ),
    )
    conn.commit()
    conn.close()


def load_tasks(limit: int = 20) -> list[dict]:
    conn = _conn()
    rows = conn.execute("SELECT * FROM video_edit_tasks ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [_row_to_task(r) for r in rows]


def load_task(task_id: str) -> dict:
    conn = _conn()
    row = conn.execute("SELECT * FROM video_edit_tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    return _row_to_task(row) if row else {}


def _loads(value: str, default):
    try:
        return json.loads(value or "")
    except Exception:
        return default


def _row_to_task(row) -> dict:
    result = _loads(row["result_json"], {})
    return {
        "id": row["id"],
        "mode": row["mode"],
        "source_path": row["source_path"],
        "status": row["status"],
        "progress": row["progress"],
        "current_step": row["current_step"],
        "config": _loads(row["config_json"], {}),
        "plan": _loads(row["plan_json"], {}),
        "stats": result.get("stats") or {},
        "warnings": result.get("warnings") or [],
        "output_path": row["output_path"] or None,
        "error_code": row["error_code"],
        "error": row["error_message"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "finished_at": row["finished_at"],
    }
