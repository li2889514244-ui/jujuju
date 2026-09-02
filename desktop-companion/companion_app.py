"""
披星云桌面伴侣 v4.0 — 模块化架构
主入口：Flask 路由 + 系统托盘 + pywebview 窗口
用法: python companion_app.py
"""
import sys as _sys, os as _os
# PyInstaller console=False: redirect stdout/stderr to log file
if _sys.stdout is None or _sys.stderr is None:
    _base = _os.path.dirname(_sys.executable) if getattr(_sys, 'frozen', False) else _os.path.dirname(_os.path.abspath(__file__))
    _log_f = open(_os.path.join(_base, 'companion.log'), 'w', encoding='utf-8')
    if _sys.stdout is None:
        _sys.stdout = _log_f
    if _sys.stderr is None:
        _sys.stderr = _log_f

_single_instance_lock_handle = None

def _ensure_single_instance() -> None:
    """Exit immediately when another desktop companion process is running."""
    global _single_instance_lock_handle
    try:
        import msvcrt
        lock_dir = _os.path.join(_os.environ.get('LOCALAPPDATA') or _os.path.expanduser('~'), 'MatrixFlow')
        _os.makedirs(lock_dir, exist_ok=True)
        lock_path = _os.path.join(lock_dir, 'pixingyun-mate.lock')
        handle = open(lock_path, 'a+b')
        try:
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            print('[Main] Another pixingyun-mate instance is already running; exiting.')
            _sys.exit(0)
        _single_instance_lock_handle = handle
    except Exception as exc:
        print(f'[Main] single-instance lock warning: {exc}')

_ensure_single_instance()

import asyncio, json, logging, os, re, sys, tempfile, threading, time, uuid, base64, hashlib, shutil, subprocess, webbrowser
from pathlib import Path
from queue import Queue, Empty
from flask import Flask, request, jsonify, Response, make_response, send_from_directory
from pixing_worker import start_worker, stop_worker, get_status as get_worker_status
from chrome_cdp import ChromeCDP
from douyin_api_collector import collect_douyin_data

try:
    for _stream in (sys.stdout, sys.stderr):
        if _stream is not None and hasattr(_stream, 'reconfigure'):
            _stream.reconfigure(encoding='utf-8', errors='replace')
except Exception as _e:
    if sys.stdout is not None:
        print(f'[WARN] {type(_e).__name__}: {_e}')

# ── Modular imports ──
import companion_state as state
from companion_encoding import read_text_file
from companion_state import (
    APP_VERSION,
    DEFAULT_UPDATE_MANIFEST_URL,
    PLATFORMS,
    _ALLOWED_ORIGINS,
    _COOKIE_AGE_EXPIRED_HOURS,
    _COOKIE_AGE_WARN_HOURS,
)
from companion_crypto import _get_encryption_key, _encrypt_password, _decrypt_password, _HAS_CRYPTO
from companion_config import _load_config, _save_config, CONFIG_FILE
from companion_browser import _find_browser
from companion_updater import (
    _is_newer_version, _get_update_manifest_url, _resolve_update_url,
    _fetch_update_manifest, _download_update_package, _start_update_process,
    _begin_update_status, _finish_update_status, _fail_update_status,
    _friendly_update_failure,
    _get_update_status, _set_update_status,
    _should_prompt_update, _mark_update_prompt_shown, _snooze_update_prompt,
)
from companion_auth import _login_with_saved_credentials, _check_and_refresh_token, _start_token_refresh_daemon, _saved_identifier, _login_payload
from companion_collector import (
    _run_collection_once, _data_collector_loop, _get_collection_interval,
    _schedule_next_collection, _record_scan_time, _get_cookie_status,
    _run_startup_collection_if_stale,
)
from companion_metrics import _scrape_all, _sanitize_text, _parse_metric_num
from companion_login_worker import _make_login_worker

_CLEAN_UI_FALLBACK = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>披星云伴侣</title>
<style>body{font:14px/1.7 "Microsoft YaHei","Segoe UI",Arial,sans-serif;margin:0;display:grid;place-items:center;height:100vh;background:#f5f7fb;color:#172033}.box{padding:28px 32px;background:#fff;border:1px solid #dde5ef;border-radius:10px;box-shadow:0 10px 30px rgba(15,23,42,.08);max-width:420px}h1{font-size:20px;margin:0 0 8px}.sub{color:#5d6b7d}</style></head>
<body><div class="box"><h1>披星云伴侣</h1><div class="sub">界面资源加载失败，请重启披星云伴侣或重新安装最新版。</div></div></body></html>"""

# UI HTML (from companion_clean_ui)
try:
    from companion_clean_ui import UI_HTML as UI_HTML
except Exception as _ui_error:
    print(f'[UI] clean ui unavailable: {_ui_error}', flush=True)
    UI_HTML = _CLEAN_UI_FALLBACK

# Flask app
app = Flask(__name__, static_folder=state.STATIC_DIR)

_SENSITIVE_QUERY_RE = re.compile(r'(?i)(token|refreshToken|refresh_token|access_token|authorization)=([^&\s"]+)')


class _RedactSensitiveRequestFilter(logging.Filter):
    def filter(self, record):
        try:
            if isinstance(record.msg, str):
                record.msg = _SENSITIVE_QUERY_RE.sub(r'\1=[redacted]', record.msg)
            if record.args:
                record.args = tuple(
                    _SENSITIVE_QUERY_RE.sub(r'\1=[redacted]', arg) if isinstance(arg, str) else arg
                    for arg in record.args
                )
        except Exception:
            pass
        return True


logging.getLogger('werkzeug').addFilter(_RedactSensitiveRequestFilter())
_update_apply_lock = threading.Lock()
_scan_bind_lock = threading.Lock()
_feishu_login_lock = threading.Lock()
_feishu_login_sessions: dict[str, dict] = {}

# ── CORS ──
@app.after_request
def _add_cors_headers(resp):
    origin = request.headers.get('Origin', '')
    if origin in _ALLOWED_ORIGINS:
        resp.headers['Access-Control-Allow-Origin'] = origin
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Service-Token'
        resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS'
        resp.headers['Access-Control-Allow-Private-Network'] = 'true'
        resp.headers['Vary'] = 'Origin'
    # 对不在白名单中的 Origin，不设置 CORS 头 → 浏览器会拒绝跨域请求
    return resp

def _allowed_cors_origin():
    origin = request.headers.get('Origin', '')
    return origin if origin in _ALLOWED_ORIGINS else None

def _is_trusted_local_handoff() -> bool:
    """Allow Feishu web login handoff only from our site or a same-origin local call."""
    origin = (request.headers.get('Origin') or '').strip()
    return (not origin) or (origin in _ALLOWED_ORIGINS)

# ── Browser/CDP initialization (delegated to companion_browser) ──


def _get_doudian_stores() -> list[dict]:
    cfg = _load_config()
    stores = cfg.get('doudian_stores') or []
    return stores if isinstance(stores, list) else []


def _save_doudian_stores(stores: list[dict]) -> None:
    cfg = _load_config()
    cfg['doudian_stores'] = stores
    _save_config(cfg)
    state._CONFIG_CACHE.update(cfg)


def _get_doudian_collection_interval() -> int:
    cfg = _load_config()
    raw_minutes = cfg.get('doudian_sync_interval_minutes', 30)
    try:
        minutes = int(raw_minutes)
    except Exception:
        minutes = 30
    minutes = max(10, min(minutes, 24 * 60))
    return minutes * 60


def _schedule_next_doudian_collection(delay_seconds: int | None = None) -> int:
    interval = int(delay_seconds if delay_seconds is not None else _get_doudian_collection_interval())
    interval = max(60, interval)
    state._doudian_schedule_interval = interval
    state._doudian_next_run_at = time.time() + interval
    return interval
state._BROWSER_PATH, state._BROWSER_CHANNEL = _find_browser()
print(f'[Browser] path={state._BROWSER_PATH} channel={state._BROWSER_CHANNEL}')
state._cdp = ChromeCDP(port=state._CDP_PORT, chrome_path=state._BROWSER_PATH)

# ┢�┢� HTML UI ┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�
UI_HTML = r'''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>披星云伴�?/title>
<style>
:root{--sidebar-w:220px;--sidebar-bg:#141829;--sidebar-hover:#1e2640;--sidebar-active:#2a3558;--accent:#4f6ef7;--accent-hover:#3d5bd9;--danger:#e05050;--success:#34c759;--text:#1d1d1f;--text2:#6e6e73;--border:#e5e5ea;--bg:#f2f2f7;--card-bg:#ffffff;--radius:6px}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden}
body{font-family:"Segoe UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif;background:var(--bg);color:var(--text);font-size:13px;user-select:none;-webkit-user-select:none;display:flex}

/* ┢�┢� Sidebar ┢�┢� */
.sidebar{width:var(--sidebar-w);min-width:var(--sidebar-w);background:var(--sidebar-bg);color:#b0b8d0;display:flex;flex-direction:column;overflow:hidden}
.sidebar-logo{display:flex;align-items:center;gap:10px;padding:20px 18px;border-bottom:1px solid rgba(255,255,255,.06)}
.sidebar-logo .logo-icon{width:32px;height:32px;border-radius:var(--radius);background:linear-gradient(135deg,#4f6ef7,#7c5cfc);display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;flex-shrink:0}
.sidebar-logo .logo-text{font-size:15px;font-weight:600;color:#e8ecf4;letter-spacing:.5px}
.sidebar-logo .logo-ver{font-size:10px;color:#6b7394;margin-left:auto}

.sidebar-nav{flex:1;overflow-y:auto;padding:8px}
.sidebar-nav .nav-section{font-size:10px;text-transform:uppercase;color:#5b6388;padding:12px 10px 6px;letter-spacing:1px;font-weight:600}
.sidebar-nav .nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius);cursor:pointer;transition:all .12s;margin-bottom:2px;font-size:13px}
.sidebar-nav .nav-item:hover{background:var(--sidebar-hover);color:#d0d6ee}
.sidebar-nav .nav-item.active{background:var(--sidebar-active);color:#fff;font-weight:500}
.sidebar-nav .nav-item .plat-icon{font-size:18px;width:24px;text-align:center;flex-shrink:0}
.sidebar-nav .nav-item .plat-name{flex:1}
.sidebar-nav .nav-item .plat-badge{font-size:10px;background:rgba(255,255,255,.12);padding:1px 7px;border-radius:10px}

.sidebar-bottom{padding:12px;border-top:1px solid rgba(255,255,255,.06)}
.sidebar-status{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--radius);font-size:11px;color:#8890b0}
.sidebar-status .ind{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.sidebar-status .ind.on{background:var(--success);box-shadow:0 0 6px rgba(52,199,89,.5)}
.sidebar-status .ind.off{background:#ff9500}
.sidebar-footer-btns{display:flex;gap:6px;margin-top:8px}
.sidebar-footer-btns button{flex:1;padding:6px 0;border:none;border-radius:var(--radius);font-size:11px;cursor:pointer;transition:.12s}
.btn-collect{background:rgba(79,110,247,.15);color:#8ba4ff}
.btn-collect:hover{background:rgba(79,110,247,.25)}
.btn-collect-full{background:rgba(255,149,0,.12);color:#ffb454}
.btn-collect-full:hover{background:rgba(255,149,0,.2)}
.btn-pw{background:rgba(255,149,0,.12);color:#ffb84d}
.btn-pw:hover{background:rgba(255,149,0,.2)}

/* ┢�┢� Content Area ┢�┢� */
.content{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
.content-toolbar{display:flex;align-items:center;gap:12px;padding:14px 24px;background:var(--card-bg);border-bottom:1px solid var(--border);min-height:52px}
.content-toolbar h2{font-size:15px;font-weight:600;color:var(--text)}
.content-toolbar .online-dot{width:7px;height:7px;border-radius:50%;margin-left:auto}
.content-body{flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center}

/* ┢�┢� Login Panel (centered) ┢�┢� */
.login-wrapper{display:flex;align-items:center;justify-content:center;width:100%;height:100%}
.login-card{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:40px;width:380px;box-shadow:0 2px 20px rgba(0,0,0,.06)}
.login-card .login-logo{text-align:center;margin-bottom:28px}
.login-card .login-logo .li{font-size:36px;margin-bottom:8px}
.login-card .login-logo h1{font-size:20px;font-weight:600;color:var(--text)}
.login-card .login-logo p{font-size:12px;color:var(--text2);margin-top:4px}
.login-card .field{margin-bottom:16px}
.login-card .field label{display:block;font-size:12px;font-weight:500;color:var(--text2);margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px}
.login-card .field input{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px;outline:none;transition:.12s;font-family:inherit;background:#fafafa}
.login-card .field input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(79,110,247,.12);background:#fff}
.login-card .field-check{display:flex;align-items:center;gap:8px;margin-bottom:20px;font-size:12px;color:var(--text2);cursor:pointer}
.login-card .field-check input{width:15px;height:15px;accent-color:var(--accent)}
.login-card .login-btn{width:100%;padding:11px;border:none;border-radius:var(--radius);background:var(--accent);color:#fff;font-size:14px;font-weight:500;cursor:pointer;transition:.12s;font-family:inherit}
.login-card .login-btn:hover{background:var(--accent-hover)}
.login-card .login-btn:disabled{opacity:.6;cursor:default}
.login-card .login-err{color:var(--danger);font-size:12px;margin-top:10px;text-align:center}

/* ┢�┢� Main Workspace ┢�┢� */
.workspace{width:100%;max-width:640px}
.workspace-empty{text-align:center;padding:60px 20px;color:var(--text2)}
.workspace-empty .empty-icon{font-size:48px;margin-bottom:16px;opacity:.4}
.workspace-empty h3{font-size:16px;color:var(--text);margin-bottom:8px}
.workspace-empty p{font-size:13px;line-height:1.7}

/* ┢�┢� Status States ┢�┢� */
.scan-card{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:32px;text-align:center}
.scan-card .scan-title{font-size:15px;font-weight:600;margin-bottom:20px;color:var(--text)}
.spinner{width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}
.progress-bar{height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin:12px 0}
.progress-bar .fill{height:100%;background:var(--accent);border-radius:2px;transition:width .4s}
.step-list{text-align:left;display:inline-block}
.step-row{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:13px;color:var(--text2)}
.step-num{width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.result-ok{font-size:40px;margin-bottom:12px}
.result-ok.success{color:var(--success)}
.result-msg{font-size:14px;margin-bottom:6px}
.result-sub{font-size:12px;color:var(--text2)}
.result-err{color:var(--danger);font-size:14px;margin-bottom:12px}

.btn{display:inline-block;padding:9px 22px;border:none;border-radius:var(--radius);font-size:13px;font-weight:500;cursor:pointer;transition:.12s;font-family:inherit}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{background:var(--accent-hover)}
.btn-success{background:var(--success);color:#fff}
.btn-success:hover{background:#2db84e}
.btn-secondary{background:#e5e5ea;color:var(--text)}
.btn-secondary:hover{background:#d5d5da}
.btn-sm{padding:5px 12px;font-size:11px}
.mt12{margin-top:12px}.mt8{margin-top:8px}

/* ┢�┢� Account List ┢�┢� */
.acct-list{margin-top:20px}
.acct-list h4{font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
.acct-actions{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}
.acct-collect-btn{border:1px solid #d9def8;background:#f7f8ff;color:#3d5bd9;border-radius:5px;padding:7px 10px;font-size:12px;font-weight:600;cursor:pointer}
.acct-collect-btn:hover{background:#eef2ff}
.acct-collect-btn:disabled{opacity:.55;cursor:not-allowed}
.acct-groups{display:grid;gap:14px}
.acct-group-title{display:flex;align-items:center;justify-content:space-between;font-size:12px;font-weight:700;color:var(--text);padding:6px 0;border-bottom:1px solid #e8e8ee}
.acct-group-title small{font-size:11px;color:var(--text2);font-weight:500}
.acct-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f3;font-size:12px}
.acct-row .acct-name{color:var(--text);font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acct-row .acct-time{color:var(--text2);font-size:11px;flex-shrink:0}
.acct-row .acct-time.warn{color:var(--danger)}
.acct-row .acct-del{color:var(--danger);font-size:11px;cursor:pointer;flex-shrink:0;padding:2px 6px;border-radius:3px}
.acct-row .acct-del:hover{background:rgba(224,80,80,.1)}

/* ┢�┢� Cookie Alerts ┢�┢� */
.cookie-alert{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#fff8e1;border-radius:var(--radius);margin-top:6px;font-size:11px}
.cookie-alert.warn{background:#fff3f3}
.schedule-panel{margin-top:8px;padding:8px 10px;border-radius:var(--radius);background:rgba(255,255,255,.06);font-size:11px;color:#aeb6d8;line-height:1.7}
.schedule-panel b{color:#fff;font-weight:600}
.schedule-panel .ok{color:#73d99f}
</style></head><body>

<!-- ══�?SIDEBAR ══�?-->
<aside class="sidebar">
  <div class="sidebar-logo">
    <div class="logo-icon">&#10025;</div>
    <span class="logo-text">披星�?/span>
    <span class="logo-ver">v3.2</span>
  </div>

  <!-- Platform navigation -->
  <nav class="sidebar-nav" v-if="configured">
    <div class="nav-section">平台</div>
    <div class="nav-item" v-for="p in platforms" :key="p.id" :class="{active:selected===p.id}" @click="selectPlatform(p.id)">
      <span class="plat-icon">{{p.icon}}</span>
      <span class="plat-name">{{p.name}}</span>
    </div>
  </nav>

  <!-- Bottom status + actions -->
  <div class="sidebar-bottom" v-if="configured">
    <div class="sidebar-status">
      <span class="ind" :class="siteConnected?'on':'off'"></span>
      <span>{{siteConnected?'已连�?MatrixFlow':'等待连接...'}}</span>
    </div>
    <div class="sidebar-footer-btns">
      <button class="btn-collect" @click="triggerCollect('quick')" :disabled="collecting">{{collecting?'采集�?..':'快采�?0�?}}</button>
      <button class="btn-collect-full" @click="triggerCollect('full')" :disabled="collecting">全量</button>
    </div>
    <div class="schedule-panel" v-if="dcProgress && dcProgress.schedule">
      <div>定时�?b>{{scheduleModeText(dcProgress.schedule)}}</b></div>
      <div>下次�?b>{{scheduleCountdownText(dcProgress.schedule)}}</b></div>
      <div v-if="dcProgress.schedule.last_success" class="ok">朢�近成功：{{runTimeText(dcProgress.schedule.last_success)}} · {{dcProgress.schedule.last_success.accounts_reported||0}}个账�?/div>
      <div v-else>朢�近成功：暂无记录</div>
    </div>
    <div class="collect-progress" v-if="dcProgress && dcProgress.running" style="padding:8px 12px;font-size:11px;color:#8890b0">
      <div style="margin-bottom:4px">{{dcProgress.progress?.nickname||'采集'}} ({{dcProgress.progress?.current||0}}/{{dcProgress.progress?.total||0}})</div>
      <div style="margin-bottom:4px">{{dcProgress.progress?.phase||''}} · {{dcProgress.progress?.mode==='full'?'全量':'快采�?}}</div>
      <div class="progress-bar" style="background:rgba(255,255,255,.08);height:3px;border-radius:2px">
        <div class="fill" :style="{width:Math.round((dcProgress.progress?.current||0)/(dcProgress.progress?.total||1)*100)+'%',height:'100%',background:'var(--accent)',borderRadius:'2px'}"></div>
      </div>
      <div v-if="dcProgress.progress?.video_page>1" style="margin-top:3px;font-size:10px">视频第{{dcProgress.progress.video_page}}�?/ {{dcProgress.progress.video_count}}�?/div>
    </div>
  </div>
</aside>

<!-- ══�?CONTENT ══�?-->
<main class="content">

  <!-- Toolbar -->
  <header class="content-toolbar" v-if="configured">
    <h2>{{selectedPlatform?selectedPlatform.name+' - 扫码绑定':'选择左侧平台弢�始操�?}}</h2>
    <div class="online-dot" :style="{background:siteConnected?'#34c759':'#ff9500'}"></div>
  </header>

  <div class="content-body">

    <!-- ┢�┢� Login Screen ┢�┢� -->
    <div class="login-wrapper" v-if="!configured">
      <div class="login-card">
        <div class="login-logo">
          <div class="li">&#10025;</div>
          <h1>披星云伴�?/h1>
          <p>多平台矩阵账号管理桌面工�?/p>
        </div>
        <div class="field"><label>邮箱 / 手机号</label><input v-model="loginEmail" placeholder="输入邮箱或手机号" @keyup.enter="doLogin"></div>
        <div class="field"><label>密码</label><input v-model="loginPass" type="password" placeholder="输入密码" @keyup.enter="doLogin"></div>
        <label class="field-check"><input type="checkbox" v-model="rememberPwd">记住密码（自动登录）</label>
        <div class="login-err" v-if="loginError">{{loginError}}</div>
        <button class="login-btn" @click="doLogin" :disabled="loginLoading">{{loginLoading?'登录�?..':'�?�?}}</button>
      </div>
    </div>

    <!-- ┢�┢� Workspace (after login) ┢�┢� -->
    <div class="workspace" v-if="configured">

      <!-- Empty / idle state -->
      <div class="workspace-empty" v-if="status==='idle'&&!selected">
        <div class="empty-icon">&#8592;</div>
        <h3>选择平台弢��?/h3>
        <p>在左侧导航栏选择丢�个平�?br>Chrome 浏览器将自动打开对应平台的登录页</p>
      </div>

      <!-- Idle with platform selected -->
      <div class="scan-card" v-if="status==='idle'&&selected">
        <div class="scan-title">{{selectedPlatform.name}} 扫码绑定</div>
        <div class="step-list">
          <div class="step-row"><span class="step-num">1</span>打开 MatrixFlow 网站并登�?/div>
          <div class="step-row"><span class="step-num">2</span>点击"添加账号"按钮</div>
          <div class="step-row"><span class="step-num">3</span>网站自动连接桌面伴侣</div>
          <div class="step-row"><span class="step-num">4</span>Chrome 弹出 �?手机扫码登录</div>
        </div>
        <div style="margin-top:20px">
          <button class="btn btn-primary" @click="selectPlatform(selected)" :disabled="status==='loading'||status==='browser'||status==='uploading'">弢�始绑�?/button>
        </div>
      </div>

      <!-- Loading -->
      <div class="scan-card" v-if="status==='loading'">
        <div class="spinner"></div>
        <p style="color:var(--text2);font-size:13px">正在启动浏览�?..</p>
        <div class="progress-bar"><div class="fill" :style="{width:progress+'%'}"></div></div>
      </div>

      <!-- Browser open -->
      <div class="scan-card" v-if="status==='browser'">
        <div class="result-ok success">&#10003;</div>
        <p class="result-msg" style="font-weight:600">Chrome 浏览器已打开</p>
        <p style="color:var(--text2);font-size:13px;margin:8px 0">请在 Chrome 窗口中完成扫码登�?/p>
        <button class="btn btn-success mt12" style="font-size:14px;padding:10px 28px" @click="confirmLogin">已完成登录，提取 Cookie</button>
        <br><button class="btn btn-secondary btn-sm mt8" @click="cancelScan">取消</button>
      </div>

      <!-- Uploading -->
      <div class="scan-card" v-if="status==='uploading'">
        <div class="spinner"></div>
        <p style="color:var(--text2);font-size:13px">正在绑定账号、完成初始采集并同步到网站...</p>
      </div>

      <!-- Done -->
      <div class="scan-card" v-if="status==='done'">
        <div class="result-ok success">&#10003;</div>
        <p class="result-msg" style="font-weight:600">绑定和初始采集完成</p>
        <p class="result-sub">网站已收到采集结果，刷新 MatrixFlow 网页即可查看</p>
        <button class="btn btn-primary mt12" @click="reset">继续绑定其他平台</button>
      </div>

      <!-- Error -->
      <div class="scan-card" v-if="status==='error'">
        <p class="result-err">{{errorMsg}}</p>
        <button class="btn btn-primary" @click="reset">重试</button>
      </div>

      <!-- Account list -->
      <div class="acct-list" v-if="localAccounts.length">
        <h4>已绑定账�?({{localAccounts.length}})</h4>
        <div class="acct-actions">
          <button class="acct-collect-btn" @click="triggerCollect('quick','WECHAT_VIDEO')" :disabled="collecting">视频号采集</button>
          <button class="acct-collect-btn" @click="triggerCollect('quick','DOUYIN')" :disabled="collecting">抖音采集</button>
        </div>
        <div class="acct-groups">
          <div class="acct-group" v-for="g in groupedLocalAccounts" :key="g.key">
            <div class="acct-group-title"><span>{{g.name}}</span><small>{{g.items.length}} �?/small></div>
            <div class="acct-row" v-for="a in g.items" :key="a.id">
              <span class="acct-name">{{a.nickname||a.platform_uid||a.id.slice(0,8)}}</span>
              <span class="acct-time" :class="{warn:a.needs_rescan}">{{accountStatusText(a)}}</span>
              <span class="acct-del" @click="removeLocalAccount(a.id)">删除</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</main>

<script src="/static/vue.global.prod.js"></script>
<script>
const {createApp}=Vue
createApp({data(){return{
  platforms:[{id:'douyin',name:'抖音',icon:'🎵',hint:'扫码登录'},{id:'xiaohongshu',name:'小红�?,icon:'📕',hint:'扫码登录'},{id:'kuaishou',name:'快手',icon:'🎬',hint:'扫码登录'},{id:'tencent',name:'视频�?,icon:'📺',hint:'微信扫码'}],
  selected:'',status:'idle',qrUrl:'',errorMsg:'',siteConnected:false,evtSource:null,progress:0,timer:null,scanPollTimer:null,platformFromUrl:'',tokenFromUrl:'',apiFromUrl:'',sessionId:'',
  configured:false,loginEmail:'',loginPass:'',loginLoading:false,loginError:'',rememberPwd:true,loginHint:'',
  cookieStatus:null,cookieAlerts:[],cookieFreshness:'',collecting:false,
  dcProgress:null,_dcPollTimer:null,
  pwRunning:false,pwCompleted:0,pwTask:'',
  localAccounts:[],
}},computed:{
  selectedPlatform(){return this.platforms.find(p=>p.id===this.selected)},
  groupedLocalAccounts(){
    const names={WECHAT_VIDEO:'视频�?,DOUYIN:'抖音',XIAOHONGSHU:'小红�?,KUAISHOU:'快手'};
    const order=['WECHAT_VIDEO','DOUYIN','XIAOHONGSHU','KUAISHOU'];
    const groups={};
    for(const a of this.localAccounts||[]){
      const key=a.platform||'OTHER';
      if(!groups[key])groups[key]={key,name:names[key]||key,items:[]};
      groups[key].items.push(a);
    }
    return Object.values(groups).sort((a,b)=>{
      const ai=order.indexOf(a.key), bi=order.indexOf(b.key);
      return (ai<0?99:ai)-(bi<0?99:bi);
    });
  }
},
methods:{
  async fetchPixingStatus(){try{const r=await fetch('/api/pixing-worker/status');const j=await r.json();this.pwRunning=j.running;this.pwCompleted=j.completed;this.pwTask=j.current_task||''}catch(e){}},
  async togglePixingWorker(){const url=this.pwRunning?'/api/pixing-worker/stop':'/api/pixing-worker/start';await fetch(url,{method:'POST'});await this.fetchPixingStatus()},
  async triggerCollect(mode='quick', platform=''){
    if(mode==='full'&&!confirm('全量采集会慢很多，确定现在开始？'))return;
    this.collecting=true;
    try{
      await fetch('/api/data-collection/trigger',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode, max_posts: mode==='full'?0:20, platform})});
      this._startProgressPoll()
    }catch(e){this.collecting=false}
  },
  _startProgressPoll(){const self=this;self._stopProgressPoll();const tick=async()=>{try{const r=await fetch('/api/data-collection/status');const j=await r.json();self.dcProgress=j;if(!j.running){self.collecting=false}}catch(e){}};tick();self._dcPollTimer=setInterval(tick,1000)},
  _stopProgressPoll(){if(this._dcPollTimer){clearInterval(this._dcPollTimer);this._dcPollTimer=null}},
  mounted(){this._startProgressPoll();if(this.configured){this.loadLocalAccounts()}},
  async loadCookieStatus(){
    try{const r=await fetch('/api/cookie-status');const j=await r.json();
      this.cookieStatus=j.by_platform;
      this.cookieAlerts=[...j.expired.map(e=>({...e,expired:true})),...j.warnings.map(w=>({...w,expired:false}))];
      if(!this.cookieAlerts.length&&j.by_platform){
        const minH=Math.min(...Object.values(j.by_platform).filter(h=>h<900));
        this.cookieFreshness=minH<1?Math.round(minH*60)+'分钟':Math.round(minH)+'小时';
      }
    }catch(e){}
  },
  async loadLocalAccounts(){
    try{const r=await fetch('/api/local-accounts');const j=await r.json();
      if(j.code===0){this.localAccounts=j.data||[]}
    }catch(e){}
  },
  accountStatusText(a){
    if(a.needs_rescan)return '已失�?;
    if(a.last_collected_at)return '已采�?;
    if(a.profile_refreshed_at||a.status==='active')return '已登�?;
    return '已失�?;
  },
  scheduleModeText(s){
    if(!s||!s.started)return '未启�?;
    return s.mode==='full'?'全量采集':'快采�?+(s.max_posts?`${s.max_posts}条`:'');
  },
  scheduleCountdownText(s){
    if(!s||!s.started)return '未启�?;
    const sec=s.countdown_seconds;
    if(sec===null||sec===undefined)return '计算�?;
    if(sec<=0)return '即将弢��?;
    const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), r=sec%60;
    if(h>0)return `${h}小时${String(m).padStart(2,'0')}�?{String(r).padStart(2,'0')}秒`;
    return `${m}�?{String(r).padStart(2,'0')}秒`;
  },
  runTimeText(run){
    const value=(run&&run.finished_at)||'';
    const m=String(value).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if(!m)return value||'';
    const dt=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),Number(m[6]||0)));
    if(Number.isNaN(dt.getTime()))return `${m[4]}:${m[5]}`;
    return dt.toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit'});
  },
  async removeLocalAccount(id){
    if(!confirm('确定删除此账号绑定？'))return;
    try{await fetch('/api/local-accounts/'+id,{method:'DELETE'});await this.loadLocalAccounts()}catch(e){}
  },
  async checkConfig(){
    try{const r=await fetch('/api/config');const j=await r.json();this.configured=j.configured;if(j.saved_identifier||j.saved_email){this.loginEmail=j.saved_identifier||j.saved_email;this.rememberPwd=true}}catch(e){this.configured=false}
  },
  async tryAutoLogin(){
    try{const r=await fetch('/api/auto-login',{method:'POST'});const j=await r.json();if(j.configured){this.configured=true}}catch(e){}
  },
  async doLogin(){
    if(!this.loginEmail||!this.loginPass){this.loginError='请输入邮箱/手机号和密码';return}
    this.loginLoading=true;this.loginError=''
    try{
      const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:this.loginEmail,password:this.loginPass,remember:this.rememberPwd})})
      const j=await r.json()
      if(j.error){this.loginError=j.error}
      else{this.configured=true;this.loginEmail='';this.loginPass=''}
    }catch(e){this.loginError='登录失败: '+e.message}
    this.loginLoading=false
  },
  async selectPlatform(id){
    if(this.status==='loading'||this.status==='browser'||this.status==='uploading')return
    if(!id){this.errorMsg='请��择平台';return}
    this.selected=id;this.errorMsg=''
    let token=this.tokenFromUrl||this.getParam('token')
    let apiUrl=this.apiFromUrl||this.getParam('api')||'https://ddddkiii.com/api/v1'
    if(!token){
      try{
        const r=await fetch('/api/config');const j=await r.json()
        if(j.token_set){
          const tr=await fetch('/api/get-token');const tj=await tr.json()
          token=tj.token;apiUrl=j.api_url
        }
      }catch(e){}
    }
    if(!token){this.errorMsg='请先登录披星云账号再扫码绑定';this.status='error';return}
    this.startScan(token,apiUrl)
  },
  getParam(k){return new URLSearchParams(location.search).get(k)},
  startScan(token,apiUrl){
    this.status='loading';this.progress=0
    this.timer=setInterval(()=>{if(this.progress<90)this.progress+=1},400)
    fetch('/api/scan-bind/trigger',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform:this.selected,token,api_url:apiUrl})}).then(r=>r.json()).then(j=>{
      if(j.code===0){
        this.sessionId=j.session_id
        this.status='loading'
        this.progress=50
        clearInterval(this.timer)
        this.monitorScanLaunch()
      }else{
        this.status='error'
        this.errorMsg=j.msg||'启动失败'
        clearInterval(this.timer)
      }
    }).catch(e=>{
      this.status='error'
      this.errorMsg='通信失败: '+e.message
      clearInterval(this.timer)
    })
  },
  clearScanPoll(){if(this.scanPollTimer){clearInterval(this.scanPollTimer);this.scanPollTimer=null}},
  monitorScanLaunch(){
    this.clearScanPoll()
    let attempts=0
    this.scanPollTimer=setInterval(()=>{
      attempts++
      fetch('/api/scan-bind/poll/'+this.sessionId).then(r=>r.json()).then(s=>{
        if(s.status==='browser'){this.clearScanPoll();this.status='browser';this.progress=100}
        else if(s.status==='error'||s.status==='not_found'){this.clearScanPoll();this.status='error';this.errorMsg=s.msg||'浏览器启动失败，请重启披星云伴侣后重试'}
        else if(attempts>45){this.clearScanPoll();this.status='error';this.errorMsg='浏览器启动超时，请重启披星云伴侣后重试'}
      }).catch(()=>{if(attempts>45){this.clearScanPoll();this.status='error';this.errorMsg='浏览器启动状态查询失败，请重启披星云伴侣后重试'}})
    },1000)
  },
  reset(){this.evtSource?.close();clearInterval(this.timer);this.clearScanPoll();this.status='idle';this.qrUrl='';this.errorMsg='';this.selected='';this.progress=0},
confirmLogin(){
  console.log('[UI] confirmLogin called, sessionId='+this.sessionId)
  if(!this.sessionId){this.errorMsg='会话丢失，请重试';this.status='error';return}
  this.status='uploading'
  this.clearScanPoll()
  const sid=this.sessionId
  fetch('/api/confirm-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sid})}).then(r=>r.json()).then(j=>{
    console.log('[UI] confirm-login response:',JSON.stringify(j))
    if(j.code!==0){this.status='error';this.errorMsg='操作失败: '+j.msg;return}
    let attempts=0
    const maxAttempts=900
    const poll=setInterval(()=>{
      fetch('/api/scan-bind/poll/'+sid).then(r=>r.json()).then(s=>{
        attempts++
        if(s.status==='done'){this.status='done';this.progress=100;clearInterval(poll)}
        else if(s.status==='error'){this.status='error';this.errorMsg=s.msg||'上传失败，请重试';clearInterval(poll)}
        else if(attempts>maxAttempts){this.status='error';this.errorMsg='采集上传耗时较长，请稍后刷新状态；不要重复扫码。';clearInterval(poll)}
      }).catch(()=>{if(attempts>maxAttempts){this.status='error';this.errorMsg='状态查询暂时中断，伴侣仍可能在采集上传，请稍后刷新。';clearInterval(poll)}})
    },1000)
  }).catch(e=>{console.log('[UI] confirm-login error:',e.message);this.status='error';this.errorMsg='通信失败: '+e.message})
},
cancelScan(){
  if(this.sessionId){fetch('/api/cancel-scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:this.sessionId})})}
  this.reset()
}
},
mounted(){
  this.checkConfig()
  this.tryAutoLogin()
  this.loadCookieStatus()
  this.loadLocalAccounts()
  this.fetchPixingStatus()
  this.platformFromUrl=this.getParam('platform')
  this.tokenFromUrl=this.getParam('token')
  this.apiFromUrl=this.getParam('api')
  if(this.platformFromUrl&&this.tokenFromUrl){this.selected=this.platformFromUrl}
  setInterval(async()=>{try{const r=await fetch('/health');if(r.ok)this.siteConnected=true}catch{this.siteConnected=false}},3000)
  setInterval(()=>{if(this.configured)this.loadCookieStatus()},60000)
  setInterval(()=>{if(this.configured)this.loadLocalAccounts()},30000)
  setInterval(()=>{if(this.configured)this.fetchPixingStatus()},10000)
}}).mount('body')
</script></body></html>'''

try:
    from companion_clean_ui import UI_HTML as UI_HTML
except Exception as _ui_error:
    print(f'[UI] clean ui unavailable: {_ui_error}', flush=True)
    UI_HTML = _CLEAN_UI_FALLBACK


# ══════════════════════════════════════════════════════════════════
    state._CONFIG_CACHE = cfg


def _find_doudian_store(local_id: str) -> dict | None:
    for store in _get_doudian_stores():
        if store.get('id') == local_id:
            return store
    return None


def _mark_doudian_store_state(local_id: str, login_state: str, message: str = '', store_name: str = '') -> dict | None:
    stores = _get_doudian_stores()
    now_text = time.strftime('%Y-%m-%d %H:%M:%S')
    updated = None
    for item in stores:
        if item.get('id') == local_id:
            item['login_state'] = login_state
            item['login_checked_at'] = now_text
            item['login_message'] = message or (
                '已登录' if login_state == 'online'
                else '抖店登录失效，请重新登录' if login_state == 'expired'
                else '待确认'
            )
            if login_state == 'online':
                item['last_login_at'] = now_text
                if store_name:
                    item['name'] = store_name
                if not message:
                    item['last_error'] = ''
            elif login_state in ('expired', 'error') and message:
                item['last_error'] = message
            updated = item
            break
    _save_doudian_stores(stores)
    return updated


def _probe_doudian_store_state(local_id: str) -> dict:
    store = _find_doudian_store(local_id)
    if not store:
        raise RuntimeError('Local Doudian store not found')
    from doudian_store_collector import check_login_state, run_async
    result = run_async(asyncio.wait_for(
        check_login_state(store.get('profile_id') or local_id, state._BROWSER_PATH, state._BROWSER_CHANNEL),
        timeout=30,
    ))
    login_state = str(result.get('state') or 'unknown')
    message = str(result.get('message') or '')
    updated = _mark_doudian_store_state(
        local_id,
        login_state,
        message,
        str(result.get('storeName') or ''),
    )
    return {**(updated or store), 'probe': result}


def _resolve_companion_auth(body: dict | None = None) -> tuple[str, str]:
    cfg = _load_config()
    body = body or {}
    api_url = (body.get('api_url') or cfg.get('api_url') or 'https://ddddkiii.com/api/v1').rstrip('/')
    if api_url:
        cfg['api_url'] = api_url
    if body.get('token'):
        cfg['token'] = body.get('token')
    if body.get('refreshToken') or body.get('refresh_token'):
        cfg['refreshToken'] = body.get('refreshToken') or body.get('refresh_token')
    if body.get('token') or body.get('refreshToken') or body.get('refresh_token'):
        _save_config(cfg)
        state._CONFIG_CACHE.update(cfg)
    if cfg.get('token'):
        token = cfg.get('token') if _check_and_refresh_token() else ''
        cfg = _load_config()
        token = cfg.get('token') if token else ''
    else:
        token = _login_with_saved_credentials(cfg)
    return api_url, token


def _run_doudian_store_sync(local_id: str, api_url: str | None = None, token: str | None = None) -> dict:
    """抖店同步入口（带失败打点包装）。

    Phase 2 复查结论：旧实现只在成功路径调用 record_sync，
    失败路径直接抛异常 → lastSync.success 永远不会是 false，
    「连续3次同步失败」告警无法真实触发。现在任何异常都会记录
    success=false（错误码取自异常，缺省 SYNC_ERROR），随后原样上抛。
    """
    try:
        return _run_doudian_store_sync_impl(local_id, api_url, token)
    except Exception as exc:
        try:
            from companion_heartbeat import record_sync
            store = _find_doudian_store(local_id) or {}
            record_sync(
                success=False,
                upload_count=0,
                error_code=str(getattr(exc, 'code', '') or 'SYNC_ERROR')[:80],
                kind='doudian',
                store_id=str(store.get('cloud_store_id') or ''),
                store_name=str(store.get('name') or ''),
            )
        except Exception:
            pass
        raise


def _run_doudian_store_sync_impl(local_id: str, api_url: str | None = None, token: str | None = None) -> dict:
    store = _find_doudian_store(local_id)
    if not store:
        raise RuntimeError('Local Doudian store not found')
    if not store.get('cloud_store_id'):
        raise RuntimeError('Doudian cloud store binding is missing')

    cfg = _load_config()
    api_url = (api_url or cfg.get('api_url') or 'https://ddddkiii.com/api/v1').rstrip('/')
    token = token or cfg.get('token') or ''

    from doudian_store_collector import (
        DoudianUploadError,
        collect_store,
        rebind_companion_store,
        relink_companion_store,
        run_async,
        upload_store_data,
    )

    profile_id = store.get('profile_id') or local_id
    try:
        captured = run_async(asyncio.wait_for(
            collect_store(profile_id, state._BROWSER_PATH, state._BROWSER_CHANNEL),
            # 大店铺（唐商披星）订单+售后全量翻页约 6~8 分钟，480s 会掐断正在等待的浏览器
            # 页面，报 Page.wait_for_timeout: Connection closed。给足余量。
            timeout=660,
        ))
    except Exception:
        _cleanup_doudian_profile_processes(profile_id)
        raise
    store_name = captured.get('storeName') or store.get('name')
    # Account isolation is enforced by profile_id / localProfileId binding,
    # NOT by store name matching. Each store has its own browser profile
    # directory, so different stores' login sessions are always isolated.
    # If we captured a real store name from the page, update the local record.
    captured_store_name = str(captured.get('storeName') or '').strip()
    if captured_store_name and captured_store_name != str(store.get('name') or '').strip():
        stores_list = _get_doudian_stores()
        for item in stores_list:
            if item.get('id') == local_id:
                item['name'] = captured_store_name
                break
        _save_doudian_stores(stores_list)
    upload_payload = {
        'storeName': store_name,
        'localProfileId': store.get('profile_id') or local_id,
        'orders': captured.get('orders'),
        'orderAuthors': captured.get('orderAuthors'),
        'orderSourceDebug': captured.get('orderSourceDebug'),
        'products': captured.get('products'),
        'aftersales': captured.get('aftersales'),
    }
    try:
        result = upload_store_data(api_url, token, store.get('cloud_store_id'), upload_payload)
    except DoudianUploadError as upload_error:
        code = getattr(upload_error, 'code', None)
        if code not in ('STALE_COMPANION_BINDING', 'DOUDIAN_STORE_NOT_FOUND'):
            _cleanup_doudian_profile_processes(profile_id)
            raise
        cloud_id = store.get('cloud_store_id')
        try:
            rebind_companion_store(
                api_url,
                token,
                cloud_id,
                upload_payload['localProfileId'],
                store_name,
            )
        except DoudianUploadError as rebind_error:
            if getattr(rebind_error, 'code', None) != 'DOUDIAN_STORE_NOT_FOUND':
                _cleanup_doudian_profile_processes(profile_id)
                raise
            # 本地保存的 cloud_store_id 已失效（云端店铺被重建）：按店名找回唯一同名店铺并重绑
            cloud_id = relink_companion_store(api_url, token, store_name)
            rebind_companion_store(
                api_url,
                token,
                cloud_id,
                upload_payload['localProfileId'],
                store_name,
            )
            stores_list = _get_doudian_stores()
            for item in stores_list:
                if item.get('id') == local_id:
                    item['cloud_store_id'] = cloud_id
                    break
            _save_doudian_stores(stores_list)
        result = upload_store_data(api_url, token, cloud_id, upload_payload)
    except Exception as upload_error:
        response = getattr(upload_error, 'response', None)
        if getattr(response, 'status_code', None) != 401:
            _cleanup_doudian_profile_processes(profile_id)
            raise
        fresh_token = _login_with_saved_credentials(_load_config())
        if not fresh_token:
            _cleanup_doudian_profile_processes(profile_id)
            raise
        try:
            result = upload_store_data(api_url, fresh_token, store.get('cloud_store_id'), upload_payload)
        except Exception:
            _cleanup_doudian_profile_processes(profile_id)
            raise

    stores = _get_doudian_stores()
    now_text = time.strftime('%Y-%m-%d %H:%M:%S')
    for item in stores:
        if item.get('id') == local_id:
            if store_name:
                item['name'] = store_name
            item['last_synced_at'] = now_text
            item['last_error'] = ''
            item['login_state'] = 'online'
            item['login_message'] = '已登录'
            item['login_checked_at'] = now_text
            item['last_login_at'] = now_text
            break
    _save_doudian_stores(stores)
    _cleanup_doudian_profile_processes(profile_id)
    try:
        from companion_heartbeat import record_sync
        record_sync(
            success=True,
            upload_count=int((result or {}).get('orderCount') or 0) if isinstance(result, dict) else 0,
            kind='doudian',
            store_id=str(store.get('cloud_store_id') or ''),
            store_name=str(store_name or ''),
        )
    except Exception:
        pass
    return {
        **(result or {}),
        'storeName': store_name,
        'syncedAt': now_text,
    }


_DOUDIAN_NETWORK_ERROR_CODES = {
    'CONNECTION_RESET',
    'CONNECTION_REFUSED',
    'DNS_FAILURE',
    'TLS_ERROR',
    'TIMEOUT',
    'NETWORK_ERROR',
}

_DOUDIAN_NETWORK_FRIENDLY = {
    'CONNECTION_RESET': '抖店数据上传被本地网络中断（连接被重置）。若电脑开启了代理/VPN（如 Clash），请把披星云服务器设为直连后重试',
    'CONNECTION_REFUSED': '披星云服务器拒绝连接，请稍后重试',
    'DNS_FAILURE': '无法解析披星云服务器域名，请检查网络与 DNS 设置',
    'TLS_ERROR': '与披星云服务器的安全连接失败（证书校验异常），请检查系统时间与网络',
    'TIMEOUT': '披星云服务器响应超时，请稍后重试',
    'NETWORK_ERROR': '上传披星云服务器失败，请检查网络后重试',
}


def _friendly_doudian_error(error: Exception | str) -> str:
    error_code = getattr(error, 'code', None)
    if error_code in _DOUDIAN_NETWORK_FRIENDLY:
        return _DOUDIAN_NETWORK_FRIENDLY[error_code]
    if error_code == 'STALE_COMPANION_BINDING':
        return '\u5f53\u524d\u6296\u5e97\u7ed1\u5b9a\u5df2\u5931\u6548\uff0c\u8bf7\u5728\u62ab\u661f\u4e91\u4f34\u4fa3\u91cc\u91cd\u65b0\u7ed1\u5b9a\u540e\u540c\u6b65'
    if getattr(error, 'code', None) == 'DOUDIAN_STORE_NOT_FOUND':
        return '\u4e91\u7aef\u6296\u5e97\u5e97\u94fa\u4e0d\u5b58\u5728\uff0c\u8bf7\u91cd\u65b0\u7ed1\u5b9a\u540e\u540c\u6b65'
    if getattr(error, 'code', None) == 'DOUDIAN_STORE_AMBIGUOUS':
        return '\u4e91\u7aef\u5b58\u5728\u591a\u5bb6\u540c\u540d\u6296\u5e97\u5e97\u94fa\uff0c\u8bf7\u5728\u7f51\u7ad9\u91cd\u65b0\u7ed1\u5b9a\u540e\u518d\u540c\u6b65'
    msg = str(error)[:500]
    if 'STALE_COMPANION_BINDING' in msg or 'Invalid companion upload store binding' in msg:
        return '\u5f53\u524d\u6296\u5e97\u7ed1\u5b9a\u5df2\u5931\u6548\uff0c\u8bf7\u5728\u62ab\u661f\u4e91\u4f34\u4fa3\u91cc\u91cd\u65b0\u7ed1\u5b9a\u540e\u540c\u6b65'
    if '400 Client Error' in msg and '/doudian-browser/stores/' in msg:
        return '\u6296\u5e97\u540c\u6b65\u88ab\u670d\u52a1\u5668\u62d2\u7edd\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u6216\u91cd\u65b0\u7ed1\u5b9a\u8be5\u5e97\u94fa\u540e\u518d\u540c\u6b65'
    mismatch = re.search(
        r'Doudian store binding mismatch: local store "(.+?)" is logged into "(.+?)"\.',
        msg,
    )
    if mismatch:
        expected, actual = mismatch.groups()
        return (
            f'\u6296\u5e97\u8d26\u53f7\u4e0d\u5339\u914d\uff1a\u300c{expected}\u300d'
            f'\u8fd9\u6761\u914d\u7f6e\u91cc\u5f53\u524d\u767b\u5f55\u7684\u662f\u300c{actual}\u300d\u3002'
            '\u4e3a\u4e86\u9632\u6b62\u4e32\u5e97\u5199\u6570\u636e\uff0c\u672c\u6b21\u540c\u6b65\u5df2\u505c\u6b62\u3002'
            '\u8bf7\u70b9\u300c\u767b\u5f55\u300d\u91cd\u65b0\u767b\u5f55\u8be5\u5e97\uff0c\u6216\u5220\u9664\u540e\u91cd\u65b0\u6dfb\u52a0\u6b63\u786e\u5e97\u94fa\u3002'
        )
    if 'Invalid companion upload store name' in msg:
        return (
            '\u6296\u5e97\u8d26\u53f7\u4e0d\u5339\u914d\uff1a\u684c\u9762\u4f34\u4fa3\u4e0a\u4f20\u7684\u5e97\u94fa'
            '\u4e0d\u662f\u7f51\u7ad9\u7ed1\u5b9a\u7684\u8fd9\u4e00\u5bb6\u3002\u8bf7\u91cd\u65b0\u767b\u5f55\u6b63\u786e\u5e97\u94fa\u540e\u518d\u540c\u6b65\u3002'
        )
    if isinstance(error, TimeoutError) or error.__class__.__name__ == 'TimeoutError':
        return '\u6296\u5e97\u91c7\u96c6\u8d85\u65f6\uff0c\u8bf7\u5173\u95ed\u6296\u5e97\u6d4f\u89c8\u5668\u7a97\u53e3\u540e\u91cd\u8bd5'
    if 'Connection closed' in msg or 'wait_for_timeout' in msg:
        # 同步超时取消会以 Playwright 驱动断连的形式冒出，统一按超时提示。
        return '\u6296\u5e97\u91c7\u96c6\u8d85\u65f6\uff0c\u8bf7\u5173\u95ed\u6296\u5e97\u6d4f\u89c8\u5668\u7a97\u53e3\u540e\u91cd\u8bd5'
    if 'Target page, context or browser has been closed' in msg or 'BrowserType.launch_persistent_context' in msg:
        return '\u6296\u5e97\u6d4f\u89c8\u5668\u542f\u52a8\u5931\u8d25\uff0c\u8bf7\u5173\u95ed\u6b8b\u7559\u6d4f\u89c8\u5668\u7a97\u53e3\u540e\u91cd\u8bd5'
    if '\u64cd\u4f5c\u73af\u5883\u5f02\u5e38' in msg or 'security_block' in msg:
        return '\u6296\u5e97\u68c0\u6d4b\u5230\u64cd\u4f5c\u73af\u5883\u5f02\u5e38\u3002\u8bf7\u5173\u95ed\u5176\u4ed6\u6296\u5e97\u6d4f\u89c8\u5668\u7a97\u53e3\uff0c\u7136\u540e\u5728\u4f34\u4fa3\u4e2d\u91cd\u65b0\u70b9\u51fb\u300c\u767b\u5f55\u300d\u626b\u7801\u3002\u5982\u679c\u95ee\u9898\u6301\u7eed\uff0c\u8bf7\u91cd\u542f\u4f34\u4fa3\u3002'
    if '\u767b\u5f55\u4fe1\u606f\u5df2\u5931\u6548' in msg or '\u8bf7\u91cd\u65b0\u767b\u5f55' in msg or '\u767b\u5f55\u5df2\u5931\u6548' in msg:
        return '\u6296\u5e97\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u7ed1\u5b9a\u540e\u518d\u540c\u6b65'
    return msg


def _cleanup_doudian_profile_processes(profile_id: str) -> None:
    """抖店任务结束后的浏览器清理（P0 安全修复）。

    旧实现用 PowerShell 扫描系统所有进程、按 CommandLine -like 匹配后 Stop-Process -Force，
    会误杀命令行里恰好含该 profile 路径的用户软件（编辑器、终端、用户浏览器等）。

    新实现：只关闭 process_registry 中登记过的、属于该抖店 profile 的进程；
    五重校验（PID 存在 / 已登记 / create_time 一致 / 可执行文件一致 / 命令行含 profile）
    全部通过才允许关闭，否则拒绝并记录 SKIP_UNMANAGED_PROCESS。
    """
    profile_id = str(profile_id or '').strip()
    if not profile_id or not re.fullmatch(r'[A-Za-z0-9_-]{6,64}', profile_id):
        return
    try:
        from doudian_store_collector import get_profile_path
        from process_registry import terminate_for_profile

        profile_path = get_profile_path(profile_id)
        results = terminate_for_profile(
            profile_path,
            reason='doudian profile cleanup',
            grace=2.0,
        )
        killed = sum(1 for r in results if r.get('action') == 'killed')
        if killed:
            print(f'[Doudian] cleaned {killed} registered process(es) for profile {profile_id}', flush=True)
        else:
            print(
                f'[Doudian] 拒绝清理 profile {profile_id}：无已登记进程。'
                '该账号浏览器仍在使用，请关闭对应窗口后重试。',
                flush=True,
            )
    except Exception as exc:
        print(f'[Doudian] cleanup profile browser processes failed: {exc}', flush=True)

def _run_doudian_scheduled_collection():
    
    if not state._doudian_sync_lock.acquire(blocking=False):
        print('[Doudian] Scheduled sync skipped: sync already running')
        return False
    state._doudian_active_task = {
        'type': 'scheduled_sync',
        'label': '\u5b9a\u65f6\u540c\u6b65\u4e2d',
        'started_at': time.strftime('%Y-%m-%d %H:%M:%S'),
    }
    try:
        stores = [
            store
            for store in _get_doudian_stores()
            if store.get('cloud_store_id')
        ]
        if not stores:
            state._doudian_last_error = None
            print('[Doudian] Scheduled sync skipped: no stores')
            return True
        for index, store in enumerate(stores):
            local_id = store.get('id')
            if not local_id:
                continue
            state._doudian_active_task = {
                'type': 'scheduled_sync',
                'label': '定时同步中',
                'store_id': local_id,
                'store_name': store.get('name'),
                'position': index + 1,
                'total': len(stores),
                'started_at': time.strftime('%Y-%m-%d %H:%M:%S'),
            }
            try:
                result = _run_doudian_store_sync(local_id)
                state._doudian_last_run = time.strftime('%Y-%m-%d %H:%M:%S')
                state._doudian_last_error = None
                print(f'[Doudian] Scheduled sync ok: {local_id} {result}')
            except Exception as e:
                msg = _friendly_doudian_error(e)
                store_name = store.get('name') or local_id or '未知店铺'
                state._doudian_last_error = f'{store_name}：{msg}'
                current = _get_doudian_stores()
                for item in current:
                    if item.get('id') == local_id:
                        item['last_error'] = msg
                        break
                _save_doudian_stores(current)
                print(f'[Doudian] Scheduled sync failed: {local_id} {msg}')
                # 网络类故障（代理中断/超时/DNS 等）5 分钟后快速补跑一轮，
                # 避免等到下一个 30 分钟周期；业务类错误（绑定失效等）不加速。
                if getattr(e, 'code', None) in _DOUDIAN_NETWORK_ERROR_CODES:
                    state._doudian_fast_retry = True
            if index < len(stores) - 1:
                time.sleep(30)
    finally:
        state._doudian_active_task = None
        state._doudian_sync_lock.release()
    return True


def _maybe_run_doudian_pre_report_collection():
    now = time.localtime()
    today = time.strftime('%Y-%m-%d', now)
    if state._doudian_last_pre_report_sync_date == today:
        return
    if now.tm_hour != 8 or now.tm_min < 30:
        return
    if now.tm_hour == 8 and now.tm_min > 45:
        return

    print('[Doudian] Pre-report sync window reached; starting collection')
    if _run_doudian_scheduled_collection():
        state._doudian_last_pre_report_sync_date = today


def _doudian_scheduler_loop():
    if state._doudian_next_run_at is None:
        _schedule_next_doudian_collection()
    while True:
        _maybe_run_doudian_pre_report_collection()
        wait_seconds = (state._doudian_next_run_at or 0) - time.time()
        if wait_seconds > 0:
            time.sleep(min(10, max(1, wait_seconds)))
            continue
        _run_doudian_scheduled_collection()
        fast_retry = bool(getattr(state, '_doudian_fast_retry', False))
        state._doudian_fast_retry = False
        interval = _schedule_next_doudian_collection(300 if fast_retry else None)
        print(f'[Doudian] Next scheduled sync in {interval // 60} min{" (fast retry after failure)" if fast_retry else ""}')


def _ensure_doudian_scheduler_started():
    
    with state._doudian_scheduler_lock:
        if state._doudian_scheduler_started:
            return
        state._doudian_scheduler_started = True
        _schedule_next_doudian_collection(1800)
        threading.Thread(target=_doudian_scheduler_loop, daemon=True).start()


# ══════════════════════════════════════════════════════════════════
# Config endpoints (data collector)
# ══════════════════════════════════════════════════════════════════

@app.route('/api/login', methods=['POST'])
def handle_login():
    import requests as req
    data = request.get_json() or {}
    identifier = (data.get('identifier') or data.get('email') or '').strip()
    password = data.get('password', '')
    remember = data.get('remember', False)
    if not identifier or not password:
        return jsonify({'error': '邮箱/手机号和密码不能为空'})
    cfg = _load_config()
    api_url = cfg.get('api_url', 'https://ddddkiii.com/api/v1')
    try:
        r = req.post(f'{api_url}/auth/login', json=_login_payload(identifier, password), timeout=15)
        if r.status_code == 200 or r.status_code == 201:
            body = r.json()
            inner = body.get('data') or body
            token = inner.get('accessToken') or inner.get('access_token') or ''
            refresh_token = inner.get('refreshToken') or inner.get('refresh_token') or ''
            if token:
                cfg['token'] = token
                if refresh_token:
                    cfg['refreshToken'] = refresh_token
                cfg['api_url'] = api_url
                if remember:
                    cfg['saved_identifier'] = identifier
                    if '@' in identifier:
                        cfg['saved_email'] = identifier
                    else:
                        cfg.pop('saved_email', None)
                    if _HAS_CRYPTO:
                        try:
                            key = _get_encryption_key()
                            cfg['saved_password'] = _encrypt_password(password, key)
                        except Exception:
                            cfg['saved_password'] = password  # fallback: plaintext
                    else:
                        cfg['saved_password'] = password  # no crypto lib
                _save_config(cfg)
                state._CONFIG_CACHE.update(cfg)
                # 自动启动数字人视�?worker
                try: start_worker()
                except Exception: pass
                return jsonify({'status': 'ok', 'message': '登录成功'})
        msg = '邮箱/手机号或密码错误'
        try:
            body = r.json()
            msg = body.get('message') or msg
        except Exception: pass
        return jsonify({'error': msg})
    except Exception as e:
        return jsonify({'error': f'无法连接服务�? {str(e)[:80]}'})

def _public_site_url(api_url: str) -> str:
    api_url = (api_url or '').strip().rstrip('/')
    if api_url.endswith('/api/v1'):
        return api_url[:-7]
    if api_url.endswith('/api'):
        return api_url[:-4]
    return api_url or 'https://ddddkiii.com'

def _store_login_session(cfg: dict, body: dict, source: str = 'feishu') -> bool:
    inner = body.get('data') if isinstance(body.get('data'), dict) else body
    token = inner.get('accessToken') or inner.get('access_token') or ''
    refresh_token = inner.get('refreshToken') or inner.get('refresh_token') or ''
    user = inner.get('user') or {}
    if not isinstance(user, dict):
        user = {}
    if not token:
        return False
    cfg['token'] = token
    if refresh_token:
        cfg['refreshToken'] = refresh_token
    identifier = (user.get('email') or user.get('phone') or user.get('name') or '').strip()
    if identifier:
        cfg['saved_identifier'] = identifier
        if '@' in identifier:
            cfg['saved_email'] = identifier
    cfg['login_source'] = source
    _save_config(cfg)
    state._CONFIG_CACHE.update(cfg)
    try:
        start_worker()
    except Exception as exc:
        print(f'[FeishuLogin] start_worker warning: {exc}')
    return True

@app.route('/api/feishu/start', methods=['POST', 'OPTIONS'])
def feishu_start():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    cfg = _load_config()
    api_url = cfg.get('api_url', 'https://ddddkiii.com/api/v1')
    site_url = _public_site_url(api_url)
    if site_url.startswith('http://8.134.218.39'):
        site_url = 'https://ddddkiii.com'
    session_id = uuid.uuid4().hex
    callback = 'http://127.0.0.1:5409/api/feishu/complete'
    from urllib.parse import urlencode
    query = urlencode({
        'companion_feishu': '1',
        'companion_session': session_id,
        'companion_callback': callback,
    })
    login_url = f'{site_url}/login?{query}'
    with _feishu_login_lock:
        _feishu_login_sessions[session_id] = {
            'status': 'pending',
            'created_at': time.time(),
            'message': '等待飞书授权',
        }
    try:
        webbrowser.open(login_url)
    except Exception as exc:
        with _feishu_login_lock:
            _feishu_login_sessions[session_id]['status'] = 'error'
            _feishu_login_sessions[session_id]['message'] = f'无法打开浏览器：{str(exc)[:80]}'
        return jsonify({'error': _feishu_login_sessions[session_id]['message'], 'session_id': session_id})
    return jsonify({'status': 'ok', 'session_id': session_id, 'url': login_url})

@app.route('/api/feishu/complete', methods=['POST', 'OPTIONS'])
def feishu_complete():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    data = request.get_json(silent=True) or {}
    session_id = (data.get('session_id') or '').strip()
    inner = data.get('data') if isinstance(data.get('data'), dict) else data
    has_login_token = bool((inner or {}).get('accessToken') or (inner or {}).get('access_token'))
    if not _is_trusted_local_handoff():
        return jsonify({'error': 'Feishu login handoff origin is not trusted'}), 403
    if not session_id:
        return jsonify({'error': '缺少飞书登录会话'}), 400
    with _feishu_login_lock:
        session = _feishu_login_sessions.get(session_id)
        if not session and not has_login_token:
            return jsonify({'error': '飞书登录会话已过期，请重新发起'}), 404
        if not session:
            session = {
                'status': 'pending',
                'created_at': time.time(),
                'message': 'received Feishu login handoff',
                'recovered': True,
            }
            _feishu_login_sessions[session_id] = session
        if time.time() - session.get('created_at', 0) > 600 and not has_login_token:
            session['status'] = 'error'
            session['message'] = '飞书登录会话已过期，请重新发起'
            return jsonify({'error': session['message']}), 410
    cfg = _load_config()
    api_url = cfg.get('api_url', 'https://ddddkiii.com/api/v1')
    cfg['api_url'] = api_url
    ok = _store_login_session(cfg, data, 'feishu')
    with _feishu_login_lock:
        session = _feishu_login_sessions.get(session_id)
        if session is not None:
            session['status'] = 'success' if ok else 'error'
            session['message'] = '飞书登录成功' if ok else '未收到有效登录凭证'
            session['completed_at'] = time.time()
    if not ok:
        return jsonify({'error': '未收到有效登录凭证'}), 400
    return jsonify({'status': 'ok', 'message': '飞书登录成功'})

@app.route('/api/feishu/status/<session_id>')
def feishu_status(session_id):
    cfg = _load_config()
    configured = bool(cfg.get('token'))
    with _feishu_login_lock:
        session = _feishu_login_sessions.get(session_id)
        if not session:
            if configured:
                return jsonify({'status': 'success', 'message': 'Feishu login already completed', 'configured': True})
            return jsonify({'status': 'expired', 'message': '飞书登录会话不存在'})
        if time.time() - session.get('created_at', 0) > 600 and session.get('status') == 'pending':
            session['status'] = 'expired'
            session['message'] = '飞书登录会话已过期'
        return jsonify({
            'status': session.get('status', 'pending'),
            'message': session.get('message', ''),
            'configured': configured,
        })

@app.route('/api/get-token')
def get_token():
    cfg = _load_config()
    token_ok = bool(cfg.get('token'))
    if cfg.get('token'):
        token_ok = _check_and_refresh_token()
        cfg = _load_config()
    elif cfg.get('api_url'):
        fresh = _login_with_saved_credentials(cfg)
        if fresh:
            token_ok = True
            cfg = _load_config()
    return jsonify({'token': cfg.get('token', '') if token_ok else '', 'api_url': cfg.get('api_url', '')})

# ══════════════════════════════════════════════════════════════════
# Pixing Video Worker endpoints
# ══════════════════════════════════════════════════════════════════
@app.route('/api/pixing-worker/start', methods=['POST'])
def pw_start():
    start_worker()
    return jsonify({'ok': True, 'status': get_worker_status()})

@app.route('/api/pixing-worker/stop', methods=['POST'])
def pw_stop():
    stop_worker()
    return jsonify({'ok': True, 'status': get_worker_status()})

@app.route('/api/pixing-worker/status')
def pw_status():
    return jsonify(get_worker_status())

@app.route('/api/auto-login', methods=['POST'])
def auto_login():
    import requests as req
    cfg = _load_config()
    api_url = cfg.get('api_url', 'https://ddddkiii.com/api/v1')

    # 1) Current token still valid? �?done
    if cfg.get('token'):
        try:
            import jwt as _jwt
            decoded = _jwt.decode(cfg['token'], options={'verify_signature': False})
            if decoded.get('exp', 0) > time.time():
                return jsonify({'configured': True, 'message': 'Token 仍有效'})
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')  # Can't decode, try refresh anyway

    # 2) Try refresh token (no password needed!)
    refresh_token = cfg.get('refreshToken', '')
    if refresh_token:
        try:
            r = req.post(f'{api_url}/auth/refresh', json={'refreshToken': refresh_token}, timeout=15)
            if r.status_code in (200, 201):
                body = r.json()
                inner = body.get('data') or body
                new_token = inner.get('accessToken') or inner.get('access_token') or ''
                new_refresh = inner.get('refreshToken') or inner.get('refresh_token') or ''
                if new_token:
                    cfg['token'] = new_token
                    if new_refresh:
                        cfg['refreshToken'] = new_refresh
                    _save_config(cfg)
                    state._CONFIG_CACHE.update(cfg)
                    return jsonify({'configured': True, 'message': 'Refresh Token 自动登录成功'})
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')

    # 3) Fallback: try saved identifier+password
    identifier = _saved_identifier(cfg)
    password = cfg.get('saved_password', '')
    if identifier and password:
        if _HAS_CRYPTO and ':' in password:
            try:
                key = _get_encryption_key()
                password = _decrypt_password(password, key)
            except Exception as _e:
                print(f'[WARN] {type(_e).__name__}: {_e}')
        try:
            r = req.post(f'{api_url}/auth/login', json=_login_payload(identifier, password), timeout=15)
            if r.status_code in (200, 201):
                body = r.json()
                inner = body.get('data') or body
                token = inner.get('accessToken') or inner.get('access_token') or ''
                rt = inner.get('refreshToken') or inner.get('refresh_token') or ''
                if token:
                    cfg['token'] = token
                    if rt:
                        cfg['refreshToken'] = rt
                    _save_config(cfg)
                    state._CONFIG_CACHE.update(cfg)
                    return jsonify({'configured': True, 'message': '密码自动登录成功'})
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')

    return jsonify({'configured': False})

@app.route('/api/config', methods=['GET', 'POST'])
def handle_config():
    
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        cfg = _load_config()
        for key in ('api_url', 'token', 'update_manifest_url'):
            if key in data:
                cfg[key] = data[key].strip() if isinstance(data[key], str) else str(data[key])
        auto_collect_enabled = None
        if 'auto_collect_on_start' in data:
            auto_collect_enabled = bool(data.get('auto_collect_on_start'))
            cfg['auto_collect_on_start'] = auto_collect_enabled
            state._collector_paused = not auto_collect_enabled
            if not auto_collect_enabled:
                state._collector_next_run_at = None
        _save_config(cfg)
        state._CONFIG_CACHE = cfg
        if auto_collect_enabled is True and not state._collector_running:
            with state._collector_loop_lock:
                if not state._collector_loop_started:
                    state._collector_loop_started = True
                    _schedule_next_collection()
                    threading.Thread(target=_data_collector_loop, daemon=True).start()
            threading.Thread(
                target=_run_collection_once,
                args=(0, 'full', 'auto_start_setting'),
                daemon=True,
            ).start()
        return jsonify({'status': 'ok'})
    safe = {k: v for k, v in state._CONFIG_CACHE.items() if k not in ('token', 'saved_password', 'refreshToken', 'accessToken', '_key')}
    if state._CONFIG_CACHE.get('token'):
        safe['token_set'] = True
    if state._CONFIG_CACHE.get('saved_email'):
        safe['saved_email'] = state._CONFIG_CACHE['saved_email']
    if state._CONFIG_CACHE.get('saved_identifier'):
        safe['saved_identifier'] = state._CONFIG_CACHE['saved_identifier']
    safe['configured'] = bool(state._CONFIG_CACHE.get('token'))
    safe['app_version'] = APP_VERSION
    safe['update_manifest_url'] = _get_update_manifest_url()
    return jsonify(safe)


@app.route('/api/startup/status')
def startup_status():
    try:
        from startup_manager import get_startup_status

        status = get_startup_status()
        status['launch_on_start'] = bool(state._CONFIG_CACHE.get('launch_on_start'))
        return jsonify({'code': 0, 'status': status})
    except Exception as exc:
        return jsonify({'code': 1, 'msg': str(exc)}), 500


@app.route('/api/startup/configure', methods=['POST'])
def configure_startup():
    try:
        from startup_manager import enable_startup, disable_startup

        payload = request.get_json(silent=True) or {}
        enabled = bool(payload.get('enabled'))
        status = enable_startup() if enabled else disable_startup()
        cfg = dict(state._CONFIG_CACHE)
        cfg['launch_on_start'] = enabled
        _save_config(cfg)
        state._CONFIG_CACHE = cfg
        status['launch_on_start'] = enabled
        return jsonify({'code': 0, 'status': status})
    except Exception as exc:
        return jsonify({'code': 1, 'msg': str(exc)}), 500


@app.route('/api/data-collection/status')
def data_collection_status():
    cookie_status = _get_cookie_status()
    now = time.time()
    auto_collect_enabled = _load_config().get('auto_collect_on_start') is True
    countdown = None
    next_run_at_text = None
    if auto_collect_enabled and state._collector_next_run_at:
        countdown = max(0, int(state._collector_next_run_at - now))
        next_run_at_text = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(state._collector_next_run_at))
    recent_runs = []
    last_success = None
    try:
        from local_db import get_recent_collection_runs
        recent_runs = get_recent_collection_runs(5)
        for run in recent_runs:
            if run.get('status') == 'success':
                last_success = run
                break
    except Exception:
        recent_runs = []
    stale_accounts = []
    today_missing_accounts = []
    try:
        from datetime import datetime, timezone
        from local_db import get_all_accounts

        today_local = datetime.fromtimestamp(now).date()
        for acc in get_all_accounts(include_expired=True):
            if acc.get('status') == 'deleted':
                continue
            collected_at = str(acc.get('last_collected_at') or '').strip()
            collected_ts = None
            collected_local_date = None
            if collected_at:
                try:
                    parsed = datetime.strptime(collected_at, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
                    collected_ts = parsed.timestamp()
                    collected_local_date = datetime.fromtimestamp(collected_ts).date()
                except Exception:
                    collected_ts = None
            item = {
                'id': acc.get('id'),
                'platform': acc.get('platform'),
                'nickname': acc.get('nickname'),
                'last_collected_at': collected_at,
            }
            if collected_local_date != today_local:
                today_missing_accounts.append(item)
            if collected_ts is None or now - collected_ts > 24 * 3600:
                stale_accounts.append(item)
    except Exception as stale_err:
        print(f'[DC] stale account status failed: {stale_err}', flush=True)
    return jsonify({
        'running': state._collector_running,
        'configured': bool(state._CONFIG_CACHE.get('api_url')),
        'last_run': state._collector_last_run,
        'last_error': state._collector_last_error,
        'cookies_age_hours': cookie_status,
        'progress': state._collector_progress,
        'schedule': {
            'started': bool(state._collector_loop_started and auto_collect_enabled and not state._collector_paused),
            'paused': bool(state._collector_paused or not auto_collect_enabled),
            'auto_collect_enabled': auto_collect_enabled,
            'mode': state._collector_schedule_mode,
            'max_posts': state._collector_schedule_max_posts,
            'interval_seconds': state._collector_schedule_interval,
            'next_run_at': next_run_at_text,
            'countdown_seconds': countdown,
            'last_success': last_success,
            'recent_runs': recent_runs,
            'today_missing_accounts': today_missing_accounts,
            'stale_accounts': stale_accounts,
        },
    })


@app.route('/api/cookie-status')
def api_cookie_status():
    """Return cookie freshness per platform, + warn/expired flags"""
    status = _get_cookie_status()
    warnings = []
    expired = []
    for platform_key, hours in status.items():
        if hours >= _COOKIE_AGE_EXPIRED_HOURS:
            expired.append({'platform': platform_key, 'name': PLATFORMS[platform_key]['name'], 'hours': hours})
        elif hours >= _COOKIE_AGE_WARN_HOURS:
            warnings.append({'platform': platform_key, 'name': PLATFORMS[platform_key]['name'], 'hours': hours})
    return jsonify({
        'by_platform': status,
        'warnings': warnings,
        'expired': expired,
        'needs_rescan': len(warnings) + len(expired) > 0,
    })


@app.route('/api/data-collection/trigger', methods=['POST'])
def data_collection_trigger():
    if state._collector_running:
        return jsonify({'status': 'already_running'})
    body = request.get_json(silent=True) or {}
    mode = str(body.get('mode') or 'quick').strip().lower()
    if mode not in {'quick', 'full'}:
        mode = 'quick'
    try:
        max_posts = int(body.get('max_posts') or body.get('maxPosts') or state._DEFAULT_QUICK_MAX_POSTS)
    except Exception:
        max_posts = state._DEFAULT_QUICK_MAX_POSTS
    if mode == 'quick':
        max_posts = max_posts if max_posts > 0 else state._DEFAULT_QUICK_MAX_POSTS
    elif max_posts < 0:
        max_posts = 0
    platform = str(body.get('platform') or '').strip().upper()
    platform_aliases = {
        'DOUYIN': 'DOUYIN',
        'TENCENT': 'WECHAT_VIDEO',
        'WECHAT': 'WECHAT_VIDEO',
        'WECHAT_VIDEO': 'WECHAT_VIDEO',
    }
    platform = platform_aliases.get(platform, platform)
    if platform and platform not in {'DOUYIN', 'WECHAT_VIDEO', 'XIAOHONGSHU', 'KUAISHOU'}:
        return jsonify({'status': 'error', 'msg': f'Unsupported platform: {platform}'}), 400
    # 立即执行丢�次采�?
    try:
        from local_db import get_all_accounts
        local_accounts = get_all_accounts(include_expired=True)
        if platform:
            local_accounts = [
                acc for acc in local_accounts
                if (acc.get('platform') or '').strip().upper() == platform
            ]
        if not local_accounts:
            return jsonify({
                'status': 'no_accounts',
                'msg': 'No active accounts to collect',
                'mode': mode,
                'max_posts': max_posts,
                'platform': platform,
            })
    except Exception as e:
        print(f'[DC] Preflight account check failed: {e}', flush=True)
    t = threading.Thread(
        target=_run_collection_once,
        args=(max_posts, mode, 'manual', platform or None),
        daemon=True,
    )
    t.start()
    return jsonify({
        'status': 'started',
        'mode': mode,
        'max_posts': max_posts,
        'platform': platform,
        'next_scheduled_run_at': (
            time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(state._collector_next_run_at))
            if state._collector_next_run_at else None
        ),
    })


# ══════════════════════════════════════════════════════════════════
# 本地账号管理 API�?账号1Profile 架构�?
# ══════════════════════════════════════════════════════════════════
@app.route('/api/local-accounts')
def local_accounts_list():
    """列出扢�有本地绑定的账号"""
    from local_db import get_account_session, get_all_accounts, get_current_sessions, get_profile_path
    accounts = get_all_accounts(include_expired=True)
    current_sessions = get_current_sessions()
    now = time.time()
    for acc in accounts:
        profile = get_profile_path(acc.get('id', ''))
        refreshed_at = 0
        profile_persisted = False
        session_info = get_account_session(acc.get('id', '')) or {}
        current_platform_session = current_sessions.get(acc.get('platform') or '', {})
        current_online_account_id = str(current_platform_session.get('account_id') or '')
        is_current_online = bool(
            acc.get('platform') == 'WECHAT_VIDEO'
            and current_online_account_id
            and current_online_account_id == acc.get('id')
        )
        if profile:
            cookie_info = profile / 'cookie_info.json'
            state_json = profile / 'state.json'
            for path in (cookie_info, state_json):
                try:
                    if path.exists():
                        refreshed_at = max(refreshed_at, path.stat().st_mtime)
                except Exception as _e:
                    print(f'[WARN] {type(_e).__name__}: {_e}')
            try:
                if cookie_info.exists():
                    info = json.loads(cookie_info.read_text(encoding='utf-8'))
                    profile_persisted = bool(info.get('profile_persisted'))
            except Exception as _e:
                print(f'[WARN] {type(_e).__name__}: {_e}')

        age_hours = ((now - refreshed_at) / 3600) if refreshed_at else None

        # Check if state.json has enough cookies for WECHAT_VIDEO.
        # storage_state() misses session cookies (compass_token etc.),
        # so a profile_persisted=True with only 2 cookies is NOT usable.
        has_enough_cookies = True
        if profile and acc.get('platform') == 'WECHAT_VIDEO':
            state_json = profile / 'state.json'
            if state_json.exists():
                try:
                    state = json.loads(read_text_file(state_json))
                    cookie_count = len(state.get('cookies', []))
                    cookie_names = {
                        item.get('name')
                        for item in state.get('cookies', [])
                        if 'weixin' in str(item.get('domain') or '')
                    }
                    has_enough_cookies = {'sessionid', 'wxuin'}.issubset(cookie_names)
                except Exception:
                    has_enough_cookies = False
            else:
                has_enough_cookies = False

        has_recent_full_profile = bool(
            acc.get('platform') == 'WECHAT_VIDEO'
            and profile_persisted
            and has_enough_cookies
            and age_hours is not None
            and age_hours < _COOKIE_AGE_EXPIRED_HOURS
        )
        acc['profile_refreshed_at'] = (
            time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(refreshed_at))
            if refreshed_at else ''
        )
        acc['profile_age_hours'] = round(age_hours, 1) if age_hours is not None else None
        acc['profile_persisted'] = profile_persisted
        acc['auth_saved'] = bool(session_info)
        acc['auth_updated_at'] = session_info.get('auth_updated_at', '')
        acc['session_state'] = session_info.get('session_state') or (
            'online' if is_current_online else ''
        )
        acc['session_updated_at'] = (
            session_info.get('last_verified_at')
            or current_platform_session.get('verified_at')
            or ''
        )
        acc['is_current_online'] = is_current_online
        acc['current_online_account_id'] = (
            current_online_account_id if acc.get('platform') == 'WECHAT_VIDEO' else ''
        )
        acc['current_online_source'] = (
            current_platform_session.get('source', '') if acc.get('platform') == 'WECHAT_VIDEO' else ''
        )
        acc['auth_summary'] = session_info.get('auth') or {}
        acc['needs_rescan'] = bool(
            (
                acc.get('platform') == 'WECHAT_VIDEO'
                and (
                    not has_recent_full_profile
                    or not is_current_online
                    or acc.get('session_state') == 'evicted'
                )
            )
            or (acc.get('status') == 'expired' and acc.get('platform') != 'WECHAT_VIDEO')
        )
    return jsonify({'code': 0, 'data': accounts})


@app.route('/api/current-sessions')
def current_sessions_list():
    """Return current online account pointers by platform."""
    from local_db import get_current_sessions
    return jsonify({'code': 0, 'data': get_current_sessions()})


@app.route('/api/local-accounts/<account_id>', methods=['DELETE'])
def local_accounts_delete(account_id):
    """Delete a local account binding."""
    from local_db import remove_account, get_profile_path
    profile = get_profile_path(account_id)
    remove_account(account_id)
    # 可��：也删�?Profile 目录
    if profile and profile.exists():
        import shutil
        try:
            shutil.rmtree(str(profile), ignore_errors=True)
        except Exception: pass
    return jsonify({'code': 0, 'msg': 'deleted'})


@app.route('/api/local-accounts/<account_id>/rebind', methods=['POST'])
def local_accounts_rebind(account_id):
    """Rebind an account by scanning again."""
    from local_db import get_account
    acc = get_account(account_id)
    if not acc:
        return jsonify({'code': 404, 'msg': '账号不存在'}), 404
    return jsonify({'code': 0, 'msg': '请在桌面伴侣中重新扫码', 'platform': acc['platform']})


# ══════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return make_response(UI_HTML)


@app.route('/health')
def health():
    diagnostics = {
        'appdata_dir': {
            'path': str(state._APPDATA_DIR),
            'exists': state._APPDATA_DIR.exists(),
        },
        'config_file': {
            'path': str(CONFIG_FILE),
            'exists': CONFIG_FILE.exists(),
        },
        'profile_root': {
            'path': str(state._PROFILE_ROOT),
            'exists': state._PROFILE_ROOT.exists(),
        },
        'browser': {
            'path': str(state._BROWSER_PATH) if state._BROWSER_PATH else '',
            'channel': state._BROWSER_CHANNEL,
            'exists': bool(state._BROWSER_PATH and Path(str(state._BROWSER_PATH)).exists()),
            'cdp_url': state._CDP_URL,
        },
        'collector': {
            'running': bool(state._collector_running),
            'paused': bool(state._collector_paused),
            'last_error': state._collector_last_error,
            'next_run_at': state._collector_next_run_at,
        },
        'doudian': {
            'running': bool(state._doudian_sync_lock.locked()),
            'last_error': state._doudian_last_error,
            'next_run_at': state._doudian_next_run_at,
        },
    }
    try:
        from local_db import DB_PATH
        diagnostics['local_db'] = {
            'path': str(DB_PATH),
            'exists': DB_PATH.exists(),
            'size': DB_PATH.stat().st_size if DB_PATH.exists() else 0,
        }
    except Exception as exc:
        diagnostics['local_db'] = {'error': str(exc)}
    resp = make_response(jsonify({
        'status': 'ok',
        'version': APP_VERSION,
        'platforms': list(PLATFORMS.keys()),
        'diagnostics': diagnostics,
    }))
    # CORS 头由全局 after_request 处理，这里不再硬编码 *
    return resp


@app.route('/api/browser-info')
def browser_info():
    """返回浏览器检测信息，用于 UI 诊断页面。"""
    try:
        from browser_manager import get_browser_info
        info = get_browser_info()
        info['browser_path'] = state._BROWSER_PATH
        info['browser_channel'] = state._BROWSER_CHANNEL
        info['cdp_url'] = state._CDP_URL
        return jsonify({'code': 0, 'data': info})
    except Exception as e:
        return jsonify({'code': 1, 'error': str(e)})


@app.route('/api/update/check')
def check_update():
    try:
        import urllib.parse

        manifest_url = _get_update_manifest_url()
        manifest = _fetch_update_manifest()
        latest_version = str(manifest.get('version') or '').strip()
        package_url = _resolve_update_url(manifest_url, manifest.get('url') or manifest.get('package_url') or '')
        available = bool(latest_version and _is_newer_version(latest_version))
        package_path = urllib.parse.urlparse(package_url).path if package_url else ''
        package_name = Path(package_path).name if package_path else ''
        package_size = int(manifest.get('size') or manifest.get('package_size') or 0)
        latest = {
            'version': latest_version,
            'notes': manifest.get('notes') or '',
            'mandatory': bool(manifest.get('mandatory')),
            'published_at': manifest.get('published_at') or '',
            'sha256_set': bool(manifest.get('sha256')),
            'size': package_size,
            'filename': package_name,
            'package_type': Path(package_name).suffix.lower().lstrip('.'),
        }
        return jsonify({
            'code': 0,
            'current_version': APP_VERSION,
            'available': available,
            'latest': latest,
            'package_url_set': bool(package_url),
            'manifest_url': manifest_url,
            'update_status': _get_update_status(),
        })
    except Exception as exc:
        return jsonify({
            'code': 1,
            'current_version': APP_VERSION,
            'available': False,
            'error': str(exc),
            'manifest_url': _get_update_manifest_url(),
        }), 200


@app.route('/api/update/status')
def update_status():
    return jsonify({'code': 0, 'current_version': APP_VERSION, 'status': _get_update_status()})


@app.route('/api/update/available')
def update_available():
    """返回后台 30 分钟检查循环发现的待更新信息（无网络请求，供 UI 高频轮询）。"""
    info = getattr(state, '_update_available_info', None)
    return jsonify({
        'code': 0,
        'current_version': APP_VERSION,
        'available': bool(info),
        'latest': info or None,
    })


@app.route('/api/update/reminder')
def update_reminder():
    try:
        import urllib.parse

        manifest_url = _get_update_manifest_url()
        manifest = _fetch_update_manifest()
        latest_version = str(manifest.get('version') or '').strip()
        package_url = _resolve_update_url(manifest_url, manifest.get('url') or manifest.get('package_url') or '')
        available = bool(latest_version and _is_newer_version(latest_version))
        should_prompt = bool(available and _should_prompt_update(latest_version))
        if should_prompt:
            _mark_update_prompt_shown(latest_version)
        package_path = urllib.parse.urlparse(package_url).path if package_url else ''
        package_name = Path(package_path).name if package_path else ''
        return jsonify({
            'code': 0,
            'current_version': APP_VERSION,
            'available': available,
            'should_prompt': should_prompt,
            'latest': {
                'version': latest_version,
                'notes': manifest.get('notes') or '',
                'mandatory': bool(manifest.get('mandatory')),
                'published_at': manifest.get('published_at') or '',
                'size': int(manifest.get('size') or manifest.get('package_size') or 0),
                'filename': package_name,
            },
            'update_status': _get_update_status(),
        })
    except Exception as exc:
        return jsonify({'code': 1, 'current_version': APP_VERSION, 'available': False, 'should_prompt': False, 'error': str(exc)}), 200


@app.route('/api/update/snooze', methods=['POST'])
def snooze_update():
    try:
        payload = request.get_json(silent=True) or {}
        version = str(payload.get('version') or '').strip()
        minutes = int(payload.get('minutes') or int(float(payload.get('hours') or 0) * 60) or 30)
        if not version:
            manifest = _fetch_update_manifest()
            version = str(manifest.get('version') or '').strip()
        _snooze_update_prompt(version, minutes)
        return jsonify({'code': 0, 'version': version, 'minutes': minutes})
    except Exception as exc:
        return jsonify({'code': 1, 'msg': str(exc)}), 500


@app.route('/api/update/apply', methods=['POST'])
def apply_update():
    try:
        payload = request.get_json(silent=True) or {}
        force = bool(payload.get('force'))
        manifest_url = _get_update_manifest_url()
        manifest = _fetch_update_manifest()
        latest_version = str(manifest.get('version') or '').strip()
        if not latest_version:
            return jsonify({'code': 400, 'msg': 'update manifest version is missing'}), 400
        if not force and not _is_newer_version(latest_version):
            return jsonify({'code': 409, 'msg': 'no newer version available', 'current_version': APP_VERSION}), 409

        # 轻量包优先（不含内置浏览器，约 160MB）：本地已有内置浏览器目录时才可选，
        # 否则回退全量包。轻量包可把更新下载量减半以上。
        from companion_updater import choose_update_package

        package_url, package_sha256, package_size = choose_update_package(manifest, manifest_url)
        if not package_url:
            return jsonify({'code': 400, 'msg': 'update package url is missing'}), 400

        with _update_apply_lock:
            current_status = _get_update_status()
            if current_status.get('running'):
                return jsonify({
                    'code': 0,
                    'msg': 'update_already_running',
                    'current_version': APP_VERSION,
                    'target_version': current_status.get('target_version') or latest_version,
                    'status': current_status,
                })
            _begin_update_status(
                latest_version,
                package_url,
                package_size,
            )

            # 下载工作目录持久化：暂停后继续时复用，实现断点续传
            update_work_dir = Path(tempfile.mkdtemp(prefix='pixingyun-update-download-'))

            def _update_job():
                try:
                    from companion_updater import _DownloadPaused, is_download_paused

                    while True:
                        try:
                            _set_update_status(phase='downloading')
                            package_path = _download_update_package(
                                package_url,
                                package_sha256,
                                progress_cb=_set_update_status,
                                expected_size=package_size,
                                work_dir=update_work_dir,
                            )
                            break
                        except _DownloadPaused:
                            _set_update_status(phase='paused')
                            while is_download_paused():
                                time.sleep(0.5)
                            continue
                    _set_update_status(phase='starting', percent=100, package_path=str(package_path))
                    log_path = _start_update_process(package_path, latest_version)
                    _finish_update_status(log_path=str(log_path))
                except Exception as job_exc:
                    # 停止更新并给出统一友好提示，不反复重试、不弹 WSH 窗口
                    _fail_update_status(_friendly_update_failure(job_exc))

            threading.Thread(target=_update_job, daemon=True).start()

        return jsonify({
            'code': 0,
            'msg': 'update_queued',
            'current_version': APP_VERSION,
            'target_version': latest_version,
            'status': _get_update_status(),
        })
    except Exception as exc:
        message = _friendly_update_failure(exc)
        _fail_update_status(message)
        return jsonify({'code': 1, 'msg': message, 'current_version': APP_VERSION}), 500


@app.route('/api/update/pause', methods=['POST'])
def pause_update_download():
    """暂停更新下载：分片/断点数据保留，点继续后接着下载。"""
    try:
        from companion_updater import pause_download

        pause_download()
        if _get_update_status().get('running'):
            _set_update_status(phase='paused')
        return jsonify({'code': 0, 'status': _get_update_status()})
    except Exception as exc:
        return jsonify({'code': 1, 'msg': str(exc), 'current_version': APP_VERSION}), 500


@app.route('/api/update/resume', methods=['POST'])
def resume_update_download():
    """继续更新下载：从暂停处断点续传。"""
    try:
        from companion_updater import resume_download

        resume_download()
        if _get_update_status().get('running'):
            _set_update_status(phase='downloading')
        return jsonify({'code': 0, 'status': _get_update_status()})
    except Exception as exc:
        return jsonify({'code': 1, 'msg': str(exc), 'current_version': APP_VERSION}), 500


def _flash_taskbar() -> None:
    if os.name != 'nt':
        return
    try:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.windll.user32
        current_pid = os.getpid()
        hwnds = []

        EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)

        @EnumWindowsProc
        def _enum_proc(hwnd, _lparam):
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value == current_pid and user32.IsWindowVisible(hwnd):
                hwnds.append(hwnd)
            return True

        user32.EnumWindows(_enum_proc, 0)
        if not hwnds:
            return

        class FLASHWINFO(ctypes.Structure):
            _fields_ = [
                ('cbSize', wintypes.UINT),
                ('hwnd', wintypes.HWND),
                ('dwFlags', wintypes.DWORD),
                ('uCount', wintypes.UINT),
                ('dwTimeout', wintypes.DWORD),
            ]

        FLASHW_TRAY = 0x00000002
        for hwnd in hwnds[:3]:
            info = FLASHWINFO(ctypes.sizeof(FLASHWINFO), hwnd, FLASHW_TRAY, 5, 0)
            user32.FlashWindowEx(ctypes.byref(info))
    except Exception as exc:
        print(f'[Update] taskbar flash failed: {exc}', flush=True)


def _start_update_prompt_daemon(tray=None) -> threading.Thread:
    def _run():
        time.sleep(20)
        while True:
            try:
                manifest = _fetch_update_manifest()
                latest_version = str(manifest.get('version') or '').strip()
                if latest_version and _is_newer_version(latest_version) and _should_prompt_update(latest_version):
                    _mark_update_prompt_shown(latest_version)
                    title = '披星云伴侣有新版本'
                    message = f'发现 v{latest_version}，可以在“关于”里安装更新。'
                    print(f'[Update] new version reminder: {latest_version}', flush=True)
                    if tray is not None:
                        try:
                            tray.notify(title, message, duration=8)
                        except Exception as exc:
                            print(f'[Update] tray notify failed: {exc}', flush=True)
                    _flash_taskbar()
            except Exception as exc:
                print(f'[Update] reminder check failed: {exc}', flush=True)
            time.sleep(6 * 3600)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return thread


@app.route('/api/confirm-login', methods=['POST'])
def confirm_login():
    sid = request.json.get('session_id', '') if request.is_json else request.args.get('session_id', '')
    print(f'[ConfirmLogin] sid={sid} in_sessions={sid in state.active_sessions} total_sessions={len(state.active_sessions)}', flush=True)
    if sid in state.active_sessions:
        if sid in state.scan_cancelled:
            state.scan_status[sid] = 'cancelled'
            state.scan_errors.pop(sid, None)
            return jsonify({'code':409,'msg':'scan session cancelled'}), 409
        state.active_sessions[sid].put('EXTRACT_COOKIES')
        state.scan_status[sid] = 'uploading'
        state.scan_errors.pop(sid, None)
        print(f'[ConfirmLogin] EXTRACT_COOKIES sent to ctrl_queue, status=uploading', flush=True)
        return jsonify({'code':0,'msg':'ok'})
    print(f'[ConfirmLogin] SESSION NOT FOUND! active_keys={list(state.active_sessions.keys())}')
    return jsonify({'code':404,'msg':'session not found'}), 404


@app.route('/api/scan-bind/poll/<session_id>')
def scan_bind_poll(session_id):
    st = state.scan_status.get(session_id, 'not_found')
    return jsonify({'status': st, 'msg': state.scan_errors.get(session_id, '')})


@app.route('/api/cancel-scan', methods=['POST'])
def cancel_scan():
    sid = request.json.get('session_id', '') if request.is_json else request.args.get('session_id', '')
    if sid:
        state.scan_cancelled.add(sid)
        state.scan_status[sid] = 'cancelled'
        state.scan_errors.pop(sid, None)
    if sid in state.active_sessions:
        state.active_sessions[sid].put('CANCEL')
        return jsonify({'code':0,'msg':'ok'})
    if sid:
        return jsonify({'code':0,'msg':'scan session cancelled','status':'cancelled'})
    return jsonify({'code':0,'msg':'scan session already closed','status':'not_found'})


@app.route('/api/scan-bind/trigger', methods=['GET', 'POST', 'OPTIONS'])
def scan_bind_trigger():
    # Trigger scan binding and return JSON.
    if request.method == 'OPTIONS':
        return ('', 204)
    payload = request.get_json(silent=True) if request.is_json else {}
    payload = payload or {}
    platform = (payload.get('platform') or request.args.get('platform', '')).strip()
    auth_payload = {
        'token': payload.get('token') or request.args.get('token', ''),
        'refreshToken': payload.get('refreshToken') or request.args.get('refreshToken', ''),
        'refresh_token': payload.get('refresh_token') or request.args.get('refresh_token', ''),
        'api_url': payload.get('api_url') or request.args.get('api_url', ''),
    }
    api_url, token = _resolve_companion_auth(auth_payload)

    if not platform or not token or not api_url:
        return jsonify({'code':400,'msg':'缺少参数（platform/token/api_url）'}), 400
    if platform not in PLATFORMS:
        return jsonify({'code':400,'msg':f'不支持的平台: {platform}'}), 400
    with _scan_bind_lock:
        active = [
            sid for sid in list(state.active_sessions.keys())
            if state.scan_status.get(sid) in ('starting', 'browser', 'uploading')
        ]
        if active:
            return jsonify({'code':409,'msg':'已有扫码窗口正在进行，请先完成或取消当前绑定','session_id':active[0]}), 409
        info = PLATFORMS[platform]
        session_id = uuid.uuid4().hex[:12]
        queue = Queue()
        state.active_sessions[session_id] = queue
        state.scan_status[session_id] = 'starting'
        state.scan_cancelled.discard(session_id)
        state.scan_errors.pop(session_id, None)

    worker = _make_login_worker(platform, info, queue, queue, api_url, token, use_sse=False, session_id=session_id)
    t = threading.Thread(target=worker, daemon=True)
    t.start()

    resp = make_response(jsonify({'code':0,'session_id':session_id,'msg':'扫码窗口已打开，请在浏览器中完成登录'}))
    allowed_origin = _allowed_cors_origin()
    if allowed_origin:
        resp.headers['Access-Control-Allow-Origin'] = allowed_origin
        resp.headers['Vary'] = 'Origin'
    return resp


@app.route('/api/scan-bind/start')
def scan_bind_start():
    # Start scan binding with SSE progress.
    platform = request.args.get('platform', '').strip()
    api_url, token = _resolve_companion_auth({
        'token': request.args.get('token', ''),
        'refreshToken': request.args.get('refreshToken', ''),
        'refresh_token': request.args.get('refresh_token', ''),
        'api_url': request.args.get('api_url', ''),
    })

    if not platform or not token or not api_url:
        return jsonify({'code':400,'msg':'缺少参数（platform/token/api_url）'}), 400
    if platform not in PLATFORMS:
        return jsonify({'code':400,'msg':f'不支持的平台: {platform}'}), 400

    with _scan_bind_lock:
        active = [
            sid for sid in list(state.active_sessions.keys())
            if state.scan_status.get(sid) in ('browser', 'uploading')
        ]
        if active:
            return jsonify({'code':409,'msg':'已有扫码窗口正在进行，请先完成或取消当前绑定','session_id':active[0]}), 409

    info = PLATFORMS[platform]
    session_id = uuid.uuid4().hex[:12]
    queue = Queue()       # SSE events: worker �?UI
    ctrl_queue = Queue()  # control messages: UI �?worker
    state.active_sessions[session_id] = ctrl_queue  # confirm_login puts to ctrl_queue
    state.scan_status[session_id] = 'browser'
    state.scan_cancelled.discard(session_id)
    state.scan_errors.pop(session_id, None)
    print(f'[ScanBind] session={session_id} platform={platform}', flush=True)

    worker = _make_login_worker(platform, info, queue, ctrl_queue, api_url, token, use_sse=True, session_id=session_id)

    def sse_stream():
        yield f"data: {json.dumps({'type':'session','data':session_id})}\n\n"

        t = threading.Thread(target=worker, daemon=True)
        t.start()

        while t.is_alive() or not queue.empty():
            try:
                msg = queue.get(timeout=0.5)
            except Empty:
                continue

            if isinstance(msg, str):
                try:
                    d = json.loads(msg)
                    yield f"data: {json.dumps(d)}\n\n"
                except Exception:
                    yield f"data: {json.dumps({'type':'status','data':str(msg)})}\n\n"
            elif isinstance(msg, dict):
                yield f"data: {json.dumps(msg)}\n\n"

    headers = {'Cache-Control':'no-cache','X-Accel-Buffering':'no'}
    allowed_origin = _allowed_cors_origin()
    if allowed_origin:
        headers['Access-Control-Allow-Origin'] = allowed_origin
        headers['Vary'] = 'Origin'
    resp = Response(sse_stream(), mimetype='text/event-stream', headers=headers)
    @resp.call_on_close
    def cleanup():
        # Always clean up session state when SSE connection closes,
        # regardless of worker status (handles crash/stuck scenarios).
        sid_status = state.scan_status.get(session_id)
        if sid_status in ('done', 'error', 'cancelled'):
            state.active_sessions.pop(session_id, None)
        elif sid_status == 'browser':
            # Worker may have crashed or timed out without setting a terminal status.
            # Mark as error and clean up to prevent session leak.
            state.scan_status[session_id] = 'error'
            state.scan_errors[session_id] = '连接已断开'
            state.active_sessions.pop(session_id, None)
    return resp


@app.route('/api/doudian/stores', methods=['GET', 'POST', 'OPTIONS'])
def doudian_stores():
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    if request.method == 'GET':
        stores = _get_doudian_stores()
        # 兼容旧版本写入的原始报错文案：任何展示层都不应再出现
        # "400 Client Error"、URL 或 traceback，统一转换成友好中文提示。
        for item in stores:
            raw_msg = str(item.get('login_message') or '')
            if raw_msg and ('Client Error' in raw_msg or 'http://' in raw_msg.lower()
                            or 'https://' in raw_msg.lower() or 'Traceback' in raw_msg):
                item['login_message'] = _friendly_doudian_error(raw_msg)
        if str(request.args.get('probe') or '').lower() in ('1', 'true', 'yes'):
            if not state._doudian_sync_lock.acquire(blocking=False):
                return jsonify({'code': 409, 'msg': '抖店正在同步或登录中，请稍后再检查状态'}), 409
            try:
                probed = []
                for store in stores:
                    try:
                        probed.append(_probe_doudian_store_state(store.get('id')))
                    except Exception as exc:
                        msg = _friendly_doudian_error(exc)
                        updated = _mark_doudian_store_state(store.get('id'), 'error', msg)
                        probed.append(updated or {**store, 'login_state': 'error', 'login_message': msg})
                stores = probed
            finally:
                try:
                    state._doudian_sync_lock.release()
                except RuntimeError:
                    pass
        return jsonify({'code': 0, 'data': stores})

    body = request.get_json(silent=True) or {}
    name = str(body.get('name') or '').strip()
    if not name:
        return jsonify({'code': 400, 'msg': '缺少店铺名称'}), 400

    local_id = uuid.uuid4().hex[:12]
    api_url, token = _resolve_companion_auth(body)
    if not token:
        return jsonify({'code': 401, 'msg': '桌面伴侣未登录，缺少 ddddkiii token'}), 401

    try:
        import requests as req
        response = req.post(
            f'{api_url}/doudian-browser/stores/companion',
            json={'name': name, 'localProfileId': local_id},
            headers={'Authorization': f'Bearer {token}'},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json().get('data') or response.json()
        cloud_store_id = data.get('id')
        if not cloud_store_id:
            return jsonify({'code': 502, 'msg': '云端未返回店铺ID'}), 502
    except Exception as e:
        return jsonify({'code': 502, 'msg': f'创建云端店铺失败: {str(e)[:180]}'}), 502

    store = {
        'id': local_id,
        'name': name,
        'cloud_store_id': cloud_store_id,
        'profile_id': local_id,
        'created_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'last_synced_at': '',
        'last_error': '',
        'login_state': 'unknown',
        'login_message': '待登录确认',
        'login_checked_at': '',
        'last_login_at': '',
    }
    stores = _get_doudian_stores()
    stores.append(store)
    _save_doudian_stores(stores)
    return jsonify({'code': 0, 'data': store})


@app.route('/api/doudian/stores/<local_id>/login', methods=['POST', 'OPTIONS'])
def doudian_login(local_id):
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    store = _find_doudian_store(local_id)
    if not store:
        return jsonify({'code': 404, 'msg': '本地抖店店铺不存在'}), 404

    if not state._doudian_sync_lock.acquire(blocking=False):
        return jsonify({'code': 409, 'msg': '抖店正在同步，请稍后再打开登录窗口'}), 409

    state._doudian_active_task = {
        'type': 'login',
        'label': '\u767b\u5f55\u4e2d',
        'store_id': local_id,
        'store_name': store.get('name'),
        'started_at': time.strftime('%Y-%m-%d %H:%M:%S'),
    }

    def _worker():
        try:
            from doudian_store_collector import open_login_window, run_async
            result = run_async(open_login_window(store.get('profile_id') or local_id, state._BROWSER_PATH, state._BROWSER_CHANNEL))
            if result.get('logged_in'):
                captured_name = (result.get('store_name') or '').strip()
                old_name = store.get('name') or ''
                print(f"[Doudian] login confirmed for {old_name or local_id}, captured store name: {captured_name or '(none)'}", flush=True)
                stores = _get_doudian_stores()
                for item in stores:
                    if item.get('id') == local_id:
                        if captured_name and captured_name != old_name:
                            item['name'] = captured_name
                        item['last_error'] = ''
                        item['login_state'] = 'online'
                        item['login_message'] = '已登录'
                        item['login_checked_at'] = time.strftime('%Y-%m-%d %H:%M:%S')
                        item['last_login_at'] = item['login_checked_at']
                        break
                _save_doudian_stores(stores)
                # Sync the real store name to the cloud so the website shows it immediately.
                cloud_id = store.get('cloud_store_id')
                if captured_name and cloud_id:
                    cfg = _load_config()
                    _api_url = (cfg.get('api_url') or 'https://ddddkiii.com/api/v1').rstrip('/')
                    _token = cfg.get('token') or ''
                    if _token:
                        try:
                            import requests as req
                            req.patch(
                                f'{_api_url}/doudian-browser/stores/{cloud_id}',
                                json={'name': captured_name},
                                headers={'Authorization': f'Bearer {_token}'},
                                timeout=15,
                            )
                        except Exception as cloud_err:
                            print(f'[Doudian] failed to sync store name to cloud: {cloud_err}', flush=True)
            else:
                print(f"[Doudian] login window closed without confirmation for {store.get('name') or local_id}", flush=True)
                stores = _get_doudian_stores()
                reason = result.get('reason') or 'window_closed'
                if reason == 'security_block':
                    msg = '\u6296\u5e97\u68c0\u6d4b\u5230\u64cd\u4f5c\u73af\u5883\u5f02\u5e38\u3002\u8bf7\u5173\u95ed\u5176\u4ed6\u6296\u5e97\u6d4f\u89c8\u5668\u7a97\u53e3\u540e\u91cd\u65b0\u70b9\u51fb\u767b\u5f55\u3002'
                elif reason == 'timeout':
                    msg = '\u6296\u5e97\u767b\u5f55\u8d85\u65f6\uff0c\u8bf7\u91cd\u65b0\u70b9\u51fb\u767b\u5f55\u5e76\u626b\u7801'
                else:
                    msg = '\u6296\u5e97\u767b\u5f55\u672a\u5b8c\u6210\uff0c\u8bf7\u91cd\u65b0\u70b9\u51fb\u767b\u5f55\u5e76\u626b\u7801'
                for item in stores:
                    if item.get('id') == local_id:
                        item['last_error'] = msg
                        item['login_state'] = 'expired'
                        item['login_message'] = msg
                        item['login_checked_at'] = time.strftime('%Y-%m-%d %H:%M:%S')
                        break
                _save_doudian_stores(stores)
        except Exception as e:
            msg = _friendly_doudian_error(e)
            print(f'[Doudian] login window error: {msg}', flush=True)
            _mark_doudian_store_state(local_id, 'error', msg)
        finally:
            state._doudian_active_task = None
            state._doudian_sync_lock.release()

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({'code': 0, 'msg': '抖店登录窗口已打开'})


@app.route('/api/doudian/stores/<local_id>', methods=['DELETE', 'OPTIONS'])
def doudian_delete_store(local_id):
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    store = _find_doudian_store(local_id)
    if not store:
        return jsonify({'code': 404, 'msg': '本地抖店店铺不存在'}), 404

    body = request.get_json(silent=True) or {}
    api_url, token = _resolve_companion_auth(body)
    cloud_deleted = False
    cloud_error = ''
    if store.get('cloud_store_id') and token:
        try:
            import requests as req
            resp = req.delete(
                f"{api_url}/doudian-browser/stores/{store.get('cloud_store_id')}",
                headers={'Authorization': f'Bearer {token}'},
                timeout=30,
            )
            if resp.status_code in (200, 204, 404):
                cloud_deleted = True
            else:
                cloud_error = resp.text[:300]
        except Exception as e:
            cloud_error = str(e)[:300]

    stores = [item for item in _get_doudian_stores() if item.get('id') != local_id]
    _save_doudian_stores(stores)

    profile_deleted = False
    profile_error = ''
    try:
        from doudian_store_collector import get_profile_path
        import shutil
        profile_path = get_profile_path(store.get('profile_id') or local_id)
        root = profile_path.parent.resolve()
        target = profile_path.resolve()
        if root in target.parents and target.exists():
            shutil.rmtree(target, ignore_errors=True)
            profile_deleted = True
    except Exception as e:
        profile_error = str(e)[:300]

    return jsonify({
        'code': 0,
        'data': {
            'deleted': True,
            'cloud_deleted': cloud_deleted,
            'cloud_error': cloud_error,
            'profile_deleted': profile_deleted,
            'profile_error': profile_error,
        },
    })



@app.route('/api/doudian/stores/<local_id>/sync', methods=['POST', 'OPTIONS'])
def doudian_sync(local_id):
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    store = _find_doudian_store(local_id)
    if not store:
        return jsonify({'code': 404, 'msg': '\u672c\u5730\u6296\u5e97\u5e97\u94fa\u4e0d\u5b58\u5728'}), 404

    if not state._doudian_sync_lock.acquire(blocking=False):
        return jsonify({'code': 409, 'msg': '\u6296\u5e97\u6b63\u5728\u540c\u6b65\u6216\u767b\u5f55\u4e2d\uff0c\u8bf7\u5148\u53d6\u6d88\u5f53\u524d\u4efb\u52a1\u6216\u7a0d\u540e\u518d\u8bd5'}), 409

    body = request.get_json(silent=True) or {}
    api_url, token = _resolve_companion_auth(body)

    job_id = uuid.uuid4().hex[:12]
    state.doudian_jobs[job_id] = {
        'status': 'running',
        'store_id': local_id,
        'store_name': store.get('name'),
        'started_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'message': '\u91c7\u96c6\u4e2d',
        'cancel_requested': False,
    }
    state._doudian_active_task = {
        'type': 'sync',
        'label': '\u540c\u6b65\u4e2d',
        'job_id': job_id,
        'store_id': local_id,
        'store_name': store.get('name'),
        'started_at': state.doudian_jobs[job_id]['started_at'],
    }

    def _worker():
        try:
            result = _run_doudian_store_sync(local_id, api_url, token)
            if state.doudian_jobs.get(job_id, {}).get('cancel_requested'):
                state.doudian_jobs[job_id].update({
                    'status': 'canceled',
                    'message': '\u540c\u6b65\u5df2\u53d6\u6d88',
                    'finished_at': time.strftime('%Y-%m-%d %H:%M:%S'),
                })
            else:
                state.doudian_jobs[job_id].update({
                    'status': 'success',
                    'message': '\u540c\u6b65\u5b8c\u6210',
                    'finished_at': time.strftime('%Y-%m-%d %H:%M:%S'),
                    'result': result,
                })
        except Exception as e:
            if state.doudian_jobs.get(job_id, {}).get('cancel_requested'):
                state.doudian_jobs[job_id].update({
                    'status': 'canceled',
                    'message': '\u540c\u6b65\u5df2\u53d6\u6d88',
                    'finished_at': time.strftime('%Y-%m-%d %H:%M:%S'),
                })
            else:
                msg = _friendly_doudian_error(e)
                stores = _get_doudian_stores()
                for item in stores:
                    if item.get('id') == local_id:
                        item['last_error'] = msg
                        item['login_state'] = 'expired' if ('登录' in msg or 'login' in msg.lower()) else 'error'
                        item['login_message'] = msg
                        item['login_checked_at'] = time.strftime('%Y-%m-%d %H:%M:%S')
                        break
                _save_doudian_stores(stores)
                state.doudian_jobs[job_id].update({
                    'status': 'error',
                    'message': msg,
                    'finished_at': time.strftime('%Y-%m-%d %H:%M:%S'),
                })
        finally:
            state._doudian_active_task = None
            try:
                state._doudian_sync_lock.release()
            except RuntimeError:
                pass

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({'code': 0, 'job_id': job_id, 'msg': '\u6296\u5e97\u540c\u6b65\u5df2\u5f00\u59cb'})


@app.route('/api/doudian/jobs/<job_id>')
def doudian_job_status(job_id):
    job = state.doudian_jobs.get(job_id)
    if not job:
        return jsonify({'code': 404, 'msg': '\u4efb\u52a1\u4e0d\u5b58\u5728'}), 404
    return jsonify({'code': 0, 'data': job})


@app.route('/api/doudian/jobs/<job_id>/cancel', methods=['POST', 'OPTIONS'])
def doudian_job_cancel(job_id):
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    job = state.doudian_jobs.get(job_id)
    if not job:
        return jsonify({'code': 404, 'msg': '\u4efb\u52a1\u4e0d\u5b58\u5728'}), 404
    if job.get('status') not in ('running', 'canceling'):
        return jsonify({'code': 0, 'data': job})

    job['cancel_requested'] = True
    job['status'] = 'canceling'
    job['message'] = '\u6b63\u5728\u53d6\u6d88\u540c\u6b65'

    store = _find_doudian_store(job.get('store_id'))
    profile_id = (store or {}).get('profile_id') or job.get('store_id')
    _cleanup_doudian_profile_processes(profile_id)
    return jsonify({'code': 0, 'data': job, 'msg': '\u5df2\u8bf7\u6c42\u53d6\u6d88\u540c\u6b65'})


@app.route('/api/doudian/schedule')
def doudian_schedule_status():
    now = time.time()
    countdown = max(0, int((state._doudian_next_run_at or now) - now)) if state._doudian_next_run_at else None
    next_run_at_text = (
        time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(state._doudian_next_run_at))
        if state._doudian_next_run_at
        else None
    )
    stores = _get_doudian_stores()
    synced_times = [
        str(store.get('last_synced_at') or '').strip()
        for store in stores
        if str(store.get('last_synced_at') or '').strip()
    ]
    last_synced_at = max(synced_times) if synced_times else None
    store_errors = [
        {
            'id': store.get('id'),
            'name': store.get('name') or store.get('id'),
            'error': _friendly_doudian_error(str(store.get('last_error') or '').strip()),
        }
        for store in stores
        if str(store.get('last_error') or '').strip()
    ]
    last_error = _friendly_doudian_error(state._doudian_last_error) if state._doudian_last_error else (store_errors[-1]['error'] if store_errors else None)
    return jsonify({
        'code': 0,
        'data': {
            'started': state._doudian_scheduler_started,
            'running': state._doudian_sync_lock.locked(),
            'store_count': len(stores),
            'interval_seconds': state._doudian_schedule_interval,
            'next_run_at': next_run_at_text,
            'countdown_seconds': countdown,
            'last_run': state._doudian_last_run or last_synced_at,
            'last_synced_at': last_synced_at,
            'last_error': last_error,
            'store_errors': store_errors,
            'active_task': state._doudian_active_task,
        },
    })


# ══════════════════════════════════════════════════════════════════
# AI 剪辑（DeepSeek + capcut-cli）
# ══════════════════════════════════════════════════════════════════

try:
    import companion_video_editor as video_editor
    _video_editor_available = True
    print('[Main] AI 剪辑模块已加载')
except Exception as _ve_err:
    _video_editor_available = False
    print(f'[Main] AI 剪辑模块加载失败: {_ve_err}')


@app.route('/api/video-editor/env')
def video_editor_env():
    """获取 AI 剪辑环境状态"""
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    return jsonify({'code': 0, 'data': video_editor.get_environment()})


@app.route('/api/video-editor/drafts')
def video_editor_drafts():
    """列出剪映草稿"""
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    return jsonify({'code': 0, 'data': video_editor.list_drafts()})


@app.route('/api/video-editor/drafts/<path:project>/info')
def video_editor_draft_info(project):
    """获取草稿详情"""
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    result = video_editor.get_draft_info(project)
    return jsonify({'code': 0 if result.get('ok') else 1, 'data': result})


@app.route('/api/video-editor/create', methods=['POST', 'OPTIONS'])
def video_editor_create():
    """创建新剪映项目"""
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    body = request.get_json(silent=True) or {}
    name = body.get('name', '')
    video_path = body.get('video_path')
    if not name:
        return jsonify({'code': 400, 'error': '缺少项目名称'})
    result = video_editor.create_project(name, video_path)
    return jsonify({'code': 0 if result.get('ok') else 1, 'data': result})


@app.route('/api/video-editor/ai-edit', methods=['POST', 'OPTIONS'])
def video_editor_ai_edit():
    """AI 剪辑：用 DeepSeek 驱动 capcut-cli"""
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})

    body = request.get_json(silent=True) or {}
    instruction = body.get('instruction', '').strip()
    api_key = body.get('api_key', '').strip()
    base_url = body.get('base_url', '').strip()
    model = body.get('model', '').strip()
    project = body.get('project', '').strip() or None

    if not instruction:
        return jsonify({'code': 400, 'error': '请输入剪辑需求'})
    if not api_key:
        return jsonify({'code': 400, 'error': '请配置 DeepSeek API Key'})

    try:
        result = video_editor.start_ai_edit(instruction, api_key, base_url, model, project)
    except ValueError as exc:
        return jsonify({'code': 400, 'error': str(exc)}), 400
    return jsonify({'code': 0, 'data': result})


@app.route('/api/video-editor/standard-edit', methods=['POST', 'OPTIONS'])
def video_editor_standard_edit():
    """标准模式流水线: 气口→字幕→素材→导出"""
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})

    body = request.get_json(silent=True) or {}
    project = body.get('project', '').strip()
    video_path = body.get('video_path', '').strip()
    api_key = body.get('api_key', '').strip()
    base_url = body.get('base_url', '').strip()
    options = {
        'font_size': body.get('font_size', 48),
        'subtitle_color': body.get('subtitle_color', '#FFFFFF'),
        'silence_threshold': body.get('silence_threshold', 0.5),
        'effects_enabled': body.get('effects_enabled', True),
        'model': body.get('model', '').strip(),
    }

    if not project:
        return jsonify({'code': 400, 'error': '请选择或创建剪映项目'})
    if not video_path:
        return jsonify({'code': 400, 'error': '缺少视频文件路径'})

    try:
        result = video_editor.start_standard_edit(project, video_path, api_key, base_url, options)
    except ValueError as exc:
        return jsonify({'code': 400, 'error': str(exc)}), 400
    return jsonify({'code': 0, 'data': result})


@app.route('/api/video-editor/task/<task_id>')
def video_editor_task_status(task_id):
    """获取 AI 剪辑任务状态"""
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    return jsonify({'code': 0, 'data': video_editor.get_task_status(task_id)})


@app.route('/api/video-editor/open', methods=['POST', 'OPTIONS'])
def video_editor_open():
    """在文件管理器中打开项目"""
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    body = request.get_json(silent=True) or {}
    project_path = body.get('project_path', '')
    if not project_path:
        return jsonify({'code': 400, 'error': '缺少项目路径'})
    result = video_editor.open_in_jianying(project_path)
    return jsonify({'code': 0 if result.get('ok') else 1, 'data': result})


@app.route('/api/video-editor/capcut', methods=['POST', 'OPTIONS'])
def video_editor_raw_capcut():
    """直接执行 capcut-cli 命令（高级用户）"""
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    body = request.get_json(silent=True) or {}
    args = body.get('args', [])
    if not args:
        return jsonify({'code': 400, 'error': '缺少命令参数'})
    if '--jianying' not in args:
        args.append('--jianying')
    result = video_editor._run_capcut(args)
    return jsonify({'code': 0 if result.get('ok') else 1, 'data': result})


@app.route('/api/video-editor/v2/env')
def video_editor_v2_env():
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    return jsonify({'code': 0, 'data': video_editor.get_environment()})


@app.route('/api/video-editor/v2/basic', methods=['POST', 'OPTIONS'])
def video_editor_v2_basic():
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    body = request.get_json(silent=True) or {}
    try:
        result = video_editor.start_v2_basic_edit({
            'source_path': body.get('source_path', ''),
            'pace': body.get('pace', 'compact'),
            'subtitle_template': body.get('subtitle_template', 'yellow'),
            'material_density': body.get('material_density', 'normal'),
            'material_library': body.get('material_library') or body.get('material_folder'),
        })
        return jsonify({'code': 0, 'data': result})
    except ValueError as exc:
        return jsonify({'code': 400, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'code': 500, 'error': str(exc)}), 500


@app.route('/api/video-editor/v2/tasks')
def video_editor_v2_tasks():
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    return jsonify({'code': 0, 'data': video_editor.list_v2_tasks()})


@app.route('/api/video-editor/v2/tasks/<task_id>')
def video_editor_v2_task(task_id):
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    task = video_editor.get_v2_task(task_id)
    if not task:
        return jsonify({'code': 404, 'error': 'TASK_NOT_FOUND'}), 404
    return jsonify({'code': 0, 'data': task})


@app.route('/api/video-editor/v2/tasks/<task_id>/cancel', methods=['POST', 'OPTIONS'])
def video_editor_v2_cancel(task_id):
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    return jsonify({'code': 0, 'data': video_editor.cancel_v2_task(task_id)})


@app.route('/api/video-editor/v2/materials/scan', methods=['POST', 'OPTIONS'])
def video_editor_v2_material_scan():
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    body = request.get_json(silent=True) or {}
    folder = body.get('folder') or body.get('material_library') or ''
    return jsonify({'code': 0, 'data': video_editor.scan_v2_materials(folder)})


@app.route('/api/video-editor/v2/materials')
def video_editor_v2_materials():
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    folder = request.args.get('folder', '')
    return jsonify({'code': 0, 'data': video_editor.scan_v2_materials(folder)})


@app.route('/api/video-editor/v2/pick-video', methods=['POST', 'OPTIONS'])
def video_editor_v2_pick_video():
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    return jsonify({'code': 0, 'data': video_editor.pick_v2_video()})


@app.route('/api/video-editor/v2/pick-material-folder', methods=['POST', 'OPTIONS'])
def video_editor_v2_pick_material_folder():
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    if not _video_editor_available:
        return jsonify({'code': 500, 'error': 'AI 剪辑模块未加载'})
    return jsonify({'code': 0, 'data': video_editor.pick_v2_material_folder()})


@app.route('/api/video-editor/v2/probe', methods=['POST', 'OPTIONS'])
def video_editor_v2_probe():
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    body = request.get_json(silent=True) or {}
    try:
        return jsonify({'code': 0, 'data': video_editor.probe_v2_video(body.get('path', ''))})
    except Exception as exc:
        return jsonify({'code': 400, 'error': str(exc)}), 400


@app.route('/api/video-editor/v2/open-output', methods=['POST', 'OPTIONS'])
def video_editor_v2_open_output():
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    body = request.get_json(silent=True) or {}
    return jsonify({'code': 0, 'data': video_editor.open_v2_output(body.get('path', ''))})


@app.route('/api/video-editor/v2/play', methods=['POST', 'OPTIONS'])
def video_editor_v2_play():
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    body = request.get_json(silent=True) or {}
    return jsonify({'code': 0, 'data': video_editor.play_v2_output(body.get('path', ''))})


@app.route('/api/video-editor/v2/advanced/analyze', methods=['POST', 'OPTIONS'])
def video_editor_v2_advanced_analyze():
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    body = request.get_json(silent=True) or {}
    try:
        return jsonify({'code': 0, 'data': video_editor.start_v2_advanced_analyze(body)})
    except Exception as exc:
        return jsonify({'code': 400, 'error': str(exc)}), 400


@app.route('/api/video-editor/v2/advanced/<task_id>/plan')
def video_editor_v2_advanced_plan(task_id):
    task = video_editor.get_v2_task(task_id)
    if not task:
        return jsonify({'code': 404, 'error': 'TASK_NOT_FOUND'}), 404
    return jsonify({'code': 0, 'data': task.get('plan') or {}})


@app.route('/api/video-editor/v2/advanced/<task_id>/plan', methods=['PATCH', 'OPTIONS'])
def video_editor_v2_advanced_patch_plan(task_id):
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    body = request.get_json(silent=True) or {}
    task = video_editor.patch_v2_advanced_plan(task_id, body)
    if not task:
        return jsonify({'code': 404, 'error': 'TASK_NOT_FOUND'}), 404
    return jsonify({'code': 0, 'data': task.get('plan') or {}})


@app.route('/api/video-editor/v2/advanced/<task_id>/render', methods=['POST', 'OPTIONS'])
def video_editor_v2_advanced_render(task_id):
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    body = request.get_json(silent=True) or {}
    try:
        return jsonify({'code': 0, 'data': video_editor.render_v2_advanced(task_id, body)})
    except Exception as exc:
        return jsonify({'code': 400, 'error': str(exc)}), 400


# ══════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════
def _read_install_version(exe_dir: str) -> str:
    """读取另一个安装的版本号（onedir 打包会带 _internal/companion_state.py 源码）。"""
    try:
        state_py = os.path.join(exe_dir, '_internal', 'companion_state.py')
        if not os.path.isfile(state_py):
            return ''
        text = open(state_py, encoding='utf-8', errors='replace').read(8000)
        m = re.search(r"APP_VERSION\\s*=\\s*['\"]([^'\"]+)['\"]", text)
        return m.group(1).strip() if m else ''
    except Exception:
        return ''


def _recycle_install_dir(dir_path: str) -> bool:
    """把旧安装目录送入回收站（可恢复），返回是否成功。"""
    try:
        ps = (
            "Add-Type -AssemblyName Microsoft.VisualBasic; "
            "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory("
            + repr(str(dir_path).replace(chr(39), chr(39) * 2))
            + ", 'OnlyErrorDialogs', 'SendToRecycleBin')"
        )
        result = subprocess.run(
            ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
            capture_output=True, timeout=120,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
        )
        return result.returncode == 0
    except Exception as exc:
        print(f'[Main] 回收旧安装失败 {dir_path}: {exc}', flush=True)
        return False


def _find_other_companion_installs() -> list:
    """扫描常见位置，返回本机上其他伴侣安装 [{exe, dir, version}]（不含当前实例）。"""
    current = os.path.abspath(sys.argv[0]) if getattr(sys, 'frozen', False) else ''
    candidates = [
        r'D:\\Pixingyun',
        r'C:\\Pixingyun',
        r'D:\\Pixingyun Mate',
        r'C:\\Pixingyun Mate',
        os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'Pixingyun Mate'),
        os.path.join(os.environ.get('USERPROFILE', ''), 'Desktop', 'Pixingyun Mate'),
        os.path.join(os.environ.get('USERPROFILE', ''), 'Desktop', 'pixingyun-mate'),
        os.path.join(os.environ.get('USERPROFILE', ''), 'Downloads', 'Pixingyun Mate'),
        os.path.join(os.environ.get('USERPROFILE', ''), 'Downloads', 'pixingyun-mate'),
    ]
    found = []
    seen = set()
    for d in candidates:
        try:
            exe = os.path.join(d, 'pixingyun-mate.exe')
            if os.path.isfile(exe) and os.path.normcase(os.path.abspath(exe)) != os.path.normcase(current):
                key = os.path.normcase(os.path.abspath(exe))
                if key in seen:
                    continue
                seen.add(key)
                found.append({
                    'exe': os.path.abspath(exe),
                    'dir': os.path.abspath(d),
                    'version': _read_install_version(os.path.abspath(d)),
                })
        except Exception:
            continue
    return found


if __name__ == '__main__':
    # 尽早给所有出站请求装上版本号 + 设备标识请求头（供服务端日志区分设备）
    try:
        from companion_config import install_companion_request_headers
        install_companion_request_headers()
    except Exception as _hdr_err:
        print(f'[WARN] companion request headers init failed: {_hdr_err}')

    startup_silent = any(arg in ('--startup', '--silent', '--tray') for arg in sys.argv[1:])
    if startup_silent:
        os.environ['PIXINGYUN_STARTUP_SILENT'] = '1'
        print('[Main] Startup silent mode enabled', flush=True)
    if state._CONFIG_CACHE.get('launch_on_start') is True:
        try:
            from startup_manager import repair_startup_path_if_enabled

            repaired = repair_startup_path_if_enabled()
            print(f"[Startup] registry status: enabled={repaired.get('enabled')} path_ok={repaired.get('path_ok')}", flush=True)
        except Exception as exc:
            print(f'[Startup] auto repair failed: {exc}', flush=True)
    # ═══ v4.0: 原生窗口 + 按需浏览器架构 ═══
    #  - pywebview 提供原生窗口 UI（不再是 Chrome 附着模式）
    #  - 内置浏览器仅在扫码绑定时按需启动
    #  - 采集使用独立的 headless 浏览器实例

    # 隐藏控制台窗口（PyInstaller console=False 时已自动隐藏）
    if sys.platform == 'win32' and not '--debug' in sys.argv:
        try:
            import ctypes
            hwnd = ctypes.windll.kernel32.GetConsoleWindow()
            if hwnd:
                ctypes.windll.user32.ShowWindow(hwnd, 0)  # SW_HIDE
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')

    import urllib.request

    APP_URL = 'http://127.0.0.1:5409'

    def _show_native_window_notice(message):
        try:
            if sys.platform == 'win32':
                import ctypes
                ctypes.windll.user32.MessageBoxW(None, message, 'Pixingyun Mate', 0x00000040)
        except Exception as exc:
            print(f'[Main] Native window notice failed: {exc}')

    # ── 1. 启动 Flask ──
    def start_flask():
        app.run(host='127.0.0.1', port=5409, debug=False)

    flask_thread = threading.Thread(target=start_flask, daemon=True)
    flask_thread.start()

    # 等待 Flask 就绪
    print('[Main] 等待 Flask 就绪...')
    deadline = time.time() + 20
    flask_ready = False
    while time.time() < deadline:
        try:
            urllib.request.urlopen(APP_URL + '/health', timeout=3)
            flask_ready = True
            break
        except Exception as _e:
            print(f'[Main] 等待 Flask... ({_e})', flush=True)
            time.sleep(0.5)
    if not flask_ready:
        print('[Main] 错误: Flask 启动超时（20秒）')
        # 不退出，继续尝试（可能是首次启动慢）
        # sys.exit(1)
    print('[Main] Flask 就绪')
    try:
        from local_db import cleanup_running_collection_runs
        cleaned_runs = cleanup_running_collection_runs()
        if cleaned_runs:
            print(f'[Main] Cleaned {cleaned_runs} stale running collection run(s)', flush=True)
    except Exception as cleanup_err:
        print(f'[Main] Stale collection cleanup failed: {cleanup_err}', flush=True)
    # ── 1b. 启动时清理上次会话遗留的伴侣浏览器进程（内存卫生，防止吃满内存后 Windows 关后台应用） ──
    try:
        from browser_manager import cleanup_stale_companion_browsers

        swept = cleanup_stale_companion_browsers()
        if swept:
            print(f'[Main] Startup browser sweep: cleaned {swept} stale process(es)', flush=True)
    except Exception as sweep_err:
        print(f'[Main] Startup browser sweep failed: {sweep_err}', flush=True)

    # ── 1c. 其他伴侣安装清理：默认关闭，只能显式配置后启用 ──
    try:
        cleanup_other_installs_on_start = _load_config().get('cleanup_other_installs_on_start') is True
        def _cleanup_other_installs():
            try:
                found = _find_other_companion_installs()
                for item in found:
                    other_version = item.get('version') or 'unknown'
                    if _recycle_install_dir(item['dir']):
                        print(f"[Main] 已静默清理其他伴侣安装: {item['dir']} (v{other_version})", flush=True)
                    else:
                        print(f"[Main] 其他安装清理失败(下次启动重试): {item['dir']}", flush=True)
            except Exception as _d:
                print(f'[Main] 其他安装清理失败: {_d}', flush=True)

        if cleanup_other_installs_on_start:
            threading.Thread(target=_cleanup_other_installs, daemon=True, name='other-installs-cleanup').start()
        else:
            print('[Main] Other install cleanup disabled by default', flush=True)
    except Exception as _d2:
        print(f'[Main] 其他安装清理线程启动失败: {_d2}', flush=True)

    _ensure_doudian_scheduler_started()

    # ── 2. 主动 Token 刷新 ──
    print('[Main] 启动 Token 刷新守护线程...')
    _start_token_refresh_daemon()

    # ── 2b. 伴侣监控中心心跳（仅上报自身进程/任务状态） ──
    try:
        from companion_heartbeat import start_heartbeat_thread
        start_heartbeat_thread()
    except Exception as _hb_err:
        print(f'[WARN] heartbeat thread start failed: {_hb_err}')

    # ── 3. 启动定时采集 ──
    if _load_config().get('auto_collect_on_start') is True:
        state._collector_paused = False
        def _auto_start_collector():
            
            time.sleep(15)
            with state._collector_loop_lock:
                if state._collector_loop_started:
                    return
                state._collector_loop_started = True
                _schedule_next_collection()
                print('[Main] Auto-starting background collector')
                threading.Thread(
                    target=_run_collection_once,
                    args=(0, 'full', 'auto_start'),
                    daemon=True,
                ).start()
                threading.Thread(target=_data_collector_loop, daemon=True).start()
        threading.Thread(target=_auto_start_collector, daemon=True).start()
    else:
        state._collector_paused = True
        state._collector_next_run_at = None
        print('[Main] Background collector disabled')
        threading.Thread(
            target=_run_startup_collection_if_stale,
            args=(20,),
            daemon=True,
            name='startup-stale-collector',
        ).start()

    # ── 3b. 启动微信视频号会话保活守护线程 ──
    try:
        from session_keepalive import start_keepalive
        start_keepalive()
        print('[Main] Session keep-alive daemon started')
    except Exception as _ka_err:
        print(f'[Main] Session keep-alive start failed: {_ka_err}')

    # ── 3c. 启动运行日志上传守护线程（服务端按设备保存，供远程排查） ──
    try:
        from companion_telemetry import start_log_upload_daemon
        start_log_upload_daemon()
    except Exception as _tel_err:
        print(f'[Main] Log upload daemon start failed: {_tel_err}')

    # ── 3d. 更新检查守护线程：每 30 分钟自动检查，检测到新版本即触发强提醒 ──
    try:
        import urllib.parse as _up

        state._update_available_info = None

        def _update_check_loop():
            time.sleep(15)
            while True:
                try:
                    manifest = _fetch_update_manifest()
                    latest_version = str(manifest.get('version') or '').strip()
                    if latest_version and _is_newer_version(latest_version) and _should_prompt_update(latest_version):
                        package_url = _resolve_update_url(
                            _get_update_manifest_url(),
                            manifest.get('url') or manifest.get('package_url') or '',
                        )
                        package_path = _up.urlparse(package_url).path if package_url else ''
                        state._update_available_info = {
                            'version': latest_version,
                            'notes': manifest.get('notes') or '',
                            'mandatory': bool(manifest.get('mandatory')),
                            'published_at': manifest.get('published_at') or '',
                            'size': int(manifest.get('size') or manifest.get('package_size') or 0),
                            'filename': Path(package_path).name if package_path else '',
                        }
                        _mark_update_prompt_shown(latest_version)
                        print(f'[Update] 检测到新版本 {latest_version}，触发强提醒')
                        _flash_taskbar()
                    else:
                        state._update_available_info = None
                except Exception as _ue:
                    print(f'[Update] 自动更新检查失败: {_ue}')
                time.sleep(1800)

        threading.Thread(target=_update_check_loop, daemon=True, name='update-check-loop').start()
        print('[Main] Update check loop started (every 30 min)')
    except Exception as _ul_err:
        print(f'[Main] Update check loop start failed: {_ul_err}')

    # ── 4. 启动系统托盘（后台线程）──
    win = None  # 提前定义，供 _on_exit 闭包引用
    _tray_available = False
    try:
        from tray_manager import TrayManager, start_status_poller

        def _on_open():
            """打开或重新打开主界面窗口。

            v4.1: 使用 pywebview 原生窗口恢复，不再用系统浏览器打开。
            """
            try:
                from webview_window import show_window
                if not show_window():
                    print('[Tray] pywebview 窗口不可用，无法恢复主界面')
                    _show_native_window_notice('披星云伴侣主界面暂时无法恢复，请退出后重新打开最新版。')
            except Exception as e:
                print(f'[Tray] 打开主界面失败: {e}')

        def _on_quick_collect():
            import requests as _req
            try:
                _req.post(f'{APP_URL}/api/data-collection/trigger',
                          json={'mode': 'full', 'max_posts': 0}, timeout=5)
            except Exception as e:
                print(f'[Tray] 全量采集触发失败: {e}')

        def _on_full_collect():
            import requests as _req
            try:
                _req.post(f'{APP_URL}/api/data-collection/trigger',
                          json={'mode': 'full', 'max_posts': 0}, timeout=5)
            except Exception as e:
                print(f'[Tray] 全量采集触发失败: {e}')

        def _on_toggle_pause(paused):
            
            state._collector_paused = paused
            print(f'[Tray] 定时采集已{"暂停" if paused else "恢复"}')

        def _on_exit():
            print('[Tray] 收到退出请求，正在关闭...')
            try:
                state._cdp.stop()
            except Exception as _e:
                print(f'[WARN] {type(_e).__name__}: {_e}')
            # 请求 pywebview 窗口真正退出（而不是隐藏到托盘）
            try:
                if win is not None:
                    win.request_exit()
                else:
                    from webview_window import close as _close_wv
                    _close_wv()
            except Exception as _e:
                print(f'[WARN] {type(_e).__name__}: {_e}')

        tray = TrayManager(
            on_open=_on_open,
            on_quick_collect=_on_quick_collect,
            on_full_collect=_on_full_collect,
            on_toggle_pause=_on_toggle_pause,
            on_exit=_on_exit,
        )
        start_status_poller(tray)
        _start_update_prompt_daemon(tray)
        _tray_available = True
        print('[Main] 系统托盘已启动（后台线程）')
        # v4.0: 托盘在后台线程运行，主线程留给 pywebview
        tray_thread = threading.Thread(target=tray.run, daemon=True)
        tray_thread.start()

    except ImportError as _tray_err:
        print(f'[Main] 系统托盘不可用 ({_tray_err})')

    # Start the UI with the native pywebview window only.
    try:
        from webview_window import WebViewWindow
        win = WebViewWindow(url=APP_URL, title='披星云伴侣', width=1100, height=700)
        print(f'[Main] Starting native window: {APP_URL}')
        win.show()
    except Exception as exc:
        print(f'[Main] pywebview native window failed ({exc})')
        _show_native_window_notice('披星云伴侣原生窗口启动失败，请从官网下载最新版安装包并重新安装。')

    # ── 6. 窗口关闭后的清理 ──
    print('[Main] 正在关闭...')
    try:
        state._cdp.stop()
    except Exception as _e:
        print(f'[WARN] {type(_e).__name__}: {_e}')
    print('[Main] 已退出')
