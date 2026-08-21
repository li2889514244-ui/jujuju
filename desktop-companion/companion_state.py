"""
companion_state.py — Shared global state for the Pixing Desktop Companion.

All modules import from here to avoid circular dependencies.
Mutate state via ``import companion_state as state; state._foo = bar``
(not ``from companion_state import _foo; _foo = bar`` — that only changes a local copy).
"""
import threading
from pathlib import Path
import os, sys

# ── Constants ──────────────────────────────────────────────────────────
APP_VERSION = '3.2.77'
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
    'douyin':       {'name': '抖音',     'url': 'https://creator.douyin.com/',        'key': 'DOUYIN'},
    'xiaohongshu':  {'name': '小红书',   'url': 'https://creator.xiaohongshu.com/',    'key': 'XIAOHONGSHU'},
    'kuaishou':     {'name': '快手',     'url': 'https://cp.kuaishou.com/',            'key': 'KUAISHOU'},
    'tencent':      {'name': '视频号',   'url': 'https://channels.weixin.qq.com/',     'key': 'WECHAT_VIDEO'},
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

# ── Paths ──────────────────────────────────────────────────────────────
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

# ── Browser / CDP mutable state ────────────────────────────────────────
_BROWSER_PATH = None        # set by _find_browser()
_BROWSER_CHANNEL = None     # set by _find_browser()
_cdp = None                 # ChromeCDP instance, set by companion_app at startup
_CDP_URL = None             # set by _ensure_cdp_running()
_cdp_lock = threading.Lock()

# ── Config cache ───────────────────────────────────────────────────────
_CONFIG_CACHE = {}          # populated by _load_config()

# ── Collector state ────────────────────────────────────────────────────
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

# ── Doudian scheduler state ────────────────────────────────────────────
_doudian_scheduler_started = False
_doudian_scheduler_lock = threading.Lock()
_doudian_sync_lock = threading.Lock()
_doudian_next_run_at = None
_doudian_schedule_interval = None
_doudian_last_run = None
_doudian_last_error = None
_doudian_active_task = None
_doudian_last_pre_report_sync_date = None

# ── Scan-bind sessions ─────────────────────────────────────────────────
active_sessions = {}  # session_id → dict
scan_status = {}      # session_id → status (browser/uploading/done/error)
scan_errors = {}      # session_id → last error message for polling UI
scan_cancelled = set()
doudian_jobs = {}     # job_id → status dict
