"""
companion_state.py 鈥?Shared global state for the Pixing Desktop Companion.

All modules import from here to avoid circular dependencies.
Mutate state via ``import companion_state as state; state._foo = bar``
(not ``from companion_state import _foo; _foo = bar`` 鈥?that only changes a local copy).
"""
import threading
from pathlib import Path
import os, sys

# 鈹€鈹€ Constants 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
APP_VERSION = '3.2.107'
DEFAULT_UPDATE_MANIFEST_URL = 'https://ddddkiii.com/companion-updates/latest.json'

# CORS whitelist
_ALLOWED_ORIGINS = {
    'https://ddddkiii.com',
    'https://www.ddddkiii.com',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://localhost:5409',
    'http://127.0.0.1:5409',
}

# Platform configuration
PLATFORMS = {
    'douyin':       {'name': '\u6296\u97f3',     'url': 'https://creator.douyin.com/',        'key': 'DOUYIN'},
    'xiaohongshu':  {'name': '\u5c0f\u7ea2\u4e66',   'url': 'https://creator.xiaohongshu.com/',    'key': 'XIAOHONGSHU'},
    'kuaishou':     {'name': '\u5feb\u624b',     'url': 'https://cp.kuaishou.com/',            'key': 'KUAISHOU'},
    'tencent':      {'name': '\u89c6\u9891\u53f7',   'url': 'https://channels.weixin.qq.com/',     'key': 'WECHAT_VIDEO'},
}

# Default collection post count. 0 means full collection.
_DEFAULT_QUICK_MAX_POSTS = 20
_DEFAULT_FULL_MAX_POSTS = 0

# Token refresh
_TOKEN_REFRESH_INTERVAL = 1800  # 30 min
_TOKEN_REFRESH_MARGIN = 300     # 5 min before expiry

# Cookie age thresholds
_COOKIE_AGE_WARN_HOURS = 23
_COOKIE_AGE_EXPIRED_HOURS = 48

# CDP
_CDP_PORT = 9222

# 鈹€鈹€ Paths 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent.resolve()
    # In PyInstaller onefile mode, --add-data files are extracted to sys._MEIPASS.
    # In onedir mode, they are under BASE_DIR/_internal/.
    _meipass = getattr(sys, '_MEIPASS', None)
    if _meipass and Path(_meipass, 'static').exists():
        STATIC_DIR = str(Path(_meipass) / 'static')
    else:
        STATIC_DIR = str(BASE_DIR / '_internal' / 'static')
else:
    BASE_DIR = Path(__file__).parent.resolve()
    STATIC_DIR = 'static'

_PROFILE_ROOT = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'MatrixFlow' / 'browser-profiles'
_APPDATA_DIR = Path.home() / 'AppData' / 'Local' / 'MatrixFlow'
_APPDATA_DIR.mkdir(parents=True, exist_ok=True)

# 鈹€鈹€ Browser / CDP mutable state 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
_BROWSER_PATH = None        # set by _find_browser()
_BROWSER_CHANNEL = None     # set by _find_browser()
_cdp = None                 # ChromeCDP instance, set by companion_app at startup
_CDP_URL = None             # set by _ensure_cdp_running()
_cdp_lock = threading.Lock()

# 鈹€鈹€ UI 模式与启动诊断（监控中心 Phase 2）鈹€鈹€
_ui_mode = 'unknown'              # webview / browser
_ui_fallback_reason = None        # 浏览器降级原因（如 edgechromium-deps-missing）
_ui_fallback_at = None
_webview2_runtime_version = None  # 系统 WebView2 运行时版本（注册表读取，可能为 None）

# 鈹€鈹€ Config cache 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
_CONFIG_CACHE = {}          # populated by _load_config()

# 鈹€鈹€ Collector state 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
_collector_running = False
_collector_lock = threading.Lock()
_collector_last_run = None
_collector_last_error = None
_collector_next_run_at = None
_collector_schedule_interval = None
_collector_schedule_mode = 'full'
_collector_schedule_max_posts = _DEFAULT_FULL_MAX_POSTS
_collector_progress = {
    'total': 0, 'current': 0, 'nickname': '',
    'phase': '', 'video_page': 0, 'video_count': 0,
    'mode': 'full', 'max_posts': _DEFAULT_FULL_MAX_POSTS,
}
_collector_paused = False
_collector_loop_lock = threading.Lock()
_collector_loop_started = False

# 鈹€鈹€ Doudian scheduler state 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
_doudian_scheduler_started = False
_doudian_scheduler_lock = threading.Lock()
_doudian_sync_lock = threading.Lock()
_doudian_next_run_at = None
_doudian_schedule_interval = None
_doudian_last_run = None
_doudian_last_error = None
_doudian_active_task = None
_doudian_last_pre_report_sync_date = None

# 鈹€鈹€ Scan-bind sessions 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
active_sessions = {}  # session_id 鈫?dict
scan_status = {}      # session_id 鈫?status (browser/uploading/done/error)
scan_errors = {}      # session_id 鈫?last error message for polling UI
scan_cancelled = set()
doudian_jobs = {}     # job_id 鈫?status dict


