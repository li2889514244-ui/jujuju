"""Durable local lifecycle journal used to explain future offline devices."""

from __future__ import annotations

import atexit
import json
import os
import threading
import time
import uuid
from pathlib import Path


_LOCK = threading.Lock()
_JOURNAL_PATH = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'MatrixFlow' / 'companion-runtime.json'
_CURRENT: dict = {}


def _now_iso() -> str:
    return time.strftime('%Y-%m-%dT%H:%M:%S')


def _read() -> dict:
    try:
        value = json.loads(_JOURNAL_PATH.read_text(encoding='utf-8'))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def _write(value: dict) -> None:
    try:
        _JOURNAL_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = _JOURNAL_PATH.with_suffix('.tmp')
        tmp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        os.replace(tmp, _JOURNAL_PATH)
    except Exception:
        # A diagnostic journal must never prevent the companion from starting.
        pass


def _save(**updates) -> None:
    with _LOCK:
        _CURRENT.update(updates)
        _write(dict(_CURRENT))


def begin_startup() -> dict:
    """Start a new durable boot record and register a clean-exit marker."""
    global _CURRENT
    previous = _read()
    previous_state = str(previous.get('state') or '')
    with _LOCK:
        _CURRENT = {
            'bootId': uuid.uuid4().hex,
            'pid': os.getpid(),
            'startedAt': _now_iso(),
            'state': 'running',
            'phase': 'starting',
            'previousBootId': str(previous.get('bootId') or ''),
            'previousStartedAt': str(previous.get('startedAt') or ''),
            'previousExitState': 'unclean' if previous_state == 'running' else (previous_state or 'unknown'),
            'lastPhaseAt': _now_iso(),
        }
        _write(dict(_CURRENT))
    atexit.register(mark_clean_shutdown)
    return get_diagnostic()


def mark_phase(phase: str, **extra) -> None:
    _save(phase=str(phase or '')[:50], lastPhaseAt=_now_iso(), **extra)


def mark_clean_shutdown() -> None:
    if not _CURRENT:
        return
    _save(state='clean', exitAt=_now_iso(), phase='stopped', lastPhaseAt=_now_iso())


def get_diagnostic() -> dict:
    with _LOCK:
        return {
            'bootId': str(_CURRENT.get('bootId') or ''),
            'pid': _CURRENT.get('pid'),
            'startedAt': str(_CURRENT.get('startedAt') or ''),
            'phase': str(_CURRENT.get('phase') or ''),
            'previousExitState': str(_CURRENT.get('previousExitState') or ''),
            'previousStartedAt': str(_CURRENT.get('previousStartedAt') or ''),
            'lastPhaseAt': str(_CURRENT.get('lastPhaseAt') or ''),
            'flaskReady': bool(_CURRENT.get('flaskReady')),
            'startupRecovery': _CURRENT.get('startupRecovery') or {},
            'lastHeartbeatAt': str(_CURRENT.get('lastHeartbeatAt') or ''),
        }
