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

import asyncio, json, os, re, sys, tempfile, threading, time, uuid, base64, hashlib, shutil, subprocess
from pathlib import Path
from queue import Queue, Empty
from flask import Flask, request, jsonify, Response, make_response, send_from_directory
from pixing_worker import start_worker, stop_worker, get_status as get_worker_status
from chrome_cdp import ChromeCDP
from douyin_api_collector import collect_douyin_data

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception as _e:
    print(f'[WARN] {type(_e).__name__}: {_e}')

# ── Modular imports ──
import companion_state as state
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
)
from companion_auth import _login_with_saved_credentials, _check_and_refresh_token, _start_token_refresh_daemon
from companion_collector import (
    _run_collection_once, _data_collector_loop, _get_collection_interval,
    _schedule_next_collection, _record_scan_time, _get_cookie_status,
)
from companion_metrics import _scrape_all, _sanitize_text, _parse_metric_num
from companion_login_worker import _make_login_worker

# UI HTML (from companion_clean_ui)
try:
    from companion_clean_ui import UI_HTML as UI_HTML
except Exception as _ui_error:
    print(f'[UI] clean ui unavailable: {_ui_error}', flush=True)

# Flask app
app = Flask(__name__, static_folder=state.STATIC_DIR)

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
        <div class="field"><label>邮箱</label><input v-model="loginEmail" placeholder="输入邮箱" @keyup.enter="doLogin"></div>
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
          <button class="btn btn-primary" @click="selectPlatform(selected)">弢�始绑�?/button>
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
        <p style="color:var(--text2);font-size:13px">正在上传 Cookie 到服务器...</p>
      </div>

      <!-- Done -->
      <div class="scan-card" v-if="status==='done'">
        <div class="result-ok success">&#10003;</div>
        <p class="result-msg" style="font-weight:600">绑定成功</p>
        <p class="result-sub">刷新 MatrixFlow 网页即可看到新账�?/p>
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
  selected:'',status:'idle',qrUrl:'',errorMsg:'',siteConnected:false,evtSource:null,progress:0,timer:null,platformFromUrl:'',tokenFromUrl:'',apiFromUrl:'',sessionId:'',
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
  async triggerCollect(mode='quick'){
    if(mode==='full'&&!confirm('全量采集会慢很多，确定现在开始？'))return;
    this.collecting=true;
    try{
      await fetch('/api/data-collection/trigger',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode, max_posts: mode==='full'?0:20})});
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
    try{const r=await fetch('/api/config');const j=await r.json();this.configured=j.configured;if(j.saved_email){this.loginEmail=j.saved_email;this.rememberPwd=true}}catch(e){this.configured=false}
  },
  async tryAutoLogin(){
    try{const r=await fetch('/api/auto-login',{method:'POST'});const j=await r.json();if(j.configured){this.configured=true}}catch(e){}
  },
  async doLogin(){
    if(!this.loginEmail||!this.loginPass){this.loginError='请输入邮箱和密码';return}
    this.loginLoading=true;this.loginError=''
    try{
      const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:this.loginEmail,password:this.loginPass,remember:this.rememberPwd})})
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
    const url=`/api/scan-bind/trigger?platform=${this.selected}&token=${encodeURIComponent(token)}&api_url=${encodeURIComponent(apiUrl)}`
    fetch(url).then(r=>r.json()).then(j=>{
      if(j.code===0){
        this.sessionId=j.session_id
        this.status='browser'
        this.progress=50
        clearInterval(this.timer)
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
  reset(){this.evtSource?.close();clearInterval(this.timer);this.status='idle';this.qrUrl='';this.errorMsg='';this.selected='';this.progress=0},
confirmLogin(){
  console.log('[UI] confirmLogin called, sessionId='+this.sessionId)
  if(!this.sessionId){this.errorMsg='会话丢失，请重试';this.status='error';return}
  this.status='uploading'
  const sid=this.sessionId
  fetch('/api/confirm-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sid})}).then(r=>r.json()).then(j=>{
    console.log('[UI] confirm-login response:',JSON.stringify(j))
    if(j.code!==0){this.status='error';this.errorMsg='操作失败: '+j.msg;return}
    let attempts=0
    const poll=setInterval(()=>{
      fetch('/api/scan-bind/poll/'+sid).then(r=>r.json()).then(s=>{
        attempts++
        if(s.status==='done'){this.status='done';this.progress=100;clearInterval(poll)}
        else if(s.status==='error'){this.status='error';this.errorMsg=s.msg||'上传失败，请重试';clearInterval(poll)}
        else if(attempts>30){this.status='done';this.progress=100;clearInterval(poll)}
      }).catch(()=>{if(attempts>30){this.status='done';this.progress=100;clearInterval(poll)}})
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


# ══════════════════════════════════════════════════════════════════
    state._CONFIG_CACHE = cfg


def _find_doudian_store(local_id: str) -> dict | None:
    for store in _get_doudian_stores():
        if store.get('id') == local_id:
            return store
    return None


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
    token = cfg.get('token') or _login_with_saved_credentials(cfg)
    return api_url, token


def _run_doudian_store_sync(local_id: str, api_url: str | None = None, token: str | None = None) -> dict:
    store = _find_doudian_store(local_id)
    if not store:
        raise RuntimeError('Local Doudian store not found')
    if not store.get('cloud_store_id'):
        raise RuntimeError('Doudian cloud store binding is missing')

    cfg = _load_config()
    api_url = (api_url or cfg.get('api_url') or 'https://ddddkiii.com/api/v1').rstrip('/')
    token = token or cfg.get('token') or ''

    from doudian_store_collector import collect_store, run_async, upload_store_data

    captured = run_async(collect_store(store.get('profile_id') or local_id, state._BROWSER_PATH, state._BROWSER_CHANNEL))
    store_name = captured.get('storeName') or store.get('name')
    upload_payload = {
        'storeName': store_name,
        'localProfileId': store.get('profile_id') or local_id,
        'orders': captured.get('orders'),
        'products': captured.get('products'),
        'aftersales': captured.get('aftersales'),
    }
    try:
        result = upload_store_data(api_url, token, store.get('cloud_store_id'), upload_payload)
    except Exception as upload_error:
        response = getattr(upload_error, 'response', None)
        if getattr(response, 'status_code', None) != 401:
            raise
        fresh_token = _login_with_saved_credentials(_load_config())
        if not fresh_token:
            raise
        result = upload_store_data(api_url, fresh_token, store.get('cloud_store_id'), upload_payload)

    stores = _get_doudian_stores()
    now_text = time.strftime('%Y-%m-%d %H:%M:%S')
    for item in stores:
        if item.get('id') == local_id:
            if store_name:
                item['name'] = store_name
            item['last_synced_at'] = now_text
            item['last_error'] = ''
            break
    _save_doudian_stores(stores)
    return {
        **(result or {}),
        'storeName': store_name,
        'syncedAt': now_text,
    }


def _run_doudian_scheduled_collection():
    
    if not state._doudian_sync_lock.acquire(blocking=False):
        print('[Doudian] Scheduled sync skipped: sync already running')
        return
    try:
        stores = [
            store
            for store in _get_doudian_stores()
            if store.get('cloud_store_id')
        ]
        if not stores:
            state._doudian_last_error = None
            print('[Doudian] Scheduled sync skipped: no stores')
            return
        for index, store in enumerate(stores):
            local_id = store.get('id')
            if not local_id:
                continue
            try:
                result = _run_doudian_store_sync(local_id)
                state._doudian_last_run = time.strftime('%Y-%m-%d %H:%M:%S')
                state._doudian_last_error = None
                print(f'[Doudian] Scheduled sync ok: {local_id} {result}')
            except Exception as e:
                msg = str(e)[:500]
                state._doudian_last_error = msg
                current = _get_doudian_stores()
                for item in current:
                    if item.get('id') == local_id:
                        item['last_error'] = msg
                        break
                _save_doudian_stores(current)
                print(f'[Doudian] Scheduled sync failed: {local_id} {msg}')
            if index < len(stores) - 1:
                time.sleep(30)
    finally:
        state._doudian_sync_lock.release()


def _doudian_scheduler_loop():
    if state._doudian_next_run_at is None:
        _schedule_next_doudian_collection()
    while True:
        wait_seconds = (state._doudian_next_run_at or 0) - time.time()
        if wait_seconds > 0:
            time.sleep(min(10, max(1, wait_seconds)))
            continue
        _run_doudian_scheduled_collection()
        interval = _schedule_next_doudian_collection()
        print(f'[Doudian] Next scheduled sync in {interval // 60} min')


def _ensure_doudian_scheduler_started():
    
    with state._doudian_scheduler_lock:
        if state._doudian_scheduler_started:
            return
        state._doudian_scheduler_started = True
        _schedule_next_doudian_collection(120)
        threading.Thread(target=_doudian_scheduler_loop, daemon=True).start()


# ══════════════════════════════════════════════════════════════════
# Config endpoints (data collector)
# ══════════════════════════════════════════════════════════════════

@app.route('/api/login', methods=['POST'])
def handle_login():
    import requests as req
    data = request.get_json() or {}
    email = data.get('email', '')
    password = data.get('password', '')
    remember = data.get('remember', False)
    if not email or not password:
        return jsonify({'error': '邮箱和密码不能为空'})
    cfg = _load_config()
    api_url = cfg.get('api_url', 'https://ddddkiii.com/api/v1')
    try:
        r = req.post(f'{api_url}/auth/login', json={'email': email, 'password': password}, timeout=15)
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
                    cfg['saved_email'] = email
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
        msg = '邮箱或密码错误'
        try:
            body = r.json()
            msg = body.get('message') or msg
        except Exception: pass
        return jsonify({'error': msg})
    except Exception as e:
        return jsonify({'error': f'无法连接服务�? {str(e)[:80]}'})

@app.route('/api/get-token')
def get_token():
    cfg = _load_config()
    return jsonify({'token': cfg.get('token', ''), 'api_url': cfg.get('api_url', '')})

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

    # 3) Fallback: try saved email+password
    email = cfg.get('saved_email', '')
    password = cfg.get('saved_password', '')
    if email and password:
        if _HAS_CRYPTO and ':' in password:
            try:
                key = _get_encryption_key()
                password = _decrypt_password(password, key)
            except Exception as _e:
                print(f'[WARN] {type(_e).__name__}: {_e}')
        try:
            r = req.post(f'{api_url}/auth/login', json={'email': email, 'password': password}, timeout=15)
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
    safe['configured'] = bool(state._CONFIG_CACHE.get('token'))
    safe['app_version'] = APP_VERSION
    safe['update_manifest_url'] = _get_update_manifest_url()
    return jsonify(safe)


@app.route('/api/data-collection/status')
def data_collection_status():
    cookie_status = _get_cookie_status()
    now = time.time()
    countdown = None
    next_run_at_text = None
    if state._collector_next_run_at:
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
    return jsonify({
        'running': state._collector_running,
        'configured': bool(state._CONFIG_CACHE.get('api_url')),
        'last_run': state._collector_last_run,
        'last_error': state._collector_last_error,
        'cookies_age_hours': cookie_status,
        'progress': state._collector_progress,
        'schedule': {
            'started': state._collector_loop_started,
            'mode': state._collector_schedule_mode,
            'max_posts': state._collector_schedule_max_posts,
            'interval_seconds': state._collector_schedule_interval,
            'next_run_at': next_run_at_text,
            'countdown_seconds': countdown,
            'last_success': last_success,
            'recent_runs': recent_runs,
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
    
    # Start the scheduler loop if not already running
    with state._collector_loop_lock:
        if not state._collector_loop_started:
            state._collector_loop_started = True
            _schedule_next_collection()
            threading.Thread(target=_data_collector_loop, daemon=True).start()
    if state._collector_running:
        return jsonify({'status': 'already_running'})
    body = request.get_json(silent=True) or {}
    mode = 'full'
    max_posts = 0
    # 立即执行丢�次采�?
    t = threading.Thread(target=_run_collection_once, args=(max_posts, mode, 'manual'), daemon=True)
    t.start()
    return jsonify({
        'status': 'started',
        'mode': mode,
        'max_posts': max_posts,
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
    from local_db import get_all_accounts, get_profile_path
    accounts = get_all_accounts(include_expired=True)
    now = time.time()
    for acc in accounts:
        profile = get_profile_path(acc.get('id', ''))
        refreshed_at = 0
        profile_persisted = False
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
                    state = json.loads(state_json.read_text('utf-8'))
                    cookie_count = len(state.get('cookies', []))
                    # WECHAT_VIDEO needs at least sessionid + wxuin + compass_token
                    has_enough_cookies = cookie_count >= 3
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
        acc['needs_rescan'] = bool(acc.get('status') == 'expired' and not has_recent_full_profile)
    return jsonify({'code': 0, 'data': accounts})


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
    resp = make_response(jsonify({'status':'ok','version':APP_VERSION,'platforms':list(PLATFORMS.keys())}))
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
        manifest_url = _get_update_manifest_url()
        manifest = _fetch_update_manifest()
        latest_version = str(manifest.get('version') or '').strip()
        package_url = _resolve_update_url(manifest_url, manifest.get('url') or manifest.get('package_url') or '')
        available = bool(latest_version and _is_newer_version(latest_version))
        latest = {
            'version': latest_version,
            'notes': manifest.get('notes') or '',
            'mandatory': bool(manifest.get('mandatory')),
            'published_at': manifest.get('published_at') or '',
            'sha256_set': bool(manifest.get('sha256')),
        }
        return jsonify({
            'code': 0,
            'current_version': APP_VERSION,
            'available': available,
            'latest': latest,
            'package_url_set': bool(package_url),
            'manifest_url': manifest_url,
        })
    except Exception as exc:
        return jsonify({
            'code': 1,
            'current_version': APP_VERSION,
            'available': False,
            'error': str(exc),
            'manifest_url': _get_update_manifest_url(),
        }), 200


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

        package_url = _resolve_update_url(manifest_url, manifest.get('url') or manifest.get('package_url') or '')
        if not package_url:
            return jsonify({'code': 400, 'msg': 'update package url is missing'}), 400

        zip_path = _download_update_package(package_url, str(manifest.get('sha256') or ''))
        log_path = _start_update_process(zip_path)
        return jsonify({
            'code': 0,
            'msg': 'update_started',
            'current_version': APP_VERSION,
            'target_version': latest_version,
            'log_path': str(log_path),
        })
    except Exception as exc:
        return jsonify({'code': 1, 'msg': str(exc), 'current_version': APP_VERSION}), 500


@app.route('/api/confirm-login', methods=['POST'])
def confirm_login():
    sid = request.json.get('session_id', '') if request.is_json else request.args.get('session_id', '')
    print(f'[ConfirmLogin] sid={sid} in_sessions={sid in state.active_sessions} total_sessions={len(state.active_sessions)}', flush=True)
    if sid in state.active_sessions:
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
    if sid in state.active_sessions:
        state.active_sessions[sid].put('CANCEL')
        state.scan_errors.pop(sid, None)
        return jsonify({'code':0,'msg':'ok'})
    return jsonify({'code':404,'msg':'session not found'}), 404


@app.route('/api/scan-bind/trigger')
def scan_bind_trigger():
    # Trigger scan binding and return JSON.
    platform = request.args.get('platform', '').strip()
    token = request.args.get('token', '')
    api_url = request.args.get('api_url', '')

    if not platform or not token or not api_url:
        return jsonify({'code':400,'msg':'缺少参数（platform/token/api_url）'}), 400
    if platform not in PLATFORMS:
        return jsonify({'code':400,'msg':f'不支持的平台: {platform}'}), 400
    info = PLATFORMS[platform]
    session_id = uuid.uuid4().hex[:12]
    queue = Queue()
    state.active_sessions[session_id] = queue
    state.scan_status[session_id] = 'browser'
    state.scan_errors.pop(session_id, None)

    worker = _make_login_worker(platform, info, queue, queue, api_url, token, use_sse=False, session_id=session_id)
    t = threading.Thread(target=worker, daemon=True)
    t.start()

    resp = make_response(jsonify({'code':0,'session_id':session_id,'msg':'扫码窗口已打开，请在浏览器中完成登录'}))
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


@app.route('/api/scan-bind/start')
def scan_bind_start():
    # Start scan binding with SSE progress.
    platform = request.args.get('platform', '').strip()
    token = request.args.get('token', '')
    api_url = request.args.get('api_url', '')

    if not platform or not token or not api_url:
        return jsonify({'code':400,'msg':'缺少参数（platform/token/api_url）'}), 400
    if platform not in PLATFORMS:
        return jsonify({'code':400,'msg':f'不支持的平台: {platform}'}), 400

    info = PLATFORMS[platform]
    session_id = uuid.uuid4().hex[:12]
    queue = Queue()       # SSE events: worker �?UI
    ctrl_queue = Queue()  # control messages: UI �?worker
    state.active_sessions[session_id] = ctrl_queue  # confirm_login puts to ctrl_queue
    state.scan_status[session_id] = 'browser'
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

    resp = Response(sse_stream(), mimetype='text/event-stream',
                    headers={'Cache-Control':'no-cache','X-Accel-Buffering':'no',
                             'Access-Control-Allow-Origin':'*'})
    @resp.call_on_close
    def cleanup():
        state.active_sessions.pop(session_id, None)
    return resp


@app.route('/api/doudian/stores', methods=['GET', 'POST', 'OPTIONS'])
def doudian_stores():
    if request.method == 'OPTIONS':
        return jsonify({'code': 0})
    if request.method == 'GET':
        return jsonify({'code': 0, 'data': _get_doudian_stores()})

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

    def _worker():
        try:
            from doudian_store_collector import open_login_window, run_async
            run_async(open_login_window(store.get('profile_id') or local_id, state._BROWSER_PATH, state._BROWSER_CHANNEL))
        except Exception as e:
            print(f'[Doudian] login window error: {e}', flush=True)

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
        return jsonify({'code': 404, 'msg': '本地抖店店铺不存在'}), 404

    body = request.get_json(silent=True) or {}
    api_url, token = _resolve_companion_auth(body)

    job_id = uuid.uuid4().hex[:12]
    state.doudian_jobs[job_id] = {
        'status': 'running',
        'store_id': local_id,
        'store_name': store.get('name'),
        'started_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'message': '采集中',
    }

    def _worker():
        try:
            with state._doudian_sync_lock:
                result = _run_doudian_store_sync(local_id, api_url, token)
            state.doudian_jobs[job_id].update({
                'status': 'success',
                'message': '同步完成',
                'finished_at': time.strftime('%Y-%m-%d %H:%M:%S'),
                'result': result,
            })
        except Exception as e:
            msg = str(e)[:500]
            stores = _get_doudian_stores()
            for item in stores:
                if item.get('id') == local_id:
                    item['last_error'] = msg
                    break
            _save_doudian_stores(stores)
            state.doudian_jobs[job_id].update({
                'status': 'error',
                'message': msg,
                'finished_at': time.strftime('%Y-%m-%d %H:%M:%S'),
            })

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({'code': 0, 'job_id': job_id, 'msg': '抖店同步已开始'})


@app.route('/api/doudian/jobs/<job_id>')
def doudian_job_status(job_id):
    job = state.doudian_jobs.get(job_id)
    if not job:
        return jsonify({'code': 404, 'msg': '任务不存在'}), 404
    return jsonify({'code': 0, 'data': job})


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
            'error': str(store.get('last_error') or '').strip(),
        }
        for store in stores
        if str(store.get('last_error') or '').strip()
    ]
    last_error = state._doudian_last_error or (store_errors[-1]['error'] if store_errors else None)
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
        },
    })


# ══════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════
if __name__ == '__main__':
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
    _ensure_doudian_scheduler_started()

    # ── 2. 主动 Token 刷新 ──
    print('[Main] 启动 Token 刷新守护线程...')
    _start_token_refresh_daemon()

    # ── 3. 启动定时采集 ──
    if _load_config().get('auto_collect_on_start') is True:
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
        with state._collector_loop_lock:
            if not state._collector_loop_started:
                state._collector_loop_started = True
                _schedule_next_collection()
                threading.Thread(target=_data_collector_loop, daemon=True).start()
        print('[Main] Background collector countdown started')

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
                    # pywebview 窗口不可用，回退到系统浏览器
                    print('[Tray] pywebview 窗口不可用，回退到系统浏览器')
                    import webbrowser
                    webbrowser.open(APP_URL)
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
        _tray_available = True
        print('[Main] 系统托盘已启动（后台线程）')
        # v4.0: 托盘在后台线程运行，主线程留给 pywebview
        tray_thread = threading.Thread(target=tray.run, daemon=True)
        tray_thread.start()

    except ImportError as _tray_err:
        print(f'[Main] 系统托盘不可用 ({_tray_err})')

    # ── 5. 启动 pywebview 原生窗口（主线程，阻塞）──
    try:
        from webview_window import WebViewWindow
        win = WebViewWindow(url=APP_URL, title='披星云伴侣', width=1100, height=700)
        print(f'[Main] 启动原生窗口: {APP_URL}')
        win.show()  # 阻塞直到窗口真正关闭（X 按钮只隐藏到托盘）
    except ImportError:
        print('[Main] pywebview 不可用，回退到系统浏览器')
        import webbrowser
        webbrowser.open(APP_URL)
        # 无窗口模式下，等待 Ctrl+C 或托盘退出
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass

    # ── 6. 窗口关闭后的清理 ──
    print('[Main] 正在关闭...')
    try:
        state._cdp.stop()
    except Exception as _e:
        print(f'[WARN] {type(_e).__name__}: {_e}')
    print('[Main] 已退出')
