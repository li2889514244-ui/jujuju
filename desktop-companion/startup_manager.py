"""Windows startup integration for Pixingyun Mate."""

from __future__ import annotations

import os
import shlex
import subprocess
import sys
import tempfile
from html import escape as _xml_escape
from pathlib import Path

RUN_VALUE_NAME = "PixingyunMate"
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
RECOVERY_TASK_NAME = r"\PixingyunMate"
RECOVERY_RESTART_COUNT = 5


def _is_windows() -> bool:
    return os.name == "nt"


def subprocess_list2cmdline(args: list[str]) -> str:
    if os.name == "nt":
        import subprocess

        return subprocess.list2cmdline(args)
    return " ".join(shlex.quote(arg) for arg in args)


def get_startup_command() -> str:
    if getattr(sys, "frozen", False):
        return subprocess_list2cmdline([sys.executable, "--startup"])
    app_path = Path(__file__).resolve().with_name("companion_app.py")
    return subprocess_list2cmdline([sys.executable, str(app_path), "--startup"])


def _startup_exec() -> tuple[str, str, str]:
    """Return Task Scheduler command, arguments and working directory."""
    if getattr(sys, "frozen", False):
        return str(sys.executable), "--startup", str(Path(sys.executable).resolve().parent)
    app_path = Path(__file__).resolve().with_name("companion_app.py")
    return str(sys.executable), subprocess_list2cmdline([str(app_path), "--startup"]), str(app_path.parent)


def _recovery_task_xml() -> str:
    command, arguments, working_directory = _startup_exec()
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Pixingyun Mate startup and crash recovery</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>false</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure><Interval>PT1M</Interval><Count>{RECOVERY_RESTART_COUNT}</Count></RestartOnFailure>
    <AllowStartOnDemand>true</AllowStartOnDemand>
  </Settings>
  <Actions Context="Author"><Exec>
    <Command>{_xml_escape(command)}</Command>
    <Arguments>{_xml_escape(arguments)}</Arguments>
    <WorkingDirectory>{_xml_escape(working_directory)}</WorkingDirectory>
  </Exec></Actions>
</Task>'''


def _task_exists() -> bool:
    if not _is_windows():
        return False
    try:
        result = subprocess.run(
            ["schtasks.exe", "/Query", "/TN", RECOVERY_TASK_NAME],
            capture_output=True, text=True, timeout=10, check=False,
        )
        return result.returncode == 0
    except Exception:
        return False


def _register_recovery_task() -> tuple[bool, str]:
    if not _is_windows():
        return False, "unsupported"
    path = ""
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False, encoding="utf-8") as fh:
            fh.write(_recovery_task_xml())
            path = fh.name
        result = subprocess.run(
            ["schtasks.exe", "/Create", "/TN", RECOVERY_TASK_NAME, "/XML", path, "/F"],
            capture_output=True, text=True, timeout=15, check=False,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "schtasks failed").strip()
            return False, detail[:240]
        return True, ""
    except Exception as exc:
        return False, str(exc)[:240]
    finally:
        if path:
            try:
                Path(path).unlink(missing_ok=True)
            except Exception:
                pass


def _delete_recovery_task() -> None:
    if not _is_windows():
        return
    try:
        subprocess.run(
            ["schtasks.exe", "/Delete", "/TN", RECOVERY_TASK_NAME, "/F"],
            capture_output=True, text=True, timeout=10, check=False,
        )
    except Exception:
        pass


def get_run_value() -> str:
    if not _is_windows():
        return ""
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_READ) as key:
            value, _ = winreg.QueryValueEx(key, RUN_VALUE_NAME)
            return str(value or "")
    except FileNotFoundError:
        return ""
    except OSError:
        return ""


def is_startup_enabled() -> bool:
    value = get_run_value().strip()
    return bool(value)


def startup_path_matches() -> bool:
    value = get_run_value().strip()
    return bool(value and value == get_startup_command())


def enable_startup() -> dict:
    if not _is_windows():
        return {"supported": False, "enabled": False, "command": "", "path_ok": False}
    import winreg

    command = get_startup_command()
    task_ok, task_error = _register_recovery_task()
    # The scheduled task is the primary mechanism because it can restart an
    # unexpected process exit.  Keep the Run key only as a compatibility
    # fallback when Task Scheduler is unavailable; never create both.
    if task_ok:
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
                winreg.DeleteValue(key, RUN_VALUE_NAME)
        except (FileNotFoundError, OSError):
            pass
    else:
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, RUN_VALUE_NAME, 0, winreg.REG_SZ, command)
    return get_startup_status()


def disable_startup() -> dict:
    if not _is_windows():
        return {"supported": False, "enabled": False, "command": "", "path_ok": False}
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            winreg.DeleteValue(key, RUN_VALUE_NAME)
    except FileNotFoundError:
        pass
    except OSError:
        pass
    _delete_recovery_task()
    return get_startup_status()


def repair_startup_path_if_enabled() -> dict:
    if not _is_windows():
        return {"supported": False, "enabled": False, "command": "", "path_ok": False}
    value = get_run_value().strip()
    if _task_exists() and (not value or value == get_startup_command()):
        return get_startup_status()
    if value or _task_exists():
        return enable_startup()
    return get_startup_status()


def get_startup_status() -> dict:
    if not _is_windows():
        return {"supported": False, "enabled": False, "command": "", "path_ok": False}
    value = get_run_value().strip()
    expected = get_startup_command()
    task_enabled = _task_exists()
    return {
        "supported": True,
        "enabled": bool(value or task_enabled),
        "command": value,
        "expected_command": expected,
        "path_ok": bool(task_enabled or (value and value == expected)),
        "recovery_task_enabled": task_enabled,
        "recovery_task_name": RECOVERY_TASK_NAME,
        "recovery_restart_count": RECOVERY_RESTART_COUNT,
    }
