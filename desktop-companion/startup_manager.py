"""Windows startup integration for Pixingyun Mate."""

from __future__ import annotations

import os
import shlex
import sys
from pathlib import Path

RUN_VALUE_NAME = "PixingyunMate"
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"


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
    return get_startup_status()


def repair_startup_path_if_enabled() -> dict:
    if not _is_windows():
        return {"supported": False, "enabled": False, "command": "", "path_ok": False}
    value = get_run_value().strip()
    if value and value != get_startup_command():
        return enable_startup()
    return get_startup_status()


def get_startup_status() -> dict:
    if not _is_windows():
        return {"supported": False, "enabled": False, "command": "", "path_ok": False}
    value = get_run_value().strip()
    expected = get_startup_command()
    return {
        "supported": True,
        "enabled": bool(value),
        "command": value,
        "expected_command": expected,
        "path_ok": bool(value and value == expected),
    }
