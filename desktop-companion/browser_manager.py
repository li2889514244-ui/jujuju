"""
Unified browser discovery for Pixingyun Mate.

The packaged app must be able to open a visible QR-login browser on a
co-worker's Windows machine even when Playwright's downloaded Chromium is not
present. Prefer real installed Chrome/Edge paths and avoid running
`pixingyun-mate.exe -m playwright ...` from a frozen build.
"""

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from companion_encoding import run_cmd


def _import_playwright() -> bool:
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
        return True
    except ImportError:
        return False


_HAS_PLAYWRIGHT = _import_playwright()


def _playwright_base_dirs() -> list[Path]:
    dirs: list[Path] = []
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).parent
        dirs.extend([
            exe_dir / "ms-playwright",
            exe_dir / "_internal" / "ms-playwright",
        ])
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            dirs.append(Path(meipass) / "ms-playwright")

    if sys.platform == "win32":
        dirs.append(Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "ms-playwright")
    elif sys.platform == "darwin":
        dirs.append(Path.home() / "Library" / "Caches" / "ms-playwright")
    else:
        dirs.append(Path.home() / ".cache" / "ms-playwright")
    return dirs


def _find_chromium_in_base(base: Path) -> str | None:
    if not base.exists():
        return None

    chromium_dirs = sorted(
        [d for d in base.iterdir() if d.is_dir() and d.name.startswith("chromium-")],
        key=lambda d: d.name,
        reverse=True,
    )

    for directory in chromium_dirs:
        if sys.platform == "win32":
            candidates = [
                directory / "chrome-win64" / "chrome.exe",
                directory / "chrome-win" / "chrome.exe",
            ]
        elif sys.platform == "darwin":
            candidates = [directory / "chrome-mac" / "Chromium.app" / "Contents" / "MacOS" / "Chromium"]
        else:
            candidates = [directory / "chrome-linux" / "chrome"]
        for exe in candidates:
            if exe.exists():
                return str(exe)
    return None


def _existing_paths(paths: list[str | None]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for raw in paths:
        if not raw:
            continue
        path = os.path.expandvars(str(raw)).strip().strip('"')
        if not path:
            continue
        key = os.path.normcase(os.path.abspath(path))
        if key in seen:
            continue
        seen.add(key)
        if os.path.exists(path):
            result.append(path)
    return result


def _which(exe_name: str) -> str | None:
    try:
        found = shutil.which(exe_name)
        if found and os.path.exists(found):
            return found
    except Exception:
        pass
    return None


def _registry_app_path(exe_name: str) -> str | None:
    if sys.platform != 'win32':
        return None
    try:
        import winreg
    except Exception:
        return None

    subkey = rf"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{exe_name}"
    views = [0]
    for attr in ("KEY_WOW64_64KEY", "KEY_WOW64_32KEY"):
        value = getattr(winreg, attr, 0)
        if value:
            views.append(value)

    for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for view in views:
            try:
                with winreg.OpenKey(root, subkey, 0, winreg.KEY_READ | view) as key:
                    value, _ = winreg.QueryValueEx(key, "")
                    if value and os.path.exists(value):
                        return value
            except OSError:
                continue
            except Exception:
                continue
    return None


def find_playwright_chromium() -> str | None:
    for base in _playwright_base_dirs():
        exe = _find_chromium_in_base(base)
        if exe:
            return exe
    return None


def find_local_chromium() -> str | None:
    if sys.platform == "win32":
        exe = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "MatrixFlow" / "chromium" / "chrome.exe"
    else:
        exe = Path.home() / ".matrixflow" / "chromium" / "chrome"
    return str(exe) if exe.exists() else None


def find_system_browser_candidates() -> list[str]:
    if sys.platform == "win32":
        sysdrive = os.environ.get("SystemDrive", "C:")
        paths = [
            rf"{sysdrive}\Program Files\Google\Chrome\Application\chrome.exe",
            rf"{sysdrive}\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe",
            _registry_app_path("chrome.exe"),
            _which("chrome.exe"),
            rf"{sysdrive}\Program Files\Microsoft\Edge\Application\msedge.exe",
            rf"{sysdrive}\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe",
            _registry_app_path("msedge.exe"),
            _which("msedge.exe"),
        ]
    elif sys.platform == "darwin":
        paths = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            _which("google-chrome"),
            _which("microsoft-edge"),
        ]
    else:
        paths = [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium-browser",
            "/usr/bin/chromium",
            "/usr/bin/microsoft-edge",
            _which("google-chrome"),
            _which("google-chrome-stable"),
            _which("chromium-browser"),
            _which("chromium"),
            _which("microsoft-edge"),
        ]
    return _existing_paths(paths)


def find_system_chrome() -> str | None:
    candidates = find_system_browser_candidates()
    return candidates[0] if candidates else None


def ensure_playwright_chromium(timeout: int = 120) -> str | None:
    exe = find_playwright_chromium()
    if exe:
        return exe

    if not _HAS_PLAYWRIGHT:
        print("[BrowserMgr] Playwright is not available; cannot install Chromium")
        return None

    if getattr(sys, "frozen", False):
        print("[BrowserMgr] Frozen build cannot run python -m playwright install chromium")
        return None

    print("[BrowserMgr] Playwright Chromium is missing; downloading...")
    try:
        result = run_cmd(
            [sys.executable, "-m", "playwright", "install", "chromium"],
            timeout=timeout,
        )
        if result.returncode == 0:
            print("[BrowserMgr] Chromium download completed")
            return find_playwright_chromium()
        print(f"[BrowserMgr] Chromium download failed: {result.stderr_text[:200]}")
    except subprocess.TimeoutExpired:
        print("[BrowserMgr] Chromium download timed out")
    except Exception as exc:
        print(f"[BrowserMgr] Chromium download error: {exc}")
    return None


def find_best_browser() -> tuple[str | None, str | None]:
    for label, exe in (
        ("Playwright Chromium", find_playwright_chromium()),
        ("local Chromium", find_local_chromium()),
        ("system browser", find_system_chrome()),
    ):
        if exe:
            print(f"[BrowserMgr] Using {label}: {exe}")
            return exe, None

    exe = ensure_playwright_chromium()
    if exe:
        print(f"[BrowserMgr] Installed Chromium automatically: {exe}")
        return exe, None

    channel = "msedge" if sys.platform == "win32" else "chrome"
    print(f"[BrowserMgr] No executable path found; falling back to channel={channel}")
    return None, channel


def get_browser_info() -> dict:
    return {
        "playwright_chromium": find_playwright_chromium(),
        "local_chromium": find_local_chromium(),
        "system_chrome": find_system_chrome(),
        "system_browsers": find_system_browser_candidates(),
        "playwright_available": _HAS_PLAYWRIGHT,
        "platform": sys.platform,
        "frozen": bool(getattr(sys, "frozen", False)),
        "sys_executable": sys.executable,
    }


def get_default_user_data_dir() -> Path:
    if getattr(sys, "frozen", False):
        base = Path(sys.executable).parent
    else:
        base = Path(__file__).parent
    return base / "chrome_profile"


def _norm_for_cmdline(path: str | Path) -> str:
    try:
        return os.path.normcase(os.path.abspath(os.path.expandvars(str(path)))).replace("/", "\\")
    except Exception:
        return str(path or "").replace("/", "\\").lower()


def cleanup_browser_processes_for_profile(profile_dir: str | Path, timeout: float = 2.0) -> int:
    """Terminate only browser processes that Pixingyun Mate itself started AND
    registered in the managed-process registry for this profile.

    P0 安全修复：不再扫描系统所有进程、按命令行路径猜测归属。
    - 只有登记进 managed_processes 且通过五重校验（PID 存在 / 已登记 /
      create_time 一致 / 可执行文件一致 / 命令行含该 profile）的进程才允许关闭。
    - 未登记或校验不过 → 不杀，并提示用户关闭对应窗口后重试。
    """
    from process_registry import terminate_for_profile

    profile_marker = _norm_for_cmdline(profile_dir)
    if not profile_marker:
        return 0

    results = terminate_for_profile(
        profile_dir, reason="profile cleanup", grace=max(0.1, timeout)
    )
    killed = sum(1 for r in results if r.get("action") == "killed")
    if killed:
        print(f"[BrowserMgr] cleaned {killed} registered browser process(es) for profile {profile_dir}")
    else:
        print(
            f"[BrowserMgr] 拒绝清理 profile {profile_dir}："
            "无已登记进程或校验未通过。该账号浏览器仍在使用，请关闭对应窗口后重试。"
        )
    return killed

def cleanup_stale_companion_browsers(timeout: float = 2.0) -> int:
    """启动清扫：只清理「上次会话登记过（managed_processes.json）且五重校验通过」的遗留进程。

    P0 安全修复：不再按 %LOCALAPPDATA%/MatrixFlow/browser-profiles 等路径全系统扫描猜测。
    未登记 / create_time 不一致（PID 被复用）→ 拒绝关闭并记录 SKIP_UNMANAGED_PROCESS。
    """
    from process_registry import terminate_stale_records

    results = terminate_stale_records(
        reason="stale companion cleanup", grace=max(0.1, timeout)
    )
    killed = sum(1 for r in results if r.get("action") == "killed")
    if killed:
        print(f"[BrowserMgr] cleaned {killed} stale registered companion browser process(es) on startup")
    return killed
