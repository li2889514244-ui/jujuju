"""
披星云伴侣 — 原生窗口管理器（pywebview）
用 pywebview 创建原生桌面窗口替代 Chrome --app 模式。
窗口看起来是独立软件，不再是"附着在浏览器上"的。

关键特性：
  - 关闭窗口时最小化到托盘（不退出程序）
  - 通过托盘"打开主界面"恢复原生窗口（不用系统浏览器）
  - 线程安全的 show/hide 操作
"""
import json
import os
import platform
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

try:
    import webview
    _HAS_WEBVIEW = True
except Exception:
    webview = None
    _HAS_WEBVIEW = False

APP_URL = "http://127.0.0.1:5409"
APPDATA_DIR = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'MatrixFlow'
WEBVIEW2_DATA_DIR = APPDATA_DIR / 'webview2'
WEBVIEW2_DIAG_LOG = APPDATA_DIR / 'webview2-diagnostics.log'
WEBVIEW2_SAFE_ARGS = [
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--disable-accelerated-2d-canvas',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
]
EDGECHROMIUM_REQUIRED_FILES = (
    ('Microsoft.Web.WebView2.Core.dll',),
    ('Microsoft.Web.WebView2.WinForms.dll',),
    ('runtimes', 'win-x64', 'native', 'WebView2Loader.dll'),
)


def _write_diagnostic(event, **detail):
    try:
        APPDATA_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            'ts': time.strftime('%Y-%m-%d %H:%M:%S'),
            'event': event,
            'detail': detail,
            'os': platform.platform(),
            'python': sys.version.split()[0],
            'frozen': bool(getattr(sys, 'frozen', False)),
        }
        with WEBVIEW2_DIAG_LOG.open('a', encoding='utf-8') as fh:
            fh.write(json.dumps(payload, ensure_ascii=False) + '\n')
    except Exception:
        pass


def _merge_browser_args(existing, required):
    parts = [part for part in str(existing or '').split() if part]
    seen = set(parts)
    for arg in required:
        if arg not in seen:
            parts.append(arg)
            seen.add(arg)
    return ' '.join(parts)


def _apply_webview2_compat_env():
    os.environ['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = _merge_browser_args(
        os.environ.get('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'),
        WEBVIEW2_SAFE_ARGS,
    )
    _write_diagnostic(
        'webview2-env',
        args=os.environ.get('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', ''),
        data_dir=str(WEBVIEW2_DATA_DIR),
    )


def _reset_webview2_user_data():
    try:
        if WEBVIEW2_DATA_DIR.exists():
            shutil.rmtree(str(WEBVIEW2_DATA_DIR), ignore_errors=True)
        WEBVIEW2_DATA_DIR.mkdir(parents=True, exist_ok=True)
        _write_diagnostic('webview2-user-data-reset', path=str(WEBVIEW2_DATA_DIR))
        return True
    except Exception as exc:
        _write_diagnostic('webview2-user-data-reset-failed', error=str(exc))
        return False


def _show_windows_notice(title, message):
    if sys.platform != 'win32':
        return
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, message, title, 0x00000040)
    except Exception:
        pass


def _open_ui_browser_fallback(url=APP_URL, reason='unknown'):
    """Open the local UI in a dedicated browser window when native WebView fails."""
    profile_dir = APPDATA_DIR / 'ui-browser-profile'
    try:
        profile_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

    browser_path = None
    browser_label = 'system-default'
    try:
        from browser_manager import (
            find_local_chromium,
            find_playwright_chromium,
            find_system_browser_candidates,
        )
        for label, candidate in (
            ('bundled-playwright-chromium', find_playwright_chromium()),
            ('local-chromium', find_local_chromium()),
        ):
            if candidate and Path(candidate).exists():
                browser_path = candidate
                browser_label = label
                break
        if not browser_path:
            candidates = find_system_browser_candidates()
            if candidates:
                browser_path = candidates[0]
                browser_label = 'system-chrome-edge'
    except Exception as exc:
        _write_diagnostic('ui-browser-fallback-discovery-failed', error=str(exc))

    try:
        if browser_path:
            subprocess.Popen([
                browser_path,
                f'--app={url}',
                f'--user-data-dir={profile_dir}',
                '--no-first-run',
                '--disable-gpu',
                '--disable-extensions',
                '--window-size=1100,700',
            ], close_fds=True)
            _write_diagnostic(
                'ui-browser-fallback-open',
                reason=reason,
                browser=browser_path,
                label=browser_label,
                profile=str(profile_dir),
            )
            return True

        webbrowser.open(url)
        _write_diagnostic('ui-browser-fallback-open', reason=reason, label=browser_label)
        return True
    except Exception as exc:
        _write_diagnostic('ui-browser-fallback-failed', reason=reason, error=str(exc))
        print(f"[WebView] UI browser fallback failed: {exc}", file=sys.stderr)
        return False


def _webview_lib_candidates():
    try:
        if getattr(sys, 'frozen', False):
            exe_dir = Path(sys.executable).resolve().parent
            bundle_dir = Path(getattr(sys, '_MEIPASS', exe_dir))
            return [
                exe_dir / '_internal' / 'webview' / 'lib',
                bundle_dir / 'webview' / 'lib',
            ]
        if _HAS_WEBVIEW and getattr(webview, '__file__', None):
            return [Path(webview.__file__).resolve().parent / 'lib']
    except Exception:
        pass
    return []


def _check_packaged_edgechromium_deps():
    """Return missing pywebview EdgeChromium dependency files."""
    if sys.platform != 'win32':
        return []

    candidates = _webview_lib_candidates()
    roots = [candidate for candidate in candidates if candidate.exists()]
    root = roots[0] if roots else (candidates[0] if candidates else None)
    if root is None:
        missing = ['webview/lib']
    else:
        missing = [
            str(root.joinpath(*parts))
            for parts in EDGECHROMIUM_REQUIRED_FILES
            if not root.joinpath(*parts).exists()
        ]

    if missing:
        _write_diagnostic('edgechromium-deps-missing', missing=missing)
    else:
        _write_diagnostic('edgechromium-deps-ok', root=str(root))
    return missing


def _with_cache_buster(url):
    sep = '&' if '?' in url else '?'
    return f'{url}{sep}wv_reload={int(time.time())}'


def _safe_eval_rendered_text(window) -> int:
    """Return visible text length from the WebView document, or -1 on failure."""
    try:
        value = window.evaluate_js(
            """(() => {
                const body = document && document.body;
                if (!body) return 0;
                const text = (body.innerText || body.textContent || '').trim();
                return text.length;
            })()"""
        )
        return int(value or 0)
    except Exception as exc:
        print(f"[WebView] render check evaluate_js failed: {exc}", file=sys.stderr)
        return -1

_window = None
_lock = threading.Lock()
_on_close_callback = None  # 窗口关闭（退出）时的回调


class WebViewWindow:
    """管理 pywebview 原生窗口。"""

    def __init__(self, url=APP_URL, title="披星云伴侣", width=1100, height=700):
        self.url = url
        self.title = title
        self.width = width
        self.height = height
        self._started = False
        self._should_exit = False  # 用户真正想退出时设为 True
        self._render_confirmed = False
        self._native_problem_reported = False
        self._blank_reload_attempted = False

    def is_running(self):
        """检查窗口是否还在运行。"""
        if not _HAS_WEBVIEW or not self._started:
            return False
        try:
            return _window is not None and _window is not None
        except Exception:
            return False

    def show(self):
        """在主线程中启动 pywebview 窗口（阻塞调用）。

        当用户点击窗口的 X 按钮时，窗口会隐藏到托盘而不是退出。
        只有当 _should_exit 被设置为 True 时，窗口才会真正关闭。
        """
        global _window, _on_close_callback
        if not _HAS_WEBVIEW:
            print("[WebView] pywebview 不可用，无法启动原生窗口", file=sys.stderr)
            _write_diagnostic('pywebview-unavailable')
            _open_ui_browser_fallback(self.url, 'pywebview-unavailable')
            _show_windows_notice(
                'Pixingyun Mate',
                '披星云伴侣原生窗口组件不可用，请从官网下载最新版安装包并重新安装。',
            )
            return

        missing_deps = _check_packaged_edgechromium_deps()
        if missing_deps:
            print(f"[WebView] EdgeChromium dependencies missing: {missing_deps}", file=sys.stderr)
            _open_ui_browser_fallback(self.url, 'edgechromium-deps-missing')
            _show_windows_notice(
                'Pixingyun Mate',
                '披星云伴侣原生窗口依赖不完整，请从官网下载最新版安装包并重新安装。',
            )
            return

        _apply_webview2_compat_env()
        WEBVIEW2_DATA_DIR.mkdir(parents=True, exist_ok=True)

        # pywebview 设置
        webview.settings['ALLOW_DOWNLOADS'] = False
        webview.settings['ALLOW_FILE_URLS'] = False

        _window = webview.create_window(
            title=self.title,
            url=self.url,
            width=self.width,
            height=self.height,
            min_size=(800, 500),
            hidden=os.environ.get('PIXINGYUN_STARTUP_SILENT') == '1',
            focus=os.environ.get('PIXINGYUN_STARTUP_SILENT') != '1',
            text_select=False,
            easy_drag=False,
        )

        def _report_native_problem_once(reason):
            if self._native_problem_reported or self._should_exit:
                return
            self._native_problem_reported = True
            print(f"[WebView] native window render failed: {reason}", file=sys.stderr)
            _write_diagnostic('native-window-render-failed', reason=reason)
            _open_ui_browser_fallback(self.url, f'native-render-failed: {reason}')
            _show_windows_notice(
                'Pixingyun Mate',
                '披星云伴侣原生窗口渲染异常，请退出后重新打开；如果仍然白屏，请重新安装最新版。',
            )

        def _check_render_after(delay, reason):
            def _worker():
                time.sleep(delay)
                if self._render_confirmed or self._should_exit:
                    return
                global _window
                if _window is None:
                    _report_native_problem_once('window missing')
                    return
                text_len = _safe_eval_rendered_text(_window)
                if text_len > 20:
                    self._render_confirmed = True
                    print(f"[WebView] render confirmed, text_len={text_len}")
                    _write_diagnostic('render-confirmed', text_len=text_len)
                    return
                if not self._blank_reload_attempted:
                    self._blank_reload_attempted = True
                    _write_diagnostic('blank-render-reload', reason=reason, text_len=text_len)
                    try:
                        _window.load_url(_with_cache_buster(self.url))
                        _check_render_after(4, 'blank after reload')
                        return
                    except Exception as exc:
                        _write_diagnostic('blank-render-reload-failed', error=str(exc))
                if text_len <= 0:
                    _reset_webview2_user_data()
                _report_native_problem_once(f'{reason}, text_len={text_len}')
            threading.Thread(target=_worker, daemon=True).start()

        def _on_loaded():
            print("[WebView] page loaded event received")
            _check_render_after(1.5, 'loaded but blank')

        try:
            _window.events.loaded += _on_loaded
        except Exception as e:
            print(f"[WebView] 无法注册 loaded 事件: {e}")

        # ── 拦截关闭事件：隐藏到托盘而不是退出 ──
        def _on_closing():
            if not self._should_exit:
                # 用户点 X → 隐藏到托盘
                print("[WebView] 窗口隐藏到托盘（点击托盘图标可恢复）")
                try:
                    _window.hide()
                except Exception:
                    pass
                return False  # 阻止关闭
            else:
                # 真正退出
                print("[WebView] 窗口正在关闭...")
                return True

        try:
            _window.events.closing += _on_closing
        except Exception as e:
            print(f"[WebView] 无法注册 closing 事件: {e}")
            # 回退：不拦截关闭

        # 窗口真正关闭后的回调
        def _on_closed():
            print("[WebView] 窗口已关闭")
            if _on_close_callback:
                try:
                    _on_close_callback()
                except Exception:
                    pass

        try:
            _window.events.closed += _on_closed
        except Exception:
            pass

        self._started = True
        print(f"[WebView] 原生窗口已启动: {self.url}")
        _check_render_after(12, 'load watchdog timeout')

        # start() 阻塞主线程，直到窗口关闭
        try:
            if sys.platform == 'win32':
                webview.start(
                    debug=False,
                    gui='edgechromium',
                    private_mode=False,
                    storage_path=str(WEBVIEW2_DATA_DIR),
                )
            else:
                webview.start(debug=False)
        except TypeError:
            webview.start(debug=False, gui='edgechromium' if sys.platform == 'win32' else None)
        except Exception as exc:
            print(f"[WebView] native window failed: {exc}", file=sys.stderr)
            _write_diagnostic('native-window-start-failed', error=str(exc))
            _open_ui_browser_fallback(self.url, f'native-start-failed: {exc}')
            _show_windows_notice(
                'Pixingyun Mate',
                '披星云伴侣原生窗口启动失败，请从官网下载最新版安装包并重新安装。',
            )
            return

        print("[WebView] 主循环已退出")

    def request_exit(self):
        """请求真正退出程序（隐藏窗口并让 start() 返回）。"""
        self._should_exit = True
        global _window
        with _lock:
            if _window is not None:
                try:
                    _window.show()
                    _window.destroy()
                except Exception:
                    pass

    def close(self):
        """关闭窗口（强制退出）。"""
        self._should_exit = True
        global _window
        with _lock:
            if _window is not None:
                try:
                    _window.destroy()
                except Exception:
                    pass
                _window = None


def is_available():
    """检查 pywebview 是否可用。"""
    return _HAS_WEBVIEW and not _check_packaged_edgechromium_deps()


def show_window():
    """从其他线程恢复/显示原生窗口（供托盘菜单"打开主界面"调用）。

    如果窗口已隐藏，调用此函数会重新显示窗口。
    """
    global _window
    if not _HAS_WEBVIEW or _window is None:
        print("[WebView] 窗口未运行，无法恢复")
        return False
    try:
        _window.show()
        # 恢复焦点
        try:
            _window.restore()
        except Exception:
            pass
        print("[WebView] 窗口已恢复显示")
        return True
    except Exception as e:
        print(f"[WebView] 恢复窗口失败: {e}")
        return False


def close():
    """模块级函数：关闭窗口（供 companion_app 的 _on_exit 调用）。"""
    global _window
    with _lock:
        if _window is not None:
            try:
                _window.destroy()
            except Exception:
                pass
            _window = None


def set_on_close_callback(callback):
    """设置窗口真正关闭时的回调函数。"""
    global _on_close_callback
    _on_close_callback = callback
