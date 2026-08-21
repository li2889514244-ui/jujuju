"""
companion_browser.py — Browser detection, CDP management, and launch options.
"""
import os, threading, ctypes
from pathlib import Path

import companion_state as state


# ── Windows API constants for window hiding ──
_SW_HIDE = 0
_WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)


def _find_browser():
    """检测可用浏览器，返回 (executable_path, channel)。

    v3.3: 优先使用 Playwright 内置 Chromium，无需用户安装 Chrome。
    """
    try:
        from browser_manager import find_best_browser
        exe, channel = find_best_browser()
        if exe:
            print(f'[Browser] 使用内置浏览器: {exe}')
            return (exe, None)
        if channel:
            print(f'[Browser] 使用 Playwright channel: {channel}')
            return (None, channel)
    except ImportError:
        pass

    CHROMIUM_DIR = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'MatrixFlow' / 'chromium'
    CHROMIUM_EXE = CHROMIUM_DIR / 'chrome.exe'

    if CHROMIUM_EXE.exists():
        print(f'[Browser] 使用独立 Chromium: {CHROMIUM_EXE}')
        return (str(CHROMIUM_EXE), None)

    for p in [
        os.environ.get('PROGRAMFILES', 'C:\\Program Files') + '\\Google\\Chrome\\Application\\chrome.exe',
        os.environ.get('ProgramFiles(x86)', 'C:\\Program Files (x86)') + '\\Google\\Chrome\\Application\\chrome.exe',
        os.environ.get('LOCALAPPDATA', '') + '\\Google\\Chrome\\Application\\chrome.exe',
    ]:
        if os.path.exists(p):
            print(f'[Browser] 使用系统 Chrome: {p}')
            return (p, None)

    for p in [
        os.environ.get('PROGRAMFILES', 'C:\\Program Files') + '\\Microsoft\\Edge\\Application\\msedge.exe',
        os.environ.get('ProgramFiles(x86)', 'C:\\Program Files (x86)') + '\\Microsoft\\Edge\\Application\\msedge.exe',
    ]:
        if os.path.exists(p):
            print(f'[Browser] 使用系统 Edge: {p}')
            return (p, None)

    print('[Browser] 未检测到本地浏览器，尝试 Playwright channel...')
    return (None, 'chrome')


def _ensure_cdp_running():
    """v4.0: 按需启动 CDP 浏览器（用于扫码绑定）。采集不依赖 CDP。"""
    with state._cdp_lock:
        if state._CDP_URL and state._cdp and state._cdp.is_running:
            return state._CDP_URL
        try:
            print('[CDP] 按需启动 CDP 浏览器...')
            state._cdp.start(app_mode=False)
            state._CDP_URL = state._cdp.get_url()
            print(f'[CDP] 就绪: {state._CDP_URL}')
            return state._CDP_URL
        except Exception as e:
            print(f'[CDP] 启动失败: {e}')
            state._CDP_URL = None
            return None


def _stop_cdp_if_idle():
    """v4.0: 扫码绑定结束后关闭 CDP 浏览器，释放资源。"""
    with state._cdp_lock:
        if state._cdp and state._cdp.is_running:
            try:
                state._cdp.stop()
                print('[CDP] 已关闭（按需模式）')
            except Exception as _e:
                print(f'[WARN] {type(_e).__name__}: {_e}')
        state._CDP_URL = None


def _launch_browser_opts(headless: bool, extra_args: list = None) -> dict:
    """Return kwargs for chromium.launch based on detected browser.

    v3.3: 使用 stealth_patches 中的启动参数，增强反检测能力。
    """
    try:
        from stealth_patches import STEALTH_LAUNCH_ARGS
        args = list(STEALTH_LAUNCH_ARGS)
    except ImportError:
        args = ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--lang=zh-CN']
    if extra_args:
        args.extend(extra_args)
    opts = {
        'headless': headless,
        'args': args,
        # Playwright adds --enable-automation by default, which shows the
        # "controlled by automated test software" banner and is visible to sites.
        'ignore_default_args': ['--enable-automation'],
    }
    if state._BROWSER_PATH:
        opts['executable_path'] = state._BROWSER_PATH
    elif state._BROWSER_CHANNEL:
        opts['channel'] = state._BROWSER_CHANNEL
    return opts


# ── Headless=False 窗口隐藏 ──────────────────────────────────────────
# 当使用 headless=False 绕过微信反自动化检测时，浏览器窗口需要隐藏。
# 方案：启动时用 --window-position=-32000,-32000 把窗口放到屏幕外，
# 然后用 ctypes ShowWindow(SW_HIDE) 彻底隐藏，不影响渲染管线。

HIDDEN_WINDOW_ARGS = [
    '--window-position=-32000,-32000',
]


def _hide_offscreen_windows():
    """隐藏位于屏幕外位置（-32000）的浏览器窗口。

    仅隐藏 left <= -31000 的可见窗口，不会影响用户自己的浏览器窗口。
    在 Windows 上使用 ctypes，无需额外依赖。
    """
    if os.name != 'nt':
        return
    try:
        user32 = ctypes.windll.user32

        class _RECT(ctypes.Structure):
            _fields_ = [('left', ctypes.c_long), ('top', ctypes.c_long),
                        ('right', ctypes.c_long), ('bottom', ctypes.c_long)]

        def _enum_cb(hwnd, _lparam):
            if user32.IsWindowVisible(hwnd):
                rect = _RECT()
                user32.GetWindowRect(hwnd, ctypes.byref(rect))
                if rect.left <= -31000:
                    user32.ShowWindow(hwnd, _SW_HIDE)
            return True

        user32.EnumWindows(_WNDENUMPROC(_enum_cb), 0)
    except Exception:
        pass
