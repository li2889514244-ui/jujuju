"""
process_registry.py — 披星云伴侣托管进程注册表（P0 进程安全铁律）

背景：
  旧代码在清理浏览器时通过 psutil / PowerShell 扫描「系统所有进程」，
  凭命令行里出现某个路径就猜测归属并强杀，曾误杀用户自己的 Chrome/Edge、
  网页以及其他软件（VS Code、编辑器、终端等命令行里恰好含 profile 路径）。

铁律（本模块强制实现）：
  1. 伴侣只能关闭「注册表里登记过、且通过五重校验」的进程。
  2. 禁止按进程名 / 窗口标题 / 端口 / 命令行全系统扫描猜测后关闭进程。
  3. 每次 terminate/kill 前必须五重校验：
       (a) PID 仍然存在
       (b) 该 PID 在 managed_processes 注册表中（由披星云自己启动并登记）
       (c) PID 未被系统复用（进程 create_time 与登记时一致）
       (d) 进程可执行文件路径与登记时一致
       (e) 命令行 / profilePath 与登记时一致
     任何一项无法确认 → 不杀，记录 SKIP_UNMANAGED_PROCESS。
  4. 所有 terminate / kill 前写保护日志（PID、进程名、commandLine、createTime、
     归属 taskId、归属 profilePath、关闭原因）。
  5. 注册表持久化到 %LOCALAPPDATA%/MatrixFlow/managed_processes.json，
     崩溃重启后仅允许对「登记过的遗留 PID」做精确清理，绝不全局扫描。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

# ──────────────────────────────────────────────────────────────────────────
# 基础工具
# ──────────────────────────────────────────────────────────────────────────

BROWSER_NAMES = {
    "chrome.exe", "chromium.exe", "msedge.exe",
    "chrome", "chromium", "msedge", "msedge.exe",
}

BROWSER_PROCESS_TYPES_REQUIRING_PROFILE = {
    "browser",
    "cdp_browser",
    "scan_login_browser",
    "collector_browser",
    "doudian_browser",
    "pixing_worker_browser",
    "webview_fallback_browser",
}

_lock = threading.RLock()
_registry: dict[int, dict] = {}          # pid -> record
_persisted_records: dict[int, dict] = {} # 启动时从磁盘恢复的遗留登记（用于崩溃清扫）

_PERSIST_VERSION = 1


def _appdata_matrixflow_dir() -> Path:
    override = os.environ.get("PIXINGYUN_GUARD_DIR")
    if override:
        try:
            d = Path(override)
            d.mkdir(parents=True, exist_ok=True)
            return d
        except Exception:
            pass
    try:
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
        d = base / "MatrixFlow"
        d.mkdir(parents=True, exist_ok=True)
        return d
    except Exception:
        return Path.home() / "MatrixFlow"


def _persist_file() -> Path:
    return _appdata_matrixflow_dir() / "managed_processes.json"


def _guard_log_file() -> Path:
    try:
        d = _appdata_matrixflow_dir() / "logs"
        d.mkdir(parents=True, exist_ok=True)
        return d / "process_guard.log"
    except Exception:
        return Path.home() / "pixingyun_process_guard.log"


def _guard_log(action: str, **fields) -> None:
    """保护日志：任何 terminate/kill 决策都落盘。"""
    try:
        parts = [time.strftime("%Y-%m-%d %H:%M:%S"), f"[{action}]"]
        for key, value in fields.items():
            text = str(value)
            if len(text) > 500:
                text = text[:500] + "..."
            parts.append(f"{key}={text}")
        line = " ".join(parts)
        with _guard_log_file().open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def _norm_path(path) -> str:
    try:
        return os.path.normcase(os.path.abspath(os.path.expandvars(str(path)))).replace("/", "\\")
    except Exception:
        return str(path or "").replace("/", "\\").lower()


# ──────────────────────────────────────────────────────────────────────────
# 进程信息读取（优先 psutil，降级 PowerShell Get-CimInstance）
# ──────────────────────────────────────────────────────────────────────────

def _try_import_psutil():
    try:
        import psutil  # noqa: F401
        return psutil
    except Exception:
        return None


def _ps_cmdline(pid: int) -> str:
    psutil = _try_import_psutil()
    if psutil is not None:
        try:
            return " ".join(str(p) for p in (psutil.Process(int(pid)).cmdline() or []))
        except Exception:
            return ""
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
             f"(Get-CimInstance Win32_Process -Filter 'ProcessId={int(pid)}').CommandLine"],
            capture_output=True, timeout=10,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return (out.stdout or b"").decode("utf-8", "replace").strip()
    except Exception:
        return ""


def _ps_create_time(pid: int):
    """返回 epoch 秒（float）；读不到返回 None。"""
    psutil = _try_import_psutil()
    if psutil is not None:
        try:
            return float(psutil.Process(int(pid)).create_time())
        except Exception:
            return None
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
             f"try {{ (Get-CimInstance Win32_Process -Filter 'ProcessId={int(pid)}').CreationDate.ToUniversalTime().ToString('o') }} catch {{ '' }}"],
            capture_output=True, timeout=10,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        text = (out.stdout or b"").decode("utf-8", "replace").strip()
        if not text:
            return None
        from datetime import datetime, timezone
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return None


def _ps_name(pid: int) -> str:
    psutil = _try_import_psutil()
    if psutil is not None:
        try:
            return str(psutil.Process(int(pid)).name() or "")
        except Exception:
            return ""
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
             f"try {{ (Get-Process -Id {int(pid)}).ProcessName }} catch {{ '' }}"],
            capture_output=True, timeout=10,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return (out.stdout or b"").decode("utf-8", "replace").strip()
    except Exception:
        return ""


def _ps_exe(pid: int) -> str:
    psutil = _try_import_psutil()
    if psutil is not None:
        try:
            return str(psutil.Process(int(pid)).exe() or "")
        except Exception:
            return ""
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
             f"try {{ (Get-Process -Id {int(pid)}).Path }} catch {{ '' }}"],
            capture_output=True, timeout=10,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return (out.stdout or b"").decode("utf-8", "replace").strip()
    except Exception:
        return ""


def _pid_exists(pid: int) -> bool:
    psutil = _try_import_psutil()
    if psutil is not None:
        try:
            return psutil.pid_exists(int(pid))
        except Exception:
            return False
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
             f"if (Get-Process -Id {int(pid)} -ErrorAction SilentlyContinue) {{ 'yes' }}"],
            capture_output=True, timeout=10,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return b"yes" in (out.stdout or b"")
    except Exception:
        return False


# ──────────────────────────────────────────────────────────────────────────
# 注册表核心
# ──────────────────────────────────────────────────────────────────────────

def register_process(
    pid: int | None,
    process_type: str,
    create_time: float | None = None,
    task_id: str | None = None,
    account_id: str | None = None,
    store_id: str | None = None,
    profile_path: str | None = None,
    executable: str | None = None,
    parent_pid: int | None = None,
) -> dict | None:
    """登记一个由披星云自己启动的进程。登记失败返回 None（不允许杀）。"""
    if not pid or int(pid) <= 0:
        return None
    if str(process_type or "") in BROWSER_PROCESS_TYPES_REQUIRING_PROFILE and not profile_path:
        _guard_log(
            "REGISTER_REJECTED",
            pid=pid,
            type=process_type,
            reason="browser_profile_path_required",
        )
        return None
    pid = int(pid)
    if not _pid_exists(pid):
        return None
    if create_time is None:
        create_time = _ps_create_time(pid)
    if create_time is None:
        _guard_log("REGISTER_REJECTED", pid=pid, reason="create_time_unavailable")
        return None
    record = {
        "pid": pid,
        "create_time": float(create_time),
        "type": str(process_type or "unknown"),
        "task_id": task_id,
        "account_id": account_id,
        "store_id": store_id,
        "profile_path": _norm_path(profile_path) if profile_path else None,
        "executable": _norm_path(executable) if executable else None,
        "parent_pid": int(parent_pid) if parent_pid else None,
        "registered_at": time.time(),
    }
    with _lock:
        _registry[pid] = record
    _guard_log(
        "REGISTER_PROCESS",
        pid=pid,
        create_time=record["create_time"],
        type=record["type"],
        task_id=record.get("task_id"),
        account_id=record.get("account_id"),
        store_id=record.get("store_id"),
        profile_path=record.get("profile_path"),
        executable=record.get("executable"),
    )
    _persist()
    return record


def unregister_process(pid: int, reason: str = "exited") -> None:
    with _lock:
        _registry.pop(int(pid), None)
    _guard_log("UNREGISTER_PROCESS", pid=pid, reason=reason)
    _persist()


def get_record(pid: int) -> dict | None:
    with _lock:
        return dict(_registry.get(int(pid)) or {})


def _verify(record: dict, require_profile_path: str | None = None) -> tuple[bool, str]:
    """五重校验。返回 (通过?, 失败原因)。"""
    pid = int(record.get("pid", 0))
    # (a) PID 仍然存在
    if not _pid_exists(pid):
        return False, "pid_not_found"
    # (b) PID 在注册表（record 来自注册表即满足；双保险再查一次内存）
    if not get_record(pid):
        return False, "not_in_registry"
    # (c) PID 未被复用：create_time 与登记时一致（±1s 容差）
    current_create = _ps_create_time(pid)
    if current_create is None:
        return False, "create_time_unreadable"
    recorded_create = float(record.get("create_time") or 0)
    if abs(current_create - recorded_create) > 1.0:
        return False, "create_time_mismatch_pid_reused"
    # (d) 可执行文件路径一致
    recorded_exe = record.get("executable")
    if recorded_exe:
        current_exe = _ps_exe(pid)
        if not current_exe:
            return False, "executable_unreadable"
        if _norm_path(current_exe) != _norm_path(recorded_exe):
            return False, "executable_mismatch"
    # (e) 命令行 / profilePath 一致
    recorded_profile = record.get("profile_path")
    if str(record.get("type") or "") in BROWSER_PROCESS_TYPES_REQUIRING_PROFILE and not (
        recorded_profile or require_profile_path
    ):
        return False, "browser_profile_path_required"
    if recorded_profile or require_profile_path:
        cmdline = _ps_cmdline(pid)
        if not cmdline:
            return False, "cmdline_unreadable"
        cmdline_norm = _norm_path(cmdline)
        target = recorded_profile or _norm_path(require_profile_path)
        if target and target not in cmdline_norm:
            return False, "profile_path_not_in_cmdline"
    return True, "ok"


def terminate_managed(pid: int, reason: str, profile_path: str | None = None, grace: float = 2.0) -> dict:
    """关闭一个进程的唯一合法入口。

    五重校验全部通过才允许 terminate/kill；任何一项无法确认 → 不杀。
    """
    pid = int(pid)
    record = get_record(pid)
    # 保护日志：准备关闭（无论最终是否允许）
    _guard_log(
        "KILL_PREPARE",
        pid=pid,
        reason=reason,
        name=_ps_name(pid) if _pid_exists(pid) else "n/a",
        command_line=(_ps_cmdline(pid)[:300] if _pid_exists(pid) else "n/a"),
        create_time=(_ps_create_time(pid) if _pid_exists(pid) else "n/a"),
        recorded_create_time=(record or {}).get("create_time"),
        task_id=(record or {}).get("task_id"),
        account_id=(record or {}).get("account_id"),
        store_id=(record or {}).get("store_id"),
        profile_path=((record or {}).get("profile_path") or (_norm_path(profile_path) if profile_path else None)),
    )
    if not record:
        _guard_log("SKIP_UNMANAGED_PROCESS", pid=pid, reason=reason, detail="pid_not_in_registry")
        return {"pid": pid, "action": "skipped", "detail": "not_in_registry"}
    ok, why = _verify(record, profile_path)
    if not ok:
        if why == "pid_not_found":
            # 进程已退出：无进程可杀，不算违规也不计入 killed；同步注销记录防止注册表无限累积
            unregister_process(pid, reason="already_gone")
            return {"pid": pid, "action": "already_gone", "detail": "ok"}
        _guard_log("SKIP_UNMANAGED_PROCESS", pid=pid, reason=reason, detail=why)
        return {"pid": pid, "action": "skipped", "detail": why}

    # 通过校验 → 终止（先优雅 terminate，超时后 kill）
    psutil = _try_import_psutil()
    killed = False
    try:
        if psutil is not None:
            proc = psutil.Process(pid)
            try:
                proc.terminate()
            except (psutil.NoSuchProcess,):
                unregister_process(pid, reason="already_gone")
                return {"pid": pid, "action": "already_gone", "detail": "ok"}
            try:
                proc.wait(timeout=max(0.1, grace))
                killed = True
            except (psutil.TimeoutExpired,):
                try:
                    proc.kill()
                except (psutil.NoSuchProcess,):
                    pass
                killed = True
            except Exception:
                pass
        if not killed and _pid_exists(pid):
            subprocess.run(
                ["taskkill", "/F", "/PID", str(pid)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            killed = True
    except Exception as exc:
        _guard_log("KILL_ERROR", pid=pid, reason=reason, error=str(exc)[:200])
        return {"pid": pid, "action": "error", "detail": str(exc)[:200]}

    _guard_log("KILLED", pid=pid, reason=reason, detail="verified_and_terminated")
    unregister_process(pid, reason=reason)
    return {"pid": pid, "action": "killed", "detail": "verified_and_terminated"}


def terminate_for_profile(profile_path, reason: str = "profile_cleanup", grace: float = 2.0) -> list[dict]:
    """只关闭注册表中属于该 profile 的进程。绝不扫描系统进程猜测归属。"""
    marker = _norm_path(profile_path)
    with _lock:
        pids = [
            pid for pid, rec in _registry.items()
            if rec.get("profile_path") and marker and marker in (rec.get("profile_path") or "")
        ]
    results = [terminate_managed(pid, reason=reason, profile_path=profile_path, grace=grace) for pid in pids]
    if not results:
        _guard_log(
            "PROFILE_NO_MANAGED_PROCESS",
            profile_path=marker,
            hint="该账号浏览器未登记或仍被外部使用：拒绝清理，请关闭对应窗口后重试",
        )
    return results


def terminate_by_type(process_type: str, reason: str = "type_cleanup", task_id: str | None = None) -> list[dict]:
    with _lock:
        pids = [
            pid for pid, rec in _registry.items()
            if rec.get("type") == process_type and (task_id is None or rec.get("task_id") == task_id)
        ]
    return [terminate_managed(pid, reason=reason) for pid in pids]


# ──────────────────────────────────────────────────────────────────────────
# 浏览器启动登记（diff 法：只登记 launch 前后新出现的进程）
# ──────────────────────────────────────────────────────────────────────────

def browser_snapshot(name_whitelist: set[str] | None = None) -> dict[int, float]:
    """拍摄当前浏览器进程快照 {pid: create_time}，供 launch 后 diff 使用。"""
    names = name_whitelist or BROWSER_NAMES
    snap: dict[int, float] = {}
    psutil = _try_import_psutil()
    if psutil is not None:
        try:
            for proc in psutil.process_iter(["pid", "name", "create_time"]):
                try:
                    name = str(proc.info.get("name") or "").lower()
                    if name in {n.lower() for n in names}:
                        snap[int(proc.info["pid"])] = float(proc.info["create_time"])
                except Exception:
                    continue
        except Exception:
            pass
    else:
        try:
            out = subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-CimInstance Win32_Process | ForEach-Object { '{0}|{1}' -f $_.ProcessId, $_.Name }"],
                capture_output=True, timeout=15,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            name_set = {n.lower() for n in names}
            for line in (out.stdout or b"").decode("utf-8", "replace").splitlines():
                if "|" not in line:
                    continue
                pid_text, name = line.split("|", 1)
                if name.strip().lower() in name_set:
                    pid = int(pid_text.strip())
                    ct = _ps_create_time(pid)
                    if ct is not None:
                        snap[pid] = ct
        except Exception:
            pass
    return snap


def _iter_live_browser_pids(name_whitelist: set[str] | None = None) -> list[tuple[int, str]]:
    names = name_whitelist or BROWSER_NAMES
    result: list[tuple[int, str]] = []
    psutil = _try_import_psutil()
    if psutil is not None:
        try:
            for proc in psutil.process_iter(["pid", "name"]):
                try:
                    if str(proc.info.get("name") or "").lower() in {n.lower() for n in names}:
                        result.append((int(proc.info["pid"]), str(proc.info["name"])))
                except Exception:
                    continue
        except Exception:
            pass
    else:
        try:
            out = subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
                 "Get-CimInstance Win32_Process | ForEach-Object { '{0}|{1}' -f $_.ProcessId, $_.Name }"],
                capture_output=True, timeout=15,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            name_set = {n.lower() for n in names}
            for line in (out.stdout or b"").decode("utf-8", "replace").splitlines():
                if "|" not in line:
                    continue
                pid_text, name = line.split("|", 1)
                if name.strip().lower() in name_set:
                    result.append((int(pid_text.strip()), name.strip()))
        except Exception:
            pass
    return result


def register_new_browser_tree(
    profile_path: str | None,
    snapshot: dict[int, float] | None = None,
    process_type: str = "browser",
    task_id: str | None = None,
    account_id: str | None = None,
    store_id: str | None = None,
    name_whitelist: set[str] | None = None,
) -> list[dict]:
    """launch 成功后调用：把 launch 前后「新出现的」浏览器进程登记进注册表。

    - profile_path 非空时，只登记命令行包含该 profile 路径的新进程（精准归属）。
    - profile_path 为空时拒绝登记，避免把用户同时新开的浏览器误登记为伴侣进程。
    绝不把 launch 前已存在的进程（用户自己的浏览器）登记进来。
    """
    if not profile_path:
        _guard_log(
            "REGISTER_REJECTED",
            type=process_type,
            task_id=task_id,
            account_id=account_id,
            store_id=store_id,
            reason="browser_profile_path_required",
        )
        return []
    snapshot = snapshot or {}
    marker = _norm_path(profile_path) if profile_path else None
    registered: list[dict] = []
    for pid, name in _iter_live_browser_pids(name_whitelist):
        if pid in snapshot:
            # 已存在于 launch 前 → 不是本次启动的，跳过
            continue
        cmdline = _ps_cmdline(pid)
        if marker and marker not in _norm_path(cmdline):
            continue
        create_time = _ps_create_time(pid)
        if create_time is None:
            continue
        record = register_process(
            pid=pid,
            process_type=process_type,
            create_time=create_time,
            task_id=task_id,
            account_id=account_id,
            store_id=store_id,
            profile_path=profile_path,
            executable=_ps_exe(pid) or None,
        )
        if record:
            registered.append(record)
    return registered


# ──────────────────────────────────────────────────────────────────────────
# CDP 归属校验（connect_over_cdp 之前必须调用）
# ──────────────────────────────────────────────────────────────────────────

def fetch_cdp_browser_pid(cdp_url: str) -> int | None:
    """通过 CDP /json/version 读取浏览器主进程 PID。"""
    import urllib.request
    import json as _json
    base = (cdp_url or "").rstrip("/")
    for host_url in (base,):
        try:
            with urllib.request.urlopen(f"{host_url}/json/version", timeout=2) as resp:
                data = _json.loads(resp.read().decode("utf-8", "replace"))
            pid = data.get("Browser-Pid") or data.get("BrowserPid") or data.get("pid")
            if pid:
                return int(pid)
        except Exception:
            continue
    return None


def verify_cdp_owner(cdp_url: str) -> tuple[bool, int | None, str]:
    """校验 CDP 端口上的浏览器是否属于披星云自己登记的进程。

    Returns (是否允许使用并关闭, browser_pid, 说明)。
    """
    pid = fetch_cdp_browser_pid(cdp_url)
    if not pid:
        _guard_log("CDP_OWNER_CHECK", cdp_url=cdp_url, pid="n/a", result="no_browser_pid")
        return False, None, "no_browser_pid"
    record = get_record(pid)
    if not record:
        _guard_log("SKIP_UNMANAGED_PROCESS", pid=pid, reason="cdp_attach_guard",
                   detail="browser_on_cdp_port_not_registered", cdp_url=cdp_url)
        return False, pid, "not_registered"
    ok, why = _verify(record)
    _guard_log("CDP_OWNER_CHECK", cdp_url=cdp_url, pid=pid, result=("verified" if ok else f"rejected:{why}"))
    return ok, pid, why if not ok else "verified"


# ──────────────────────────────────────────────────────────────────────────
# 持久化：崩溃/重启后精确清理「登记过的遗留进程」
# ──────────────────────────────────────────────────────────────────────────

def _persist() -> None:
    try:
        with _lock:
            payload = {
                "version": _PERSIST_VERSION,
                "updated_at": time.time(),
                "records": list(_registry.values()),
            }
        with _persist_file().open("w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def load_persisted() -> int:
    """启动时恢复上次会话的登记记录（标记为遗留，仅允许精确校验后清理）。"""
    global _persisted_records
    try:
        data = json.loads(_persist_file().read_text(encoding="utf-8"))
        records = data.get("records") or []
        _persisted_records = {int(r["pid"]): r for r in records if r.get("pid")}
        return len(_persisted_records)
    except Exception:
        _persisted_records = {}
        return 0


def terminate_stale_records(reason: str = "stale_companion_cleanup", grace: float = 2.0) -> list[dict]:
    """崩溃/重启后清理：只清理「上次会话登记过」的遗留 PID，且必须通过五重校验。

    绝不扫描系统所有进程猜测哪些该关闭。
    """
    load_persisted()
    results: list[dict] = []
    for pid, record in list(_persisted_records.items()):
        if not _pid_exists(pid):
            # 已退出：剪除持久化记录，防止注册表随会话无限累积
            results.append({"pid": pid, "action": "already_gone", "detail": "ok"})
            with _lock:
                _registry.pop(pid, None)
                _persisted_records.pop(pid, None)
            continue
        with _lock:
            _registry.setdefault(pid, record)  # 恢复为托管记录，走统一校验
        result = terminate_managed(pid, reason=reason, grace=grace)
        results.append(result)
        with _lock:
            if result.get("action") == "skipped" and result.get("detail") == "browser_profile_path_required":
                _registry.pop(pid, None)
                _persisted_records.pop(pid, None)
                continue
            if not _pid_exists(pid):
                _persisted_records.pop(pid, None)
    _persist()
    killed = sum(1 for r in results if r.get("action") == "killed")
    _guard_log("STALE_CLEANUP_SUMMARY", total=len(results), killed=killed,
               skipped=sum(1 for r in results if r.get("action") == "skipped"))
    return results


# 模块导入即恢复持久化登记（供 chrome_cdp 等模块直接查询）
_load_attempted = False


def _ensure_persisted_loaded() -> None:
    global _load_attempted
    if not _load_attempted:
        _load_attempted = True
        load_persisted()
        with _lock:
            for pid, record in _persisted_records.items():
                _registry.setdefault(pid, record)


_ensure_persisted_loaded()
