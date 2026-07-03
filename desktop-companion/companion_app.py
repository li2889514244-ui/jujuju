"""
披星云桌面伴�?v2.4 �?�?UI 界面，一键扫�?+ 自动数据采集
用法: python companion_app.py
"""
import asyncio, json, os, re, sys, tempfile, threading, time, uuid, base64, hashlib, shutil, subprocess
from pathlib import Path
from queue import Queue, Empty
from flask import Flask, request, jsonify, Response, make_response, send_from_directory
from pixing_worker import start_worker, stop_worker, get_status as get_worker_status
from chrome_cdp import ChromeCDP
from douyin_api_collector import collect_douyin_data

APP_VERSION = '3.2.0'
DEFAULT_UPDATE_MANIFEST_URL = 'https://ddddkiii.com/companion-updates/latest.json'

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# ┢�┢� AES-256-GCM encryption helpers ┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    _HAS_CRYPTO = True
except ImportError:
    _HAS_CRYPTO = False


def _get_encryption_key() -> bytes:
    """Retrieve the AES-256 encryption key (32 bytes) from env or config file."""
    from conf import ENCRYPTION_KEY as CONF_KEY
    key_str = CONF_KEY
    if not key_str:
        # Fallback: try reading _key from companion_config.json directly
        try:
            config_path = BASE_DIR / 'companion_config.json'
            if config_path.exists():
                cfg = json.loads(config_path.read_text(encoding='utf-8'))
                key_str = cfg.get('_key', '')
        except Exception:
            pass
    if not key_str:
        raise RuntimeError("ENCRYPTION_KEY not set. Ensure launcher.py has been run at least once.")
    # key_str is a base64-encoded 32-byte key
    return base64.b64decode(key_str)


def _encrypt_password(plaintext: str, key: bytes) -> str:
    """Encrypt password using AES-256-GCM. Returns 'nonce_b64:ciphertext_b64'."""
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)
    return base64.b64encode(nonce).decode('ascii') + ':' + base64.b64encode(ct).decode('ascii')


def _decrypt_password(ciphertext: str, key: bytes) -> str:
    """Decrypt password encrypted with AES-256-GCM. Input format: 'nonce_b64:ciphertext_b64'."""
    nonce_b64, ct_b64 = ciphertext.split(':', 1)
    aesgcm = AESGCM(key)
    pt = aesgcm.decrypt(base64.b64decode(nonce_b64), base64.b64decode(ct_b64), None)
    return pt.decode('utf-8')

# Use EXE directory or script directory for persistent config
try:
    from companion_clean_ui import UI_HTML as UI_HTML
except Exception as _ui_error:
    print(f'[UI] clean ui unavailable: {_ui_error}', flush=True)

if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent.resolve()
    STATIC_DIR = str(BASE_DIR / '_internal' / 'static')
else:
    BASE_DIR = Path(__file__).parent.resolve()
    STATIC_DIR = 'static'
app = Flask(__name__, static_folder=STATIC_DIR)


@app.after_request
def _add_cors_headers(resp):
    resp.headers.setdefault('Access-Control-Allow-Origin', '*')
    resp.headers.setdefault('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    resp.headers.setdefault('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    resp.headers.setdefault('Access-Control-Allow-Private-Network', 'true')
    return resp

# ┢�┢� 平台配置 ┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�
PLATFORMS = {
    'douyin': {'name': '����', 'url': 'https://creator.douyin.com/', 'key': 'DOUYIN'},
    'xiaohongshu': {'name': 'С����', 'url': 'https://creator.xiaohongshu.com/', 'key': 'XIAOHONGSHU'},
    'kuaishou': {'name': '����', 'url': 'https://cp.kuaishou.com/', 'key': 'KUAISHOU'},
    'tencent': {'name': '��Ƶ��', 'url': 'https://channels.weixin.qq.com/', 'key': 'WECHAT_VIDEO'},
}

# ┢�┢� 浏览器检�?┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�
def _find_browser():
    """棢�测可用浏览器，返�?(executable_path, channel) �?(None, channel_name)"""
    CHROMIUM_DIR = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'MatrixFlow' / 'chromium'
    CHROMIUM_EXE = CHROMIUM_DIR / 'chrome.exe'

    # 1. Our custom Chromium
    if CHROMIUM_EXE.exists():
        print(f'[Browser] 使用独立 Chromium: {CHROMIUM_EXE}')
        return (str(CHROMIUM_EXE), None)

    # 2. System Chrome
    for p in [
        os.environ.get('PROGRAMFILES', 'C:\\Program Files') + '\\Google\\Chrome\\Application\\chrome.exe',
        os.environ.get('ProgramFiles(x86)', 'C:\\Program Files (x86)') + '\\Google\\Chrome\\Application\\chrome.exe',
        os.environ.get('LOCALAPPDATA', '') + '\\Google\\Chrome\\Application\\chrome.exe',
    ]:
        if os.path.exists(p):
            print(f'[Browser] 使用系统 Chrome: {p}')
            return (p, None)

    # 3. System Edge
    for p in [
        os.environ.get('PROGRAMFILES', 'C:\\Program Files') + '\\Microsoft\\Edge\\Application\\msedge.exe',
        os.environ.get('ProgramFiles(x86)', 'C:\\Program Files (x86)') + '\\Microsoft\\Edge\\Application\\msedge.exe',
    ]:
        if os.path.exists(p):
            print(f'[Browser] 使用系统 Edge: {p}')
            return (p, None)

    # 4. Fallback: let Playwright find its own channel
    print('[Browser] 未检测到本地浏览器，尝试 Playwright channel...')
    return (None, 'chrome')


_BROWSER_PATH, _BROWSER_CHANNEL = _find_browser()
print(f'[Browser] path={_BROWSER_PATH} channel={_BROWSER_CHANNEL}')

# ┢�┢� CDP 模式 Chrome 实例 ┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�
_CDP_PORT = 9222
_cdp = ChromeCDP(port=_CDP_PORT, chrome_path=_BROWSER_PATH)
_CDP_URL = _cdp.get_url()


def _launch_browser_opts(headless: bool, extra_args: list = None) -> dict:
    """Return kwargs for chromium.launch based on detected browser"""
    args = ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--lang=zh-CN']
    if extra_args:
        args.extend(extra_args)
    opts = {'headless': headless, 'args': args}
    if _BROWSER_PATH:
        opts['executable_path'] = _BROWSER_PATH
    elif _BROWSER_CHANNEL:
        opts['channel'] = _BROWSER_CHANNEL
    return opts


# ┢�┢� 持久化浏览器 Profile ┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�┢�
_PROFILE_ROOT = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'MatrixFlow' / 'browser-profiles'


async def _get_persistent_context(headless: bool = True, extra_args: list = None) -> tuple:
    """返回 (context, page) �?使用持久�?profile，抖音不再每次跳验证"""
    _PROFILE_ROOT.mkdir(parents=True, exist_ok=True)
    profile_dir = _PROFILE_ROOT / 'default'

    args = ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--lang=zh-CN']
    if extra_args:
        args.extend(extra_args)

    kwargs = {
        'headless': headless,
        'args': args,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'locale': 'zh-CN',
        'viewport': {'width': 1280, 'height': 800},
    }
    if _BROWSER_PATH:
        kwargs['executable_path'] = _BROWSER_PATH
    elif _BROWSER_CHANNEL:
        kwargs['channel'] = _BROWSER_CHANNEL

    context = await pw.chromium.launch_persistent_context(str(profile_dir), **kwargs)
    return context

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
# Config persistence (for data collector)
# When running as frozen EXE, check source dir (parent of dist) for
# existing config so saved credentials aren't lost after repackaging.
# ══════════════════════════════════════════════════════════════════
if getattr(sys, 'frozen', False):
    _exe_dir = Path(sys.executable).parent
    _config_candidate = _exe_dir / 'companion_config.json'
    if not _config_candidate.exists():
        _src_dir = _exe_dir.parent  # dist/pixingyun-mate/ -> desktop-companion/
        _src_config = _src_dir / 'companion_config.json'
        if _src_config.exists():
            _config_candidate.parent.mkdir(parents=True, exist_ok=True)
            import shutil
            shutil.copy2(str(_src_config), str(_config_candidate))
    CONFIG_FILE = _config_candidate
else:
    CONFIG_FILE = BASE_DIR / 'companion_config.json'


def _load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            cfg = json.loads(CONFIG_FILE.read_text(encoding='utf-8-sig'))
            # Decrypt saved_password if encrypted (format: nonce:ciphertext)
            if cfg.get('saved_password') and ':' in cfg['saved_password'] and _HAS_CRYPTO:
                try:
                    key = _get_encryption_key()
                    cfg['saved_password'] = _decrypt_password(cfg['saved_password'], key)
                except Exception:
                    pass  # Legacy plaintext or wrong key �?keep as-is
            return cfg
        except Exception:
            pass
    # 首次启动：生成默认配置（不会覆盖已有配置，升级安全）
    default = {
        'api_url': 'https://ddddkiii.com/api/v1',
        'token': '',
        'update_manifest_url': DEFAULT_UPDATE_MANIFEST_URL,
    }
    if not CONFIG_FILE.exists():
        _save_config(default)
    return default


def _save_config(cfg: dict):
    # Encrypt sensitive fields before writing to disk
    safe_cfg = dict(cfg)
    if safe_cfg.get('saved_password') and ':' not in safe_cfg['saved_password'] and _HAS_CRYPTO:
        try:
            key = _get_encryption_key()
            safe_cfg['saved_password'] = _encrypt_password(safe_cfg['saved_password'], key)
        except Exception:
            pass  # Can't encrypt �?save plaintext as last resort
    CONFIG_FILE.write_text(json.dumps(safe_cfg, ensure_ascii=False, indent=2),
                           encoding='utf-8')


_CONFIG_CACHE = _load_config()


def _parse_version_parts(value: str):
    return [int(part) for part in re.findall(r'\d+', str(value or ''))]


def _is_newer_version(remote_version: str, current_version: str = APP_VERSION) -> bool:
    remote = _parse_version_parts(remote_version)
    current = _parse_version_parts(current_version)
    size = max(len(remote), len(current), 1)
    remote += [0] * (size - len(remote))
    current += [0] * (size - len(current))
    return remote > current


def _get_update_manifest_url() -> str:
    return str(_CONFIG_CACHE.get('update_manifest_url') or DEFAULT_UPDATE_MANIFEST_URL).strip()


def _resolve_update_url(manifest_url: str, package_url: str) -> str:
    import urllib.parse
    return urllib.parse.urljoin(manifest_url, str(package_url or '').strip())


def _fetch_update_manifest() -> dict:
    import urllib.request

    manifest_url = _get_update_manifest_url()
    if not manifest_url:
        raise RuntimeError('update manifest url is empty')
    req = urllib.request.Request(
        manifest_url,
        headers={
            'Accept': 'application/json',
            'User-Agent': f'pixingyun-mate/{APP_VERSION}',
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read(1024 * 1024)
    manifest = json.loads(raw.decode('utf-8-sig'))
    if not isinstance(manifest, dict):
        raise RuntimeError('update manifest must be a json object')
    return manifest


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _download_update_package(package_url: str, expected_sha256: str) -> Path:
    import urllib.parse
    import urllib.request

    parsed = urllib.parse.urlparse(package_url)
    if parsed.scheme not in ('http', 'https'):
        raise RuntimeError('update package url must use http or https')
    expected_sha256 = (expected_sha256 or '').strip().lower()
    if not re.fullmatch(r'[0-9a-fA-F]{64}', expected_sha256):
        raise RuntimeError('update package sha256 is missing or invalid')

    download_dir = Path(tempfile.mkdtemp(prefix='pixingyun-update-download-'))
    zip_path = download_dir / 'update.zip'
    req = urllib.request.Request(
        package_url,
        headers={'User-Agent': f'pixingyun-mate/{APP_VERSION}'},
    )
    with urllib.request.urlopen(req, timeout=120) as resp, zip_path.open('wb') as fh:
        shutil.copyfileobj(resp, fh)
    actual_sha256 = _sha256_file(zip_path)
    if actual_sha256.lower() != expected_sha256:
        raise RuntimeError('update package sha256 mismatch')
    return zip_path


def _ps_quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _start_update_process(zip_path: Path) -> Path:
    if not getattr(sys, 'frozen', False):
        raise RuntimeError('self update is only available in the packaged app')

    app_dir = Path(sys.executable).resolve().parent
    exe_path = Path(sys.executable).resolve()
    work_dir = Path(tempfile.mkdtemp(prefix='pixingyun-update-'))
    stage_dir = work_dir / 'stage'
    log_path = work_dir / 'update.log'
    ps1_path = work_dir / 'apply_update.ps1'
    cmd_path = work_dir / 'apply_update.cmd'

    ps1_path.write_text(f"""$ErrorActionPreference = 'Stop'
$PidToWait = {os.getpid()}
$AppDir = {_ps_quote(str(app_dir))}
$ExePath = {_ps_quote(str(exe_path))}
$ZipPath = {_ps_quote(str(zip_path.resolve()))}
$StageDir = {_ps_quote(str(stage_dir))}
$LogPath = {_ps_quote(str(log_path))}

try {{
  Wait-Process -Id $PidToWait -Timeout 90 -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Remove-Item -LiteralPath $StageDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $StageDir -Force | Out-Null
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $StageDir -Force
  $Candidate = Get-ChildItem -LiteralPath $StageDir -Directory | Where-Object {{ Test-Path (Join-Path $_.FullName 'pixingyun-mate.exe') }} | Select-Object -First 1
  if ($Candidate) {{
    $SourceDir = $Candidate.FullName
  }} else {{
    $SourceDir = $StageDir
  }}
  Copy-Item -Path (Join-Path $SourceDir '*') -Destination $AppDir -Recurse -Force
  Start-Process -FilePath $ExePath -WindowStyle Hidden
}} catch {{
  $_ | Out-String | Add-Content -LiteralPath $LogPath
  exit 1
}}
""", encoding='utf-8')
    cmd_path.write_text(f'@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "{ps1_path}"\r\n', encoding='utf-8')

    creationflags = getattr(subprocess, 'CREATE_NO_WINDOW', 0) | getattr(subprocess, 'DETACHED_PROCESS', 0)
    subprocess.Popen(['cmd', '/c', str(cmd_path)], cwd=str(work_dir), creationflags=creationflags)

    def _exit_after_response():
        time.sleep(1.0)
        os._exit(0)

    threading.Thread(target=_exit_after_response, daemon=True).start()
    return log_path


def _login_with_saved_credentials(cfg: dict) -> str:
    """Return a fresh access token using saved credentials or refresh token."""
    import requests as req

    api_url = cfg.get('api_url', 'https://ddddkiii.com/api/v1').rstrip('/')
    if not api_url:
        return ''

    # ---- Path 1: email + password login ----
    email = cfg.get('saved_email', '')
    password = cfg.get('saved_password', '')
    if email and password:
        if _HAS_CRYPTO and ':' in password:
            try:
                key = _get_encryption_key()
                password = _decrypt_password(password, key)
            except Exception:
                pass
        try:
            r = req.post(f'{api_url}/auth/login', json={'email': email, 'password': password}, timeout=15)
            if r.status_code in (200, 201):
                body = r.json()
                inner = body.get('data') or body
                token = inner.get('accessToken') or inner.get('access_token') or ''
                refresh_token = inner.get('refreshToken') or inner.get('refresh_token') or ''
                if token:
                    cfg['token'] = token
                    if refresh_token: cfg['refreshToken'] = refresh_token
                    _save_config(cfg); _CONFIG_CACHE.update(cfg)
                    return token
            print(f'[Auth] Login failed: HTTP {r.status_code}')
        except Exception as e:
            print(f'[Auth] Login error: {str(e)[:120]}')

    # ---- Path 2: _from_token (static companion token) ----
    from_token = cfg.get('_from_token') or cfg.get('_from_token')
    if from_token:
        return from_token

    # ---- Path 3: refresh token -> /auth/refresh ----
    refresh_token = cfg.get('refreshToken') or cfg.get('refresh_token')
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
                    if new_refresh: cfg['refreshToken'] = new_refresh
                    _save_config(cfg); _CONFIG_CACHE.update(cfg)
                    print(f'[Auth] Token refreshed via refreshToken')
                    return new_token
            print(f'[Auth] Refresh failed: HTTP {r.status_code}')
        except Exception as e:
            print(f'[Auth] Refresh error: {str(e)[:120]}')

    # ---- Path 4: _pw (encrypted password) last resort ----
    pw = cfg.get('_pw')
    if pw and _HAS_CRYPTO and ':' in pw and email:
        try:
            key = _get_encryption_key()
            password = _decrypt_password(pw, key)
            r = req.post(f'{api_url}/auth/login', json={'email': email, 'password': password}, timeout=15)
            if r.status_code in (200, 201):
                body = r.json()
                inner = body.get('data') or body
                token = inner.get('accessToken') or inner.get('access_token') or ''
                rt = inner.get('refreshToken') or inner.get('refresh_token') or ''
                if token:
                    cfg['token'] = token
                    if rt: cfg['refreshToken'] = rt
                    _save_config(cfg); _CONFIG_CACHE.update(cfg)
                    return token
        except Exception as e:
            print(f'[Auth] _pw login error: {str(e)[:120]}')

    return ''

PLATFORM_DASHBOARDS = {
    'DOUYIN': {
        'url': 'https://creator.douyin.com',
        'domain': '.douyin.com',
        'data_center': 'https://creator.douyin.com/creator-micro/data/content',
        'video_list': 'https://creator.douyin.com/creator-micro/content/manage',
        'monetization': 'https://creator.douyin.com/creator-micro/revenue/monetize',
        'creator_center': 'https://creator.douyin.com/creator-micro/creation',  # 创作中心→发布管�?
        'works_manage': 'https://creator.douyin.com/creator-micro/content/manage?tab=work',  # 作品管理
        'extra_pages': [
            'https://creator.douyin.com/creator-micro/data/fans',      # 粉丝画像
            'https://creator.douyin.com/creator-micro/data/content',   # 内容数据
        ],
    },
    'KUAISHOU': {
        'url': 'https://cp.kuaishou.com',
        'domain': '.kuaishou.com',
        'data_center': 'https://cp.kuaishou.com/article/manage',
        'video_list': 'https://cp.kuaishou.com/article/publish/list',
    },
    'XIAOHONGSHU': {
        'url': 'https://creator.xiaohongshu.com',
        'domain': '.xiaohongshu.com',
        'data_center': 'https://creator.xiaohongshu.com/note-manage',
        'video_list': 'https://creator.xiaohongshu.com/note-manage/notes',
    },
    'BILIBILI': {
        'url': 'https://member.bilibili.com',
        'domain': '.bilibili.com',
        'data_center': 'https://member.bilibili.com/platform/upload/video',
        'video_list': 'https://member.bilibili.com/platform/content',
    },
    'WEIBO': {
        'url': 'https://weibo.com',
        'domain': '.weibo.com',
    },
    'WECHAT_VIDEO': {
        'url': 'https://channels.weixin.qq.com',
        'domain': '.weixin.qq.com',
        'data_center': 'https://channels.weixin.qq.com/platform/data-center',
        'video_list': 'https://channels.weixin.qq.com/platform/post/list',
        'monetization': 'https://channels.weixin.qq.com/platform/statistic/cargo/transcation',
    },
}

_collector_running = False
_collector_lock = threading.Lock()
_collector_last_run = None
_collector_last_error = None
_DEFAULT_QUICK_MAX_POSTS = 20
_collector_next_run_at = None
_collector_schedule_interval = None
_collector_schedule_mode = 'quick'
_collector_schedule_max_posts = _DEFAULT_QUICK_MAX_POSTS

# Progress tracking for UI
_collector_progress = {
    'total': 0, 'current': 0, 'nickname': '',
    'phase': '', 'video_page': 0, 'video_count': 0,
    'mode': 'quick', 'max_posts': _DEFAULT_QUICK_MAX_POSTS,
}

# Cookie freshness tracking
_COOKIE_AGE_WARN_HOURS = 23  # warn when > 23 hours
_COOKIE_AGE_EXPIRED_HOURS = 48  # consider expired > 48 hours


def _record_scan_time(platform_key: str):
    """Record last successful scan time for a platform"""
    cfg = _load_config()
    scans = cfg.get('last_scan_times', {})
    scans[platform_key] = time.time()
    cfg['last_scan_times'] = scans
    _save_config(cfg)
    global _CONFIG_CACHE
    _CONFIG_CACHE = cfg


def _get_cookie_status() -> dict:
    """Returns dict of platform -> hours since last scan"""
    cfg = _load_config()
    scans = cfg.get('last_scan_times', {})
    now = time.time()
    result = {}
    for platform_key in PLATFORMS:
        last = scans.get(platform_key, 0)
        hours = (now - last) / 3600 if last else 999
        result[platform_key] = round(hours, 1)
    return result


def _schedule_next_collection(delay_seconds: int | None = None) -> int:
    """Set the next scheduled quick collection timestamp and return delay seconds."""
    global _collector_next_run_at, _collector_schedule_interval
    interval = int(delay_seconds if delay_seconds is not None else _get_collection_interval())
    interval = max(5, interval)
    _collector_schedule_interval = interval
    _collector_next_run_at = time.time() + interval
    return interval


# ══════════════════════════════════════════════════════════════════
# Scan-bind session store
# ══════════════════════════════════════════════════════════════════
active_sessions = {}  # session_id -> queue
scan_status = {}  # session_id -> status (browser/uploading/done/error)
scan_errors = {}  # session_id -> last error message for polling UI
doudian_jobs = {}  # job_id -> status dict
_doudian_scheduler_started = False
_doudian_scheduler_lock = threading.Lock()
_doudian_sync_lock = threading.Lock()
_doudian_next_run_at = None
_doudian_schedule_interval = None
_doudian_last_run = None
_doudian_last_error = None


def _get_doudian_collection_interval() -> int:
    hour = time.localtime().tm_hour
    if 8 <= hour < 20:
        return 30 * 60
    return 2 * 60 * 60


def _schedule_next_doudian_collection(delay_seconds: int | None = None) -> int:
    global _doudian_next_run_at, _doudian_schedule_interval
    interval = int(delay_seconds if delay_seconds is not None else _get_doudian_collection_interval())
    interval = max(60, interval)
    _doudian_schedule_interval = interval
    _doudian_next_run_at = time.time() + interval
    return interval


def _get_doudian_stores() -> list:
    cfg = _load_config()
    stores = cfg.get('doudian_stores') or []
    return stores if isinstance(stores, list) else []


def _save_doudian_stores(stores: list):
    cfg = _load_config()
    cfg['doudian_stores'] = stores
    _save_config(cfg)
    global _CONFIG_CACHE
    _CONFIG_CACHE = cfg


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
        _CONFIG_CACHE.update(cfg)
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

    captured = run_async(collect_store(store.get('profile_id') or local_id))
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
    global _doudian_last_run, _doudian_last_error
    if not _doudian_sync_lock.acquire(blocking=False):
        print('[Doudian] Scheduled sync skipped: sync already running')
        return
    try:
        stores = [
            store
            for store in _get_doudian_stores()
            if store.get('cloud_store_id') and store.get('last_synced_at')
        ]
        if not stores:
            _doudian_last_error = None
            print('[Doudian] Scheduled sync skipped: no stores')
            return
        for index, store in enumerate(stores):
            local_id = store.get('id')
            if not local_id:
                continue
            try:
                result = _run_doudian_store_sync(local_id)
                _doudian_last_run = time.strftime('%Y-%m-%d %H:%M:%S')
                _doudian_last_error = None
                print(f'[Doudian] Scheduled sync ok: {local_id} {result}')
            except Exception as e:
                msg = str(e)[:500]
                _doudian_last_error = msg
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
        _doudian_sync_lock.release()


def _doudian_scheduler_loop():
    if _doudian_next_run_at is None:
        _schedule_next_doudian_collection()
    while True:
        wait_seconds = (_doudian_next_run_at or 0) - time.time()
        if wait_seconds > 0:
            time.sleep(min(10, max(1, wait_seconds)))
            continue
        _run_doudian_scheduled_collection()
        interval = _schedule_next_doudian_collection()
        print(f'[Doudian] Next scheduled sync in {interval // 60} min')


def _ensure_doudian_scheduler_started():
    global _doudian_scheduler_started
    with _doudian_scheduler_lock:
        if _doudian_scheduler_started:
            return
        _doudian_scheduler_started = True
        _schedule_next_doudian_collection()
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
                _CONFIG_CACHE.update(cfg)
                # 自动启动数字人视�?worker
                try: start_worker()
                except Exception: pass
                return jsonify({'status': 'ok', 'message': '登录成功'})
        msg = '邮箱或密码错误'
        try:
            body = r.json()
            msg = body.get('message') or msg
        except: pass
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
        except Exception:
            pass  # Can't decode, try refresh anyway

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
                    _CONFIG_CACHE.update(cfg)
                    return jsonify({'configured': True, 'message': 'Refresh Token 自动登录成功'})
        except Exception:
            pass

    # 3) Fallback: try saved email+password
    email = cfg.get('saved_email', '')
    password = cfg.get('saved_password', '')
    if email and password:
        if _HAS_CRYPTO and ':' in password:
            try:
                key = _get_encryption_key()
                password = _decrypt_password(password, key)
            except Exception:
                pass
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
                    _CONFIG_CACHE.update(cfg)
                    return jsonify({'configured': True, 'message': '密码自动登录成功'})
        except Exception:
            pass

    return jsonify({'configured': False})

@app.route('/api/config', methods=['GET', 'POST'])
def handle_config():
    global _CONFIG_CACHE
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        cfg = _load_config()
        for key in ('api_url', 'token', 'update_manifest_url'):
            if key in data:
                cfg[key] = data[key].strip() if isinstance(data[key], str) else str(data[key])
        _save_config(cfg)
        _CONFIG_CACHE = cfg
        return jsonify({'status': 'ok'})
    safe = {k: v for k, v in _CONFIG_CACHE.items() if k not in ('token', 'saved_password', 'refreshToken', 'accessToken', '_key')}
    if _CONFIG_CACHE.get('token'):
        safe['token_set'] = True
    if _CONFIG_CACHE.get('saved_email'):
        safe['saved_email'] = _CONFIG_CACHE['saved_email']
    safe['configured'] = bool(_CONFIG_CACHE.get('token'))
    safe['app_version'] = APP_VERSION
    safe['update_manifest_url'] = _get_update_manifest_url()
    return jsonify(safe)


@app.route('/api/data-collection/status')
def data_collection_status():
    cookie_status = _get_cookie_status()
    now = time.time()
    countdown = None
    next_run_at_text = None
    if _collector_next_run_at:
        countdown = max(0, int(_collector_next_run_at - now))
        next_run_at_text = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(_collector_next_run_at))
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
        'running': _collector_running,
        'configured': bool(_CONFIG_CACHE.get('api_url')),
        'last_run': _collector_last_run,
        'last_error': _collector_last_error,
        'cookies_age_hours': cookie_status,
        'progress': _collector_progress,
        'schedule': {
            'started': _collector_loop_started,
            'mode': _collector_schedule_mode,
            'max_posts': _collector_schedule_max_posts,
            'interval_seconds': _collector_schedule_interval,
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
    global _collector_loop_started
    # Start the scheduler loop if not already running
    with _collector_loop_lock:
        if not _collector_loop_started:
            _collector_loop_started = True
            _schedule_next_collection()
            threading.Thread(target=_data_collector_loop, daemon=True).start()
    if _collector_running:
        return jsonify({'status': 'already_running'})
    body = request.get_json(silent=True) or {}
    mode = str(body.get('mode') or request.args.get('mode') or 'quick').strip().lower()
    if mode in ('full', 'all', 'complete'):
        mode = 'full'
        max_posts = 0
    else:
        mode = 'quick'
        raw_max_posts = body.get('max_posts', request.args.get('max_posts', _DEFAULT_QUICK_MAX_POSTS))
        try:
            max_posts = int(raw_max_posts)
        except (TypeError, ValueError):
            max_posts = _DEFAULT_QUICK_MAX_POSTS
        if max_posts <= 0:
            max_posts = _DEFAULT_QUICK_MAX_POSTS
    # 立即执行丢�次采�?    t = threading.Thread(target=_run_collection_once, args=(max_posts, mode, 'manual'), daemon=True)
    t.start()
    return jsonify({
        'status': 'started',
        'mode': mode,
        'max_posts': max_posts,
        'next_scheduled_run_at': (
            time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(_collector_next_run_at))
            if _collector_next_run_at else None
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
                except Exception:
                    pass
            try:
                if cookie_info.exists():
                    info = json.loads(cookie_info.read_text(encoding='utf-8'))
                    profile_persisted = bool(info.get('profile_persisted'))
            except Exception:
                pass

        age_hours = ((now - refreshed_at) / 3600) if refreshed_at else None
        has_recent_full_profile = bool(
            acc.get('platform') == 'WECHAT_VIDEO'
            and profile_persisted
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
        except: pass
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
# Metric extraction (data collector)
# ══════════════════════════════════════════════════════════════════

_METRIC_PATTERNS = {
    'followers': [
        # 抖音/douyin specific: profile section "粉丝\n159" or "粉丝�?59"
        re.compile(r'(?:^|\n)粉丝\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
        re.compile(r'粉丝�?\s*[�?]\s*([\d,.]+[万wW]?)'),
        # 视频�? 关注�?764
        re.compile(r'关注者\s*(\d[\d,.]*)'),
    ],
    'following': [
        # Use MULTILINE to anchor to line start, avoid matching nav/sidebar "关注"
        re.compile(r'(?:^|\n)关注\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
    ],
    'likes': [
        # 获赞 might be on its own line: "获赞\n132" or "获赞�?32"
        re.compile(r'(?:^|\n)获赞\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
        re.compile(r'点赞\s*[�?]\s*([\d,.]+[万wW]?)'),
        re.compile(r"新增\s*([\d,.]+[万wW]?)"),
        re.compile(r'总获赞\s*[�?]?\s*([\d,.]+[万wW]?)'),
    ],
    'views': [
        # 可参考播放量 / 播放�?�?must be at line start to avoid matching recommendations
        re.compile(r'(?:^|\n)(?:.*?播放量)\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
        re.compile(r'(?:^|\n)播放量\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
        # 视频�? 新增播放\n4
        re.compile(r'新增播放\s*([\d,.]+[万wW]?)'),
    ],
    'comments': [
        re.compile(r'评论\s*[�?]\s*([\d,.]+[万wW]?)'),
    ],
    'shares': [
        re.compile(r'分享\s*[�?]\s*([\d,.]+[万wW]?)'),
    ],
}

# Store-specific metric patterns (抖店/微信小店/小红书商�?
_STORE_METRIC_PATTERNS = {
    'buyerCount': [
        re.compile(r'成交人数\s*[�?]?\s*([\d,.]+[万wW]?)'),
        re.compile(r'支付人数\s*[�?]?\s*([\d,.]+[万wW]?)'),
        re.compile(r'下单人数\s*[�?]?\s*([\d,.]+[万wW]?)'),
        re.compile(r'买家数\s*[�?]?\s*([\d,.]+[万wW]?)'),
    ],
    'productCount': [
        re.compile(r'在售商品\s*[�?]?\s*([\d,.]+)'),
        re.compile(r'商品数\s*[�?]?\s*([\d,.]+)'),
        re.compile(r'在线商品\s*[�?]?\s*([\d,.]+)'),
    ],
    'avgOrderValue': [
        re.compile(r'客单价\s*[�?]?\s*¥?\s*([\d,.]+)'),
        re.compile(r'笔单价\s*[�?]?\s*¥?\s*([\d,.]+)'),
    ],
    'storeScore': [
        # 抖店体验�?(usually 0-100 or 0-5)
        re.compile(r'店铺体验分\s*[�?]?\s*([\d.]+)'),
        re.compile(r'体验分\s*[�?]?\s*([\d.]+)'),
        re.compile(r'商家体验分\s*[�?]?\s*([\d.]+)'),
        # 微信小店评分
        re.compile(r'店铺评分\s*[�?]?\s*([\d.]+)'),
        re.compile(r'综合评分\s*[�?]?\s*([\d.]+)'),
        # 小红书店铺分
        re.compile(r'店铺分\s*[�?]?\s*([\d.]+)'),
        re.compile(r'商家分\s*[�?]?\s*([\d.]+)'),
    ],
    'storeDiagnosis': [
        # Store diagnosis text �?grab the section after "店铺诊断" label
        re.compile(r'店铺诊断[�?]\s*(.{10,200}?)(?:\n|$)'),
        re.compile(r'诊断结果[�?]\s*(.{10,200}?)(?:\n|$)'),
        re.compile(r'经营诊断[�?]\s*(.{10,200}?)(?:\n|$)'),
    ],
}


def _sanitize_text(s: str) -> str:
    """Remove garbled characters from scraped text (double-encoding cleanup)"""
    if not s:
        return ''
    try:
        # Try to fix common double-encoding: latin-1 bytes interpreted as UTF-8
        fixed = s.encode('latin-1', errors='replace').decode('utf-8', errors='replace')
        if fixed.count('\ufffd') < s.count('\ufffd'):
            return fixed
    except Exception:
        pass
    # Replace any remaining replacement chars with empty
    return s.replace('\ufffd', '').strip()


def _parse_metric_num(s: str) -> int:
    s = s.strip().replace(',', '').replace(' ', '')
    if s.endswith(('万', 'w', 'W')):
        return round(float(s[:-1]) * 10000)
    try:
        return int(float(s))
    except ValueError:
        return 0


def _extract_douyin_overview_metrics(text: str) -> dict:
    """Extract creator-center overview metrics."""
    if not text or '数据总览' not in text:
        return {}

    start = text.find('数据总览')
    scope = text[start:start + 2500]
    if '昨日' not in scope[:800]:
        return {}

    num = r'([+-]?\d[\d,.]*[万wW]?)'
    label_map = {
        '\u64ad\u653e\u91cf': 'newViews',
        '作品点赞': 'newLikes',
        '作品分享': 'newShares',
        '作品评论': 'newComments',
        '\u51c0\u589e\u7c89\u4e1d': 'newFollowers',
    }

    result = {}
    for label, key in label_map.items():
        match = re.search(rf'{label}\s*{num}', scope)
        if match:
            result[key] = _parse_metric_num(match.group(1))
    return result


async def _get_page_text(page) -> str:
    """Extract full page text, including wujie-app shadow DOM when present."""
    try:
        text = await page.evaluate('''() => {
            const parts = [];
            for (const body of document.querySelectorAll('body')) {
                if (body && body.innerText) parts.push(body.innerText);
            }
            for (const w of document.querySelectorAll('wujie-app')) {
                if (!w.shadowRoot) continue;
                for (const body of w.shadowRoot.querySelectorAll('body')) {
                    if (body && body.innerText) parts.push(body.innerText);
                }
            }
            return parts.join('\\n');
        }''')
        return text
    except:
        try:
            return await page.evaluate('''() =>
                Array.from(document.querySelectorAll('body'))
                    .map(body => body.innerText || '')
                    .join('\\n')
            ''')
        except:
            return ''


async def _wait_for_page_text(page, markers, timeout_ms: int = 4000, min_count: int = 1, poll_ms: int = 250) -> bool:
    """Wait until page text includes enough markers, including wujie shadow DOM text."""
    if isinstance(markers, str):
        markers = [markers]
    markers = [m for m in (markers or []) if m]
    if not markers:
        await page.wait_for_timeout(min(timeout_ms, 500))
        return True

    deadline = time.monotonic() + max(timeout_ms, 0) / 1000
    while True:
        try:
            text = await _get_page_text(page)
            hits = sum(1 for marker in markers if marker in text)
            if hits >= min_count:
                return True
        except Exception:
            pass
        if time.monotonic() >= deadline:
            return False
        await page.wait_for_timeout(max(50, poll_ms))


async def _wujie_click_text(page, text_match: str) -> bool:
    """Click an element inside wujie-app shadow DOM by exact text match.
    Returns True if click succeeded, False otherwise."""
    try:
        result = await page.evaluate('''(target) => {
            const w = document.querySelector('wujie-app');
            if (!w || !w.shadowRoot) return false;
            const body = w.shadowRoot.querySelector('body');
            if (!body) return false;
            const el = Array.from(body.querySelectorAll('a,button,li,span,div,p'))
                .find(e => e.textContent.trim() === target);
            if (el) { el.click(); return true; }
            return false;
        }''', text_match)
        return result
    except:
        return False


async def _click_visible_text(page, text_match: str, exact: bool = True) -> bool:
    """Click visible text in the main document or a wujie shadow root."""
    try:
        return bool(await page.evaluate(
            r'''({target, exact}) => {
                const roots = [document];
                for (const w of document.querySelectorAll('wujie-app')) {
                    if (w.shadowRoot) roots.push(w.shadowRoot);
                }
                const norm = text => String(text || '').replace(/\s+/g, '').trim();
                const visible = el => {
                    try {
                        const style = getComputedStyle(el);
                        const box = el.getBoundingClientRect();
                        return style.display !== 'none' && style.visibility !== 'hidden' &&
                            box.width > 0 && box.height > 0;
                    } catch (e) {
                        return false;
                    }
                };
                const targetText = norm(target);
                const selector = [
                    'button', 'a', 'li', 'span', 'div', 'p',
                    '[role=button]', '[role=menuitem]', '[role=option]', '[class*=option]',
                    '[class*=menu]', '[class*=tab]', '[class*=select]'
                ].join(',');
                const candidates = [];
                for (const root of roots) {
                    for (const el of Array.from(root.querySelectorAll(selector))) {
                        if (!visible(el)) continue;
                        const text = norm(el.innerText || el.textContent);
                        if (!text) continue;
                        const hit = exact
                            ? text === targetText
                            : (text === targetText || text.includes(targetText));
                        if (hit) candidates.push(el);
                    }
                }
                candidates.sort((a, b) => {
                    const textA = norm(a.innerText || a.textContent);
                    const textB = norm(b.innerText || b.textContent);
                    const score = el => {
                        const text = norm(el.innerText || el.textContent);
                        const box = el.getBoundingClientRect();
                        return (text === targetText ? 1000 : 0) -
                            Math.min(text.length, 500) -
                            Math.round((box.width * box.height) / 10000);
                    };
                    return score(b) - score(a);
                });
                const el = candidates[0];
                if (!el) return false;
                try { el.scrollIntoView({block: 'center', inline: 'center'}); } catch (e) {}
                el.click();
                return true;
            }''',
            {'target': text_match, 'exact': exact},
        ))
    except Exception:
        return False


def _parse_wechat_key_metric_text(text: str) -> dict:
    """Parse the WeChat Channels video-data key metrics card."""
    if not text:
        return {}

    metric = {'play': 0, 'like': 0, 'comment': 0, 'share': 0, 'new_fans': 0}
    label_map = [
        ('播放量', 'play'), ('播放', 'play'),
        ('作品点赞', 'like'), ('点赞', 'like'), ('心', 'like'),
        ('评论', 'comment'),
        ('分享', 'share'),
        ('净增关注', 'new_fans'), ('新增关注', 'new_fans'), ('关注', 'new_fans'),
    ]
    period_labels = {'昨日数据', '近7天', '近30天'}
    lines = [
        line.strip()
        for line in re.split(r'[\r\n]+', text)
        if line and line.strip()
    ]

    def clean_number_line(line: str) -> bool:
        if '%' in line or '统计时间' in line or '关键指标' in line:
            return False
        if line in period_labels:
            return False
        if re.search(r'\d{2}-\d{2}', line):
            return False
        return bool(re.search(r'\d', line))

    for idx, line in enumerate(lines):
        compact = re.sub(r'\s+', '', line)
        for label, key in label_map:
            if label not in compact:
                continue
            suffix = compact.split(label, 1)[1]
            m = re.search(r'([+-]?\d[\d,.]*[万wW]?)', suffix)
            if not m:
                for nxt in lines[idx + 1:idx + 5]:
                    if not clean_number_line(nxt):
                        continue
                    m = re.search(r'([+-]?\d[\d,.]*[万wW]?)', nxt)
                    if m:
                        break
            if m:
                val = _parse_metric_num(m.group(1))
                if val >= 0:
                    metric[key] = val
                break

    values = []
    for line in lines:
        if not clean_number_line(line):
            continue
        for raw in re.findall(r'(?<![+\-])\d[\d,.]*[万wW]?', line):
            val = _parse_metric_num(raw)
            if val > 0:
                values.append(val)

    fallback = {}
    # WeChat's card commonly shows: play, favorite, like, comment, share, follow.
    if len(values) >= 6:
        fallback = {
            'play': values[0],
            'like': values[2],
            'comment': values[3],
            'share': values[4],
            'new_fans': values[5],
        }
    elif len(values) >= 5:
        fallback = {
            'play': values[0],
            'like': values[1],
            'comment': values[2],
            'share': values[3],
            'new_fans': values[4],
        }

    for key, value in fallback.items():
        if not metric.get(key):
            metric[key] = value

    return metric if any(metric.values()) else {}


async def _extract_wechat_key_metric_card_text(page) -> str:
    try:
        return await page.evaluate(
            r'''() => {
                const roots = [document];
                for (const w of document.querySelectorAll('wujie-app')) {
                    if (w.shadowRoot) roots.push(w.shadowRoot);
                }
                const visible = el => {
                    try {
                        const style = getComputedStyle(el);
                        const box = el.getBoundingClientRect();
                        return style.display !== 'none' && style.visibility !== 'hidden' &&
                            box.width > 0 && box.height > 0;
                    } catch (e) {
                        return false;
                    }
                };
                const candidates = [];
                for (const root of roots) {
                    for (const el of Array.from(root.querySelectorAll('section, article, div'))) {
                        if (!visible(el)) continue;
                        const text = (el.innerText || '').trim();
                        if (!text.includes('关键指标') || !text.includes('播放')) continue;
                        if (text.length < 20 || text.length > 3000) continue;
                        candidates.push(el);
                    }
                }
                candidates.sort((a, b) => {
                    const ta = (a.innerText || '').trim();
                    const tb = (b.innerText || '').trim();
                    const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
                    const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
                    return (ta.length + areaA / 1000) - (tb.length + areaB / 1000);
                });
                return candidates[0] ? candidates[0].innerText : '';
            }'''
        )
    except Exception:
        return ''


async def _open_wechat_key_metric_period_dropdown(page) -> bool:
    try:
        return bool(await page.evaluate(
            r'''() => {
                const roots = [document];
                for (const w of document.querySelectorAll('wujie-app')) {
                    if (w.shadowRoot) roots.push(w.shadowRoot);
                }
                const labels = new Set(['昨日数据', '�?�?, '�?0�?]);
                const norm = text => String(text || '').replace(/\s+/g, '').trim();
                const visible = el => {
                    try {
                        const style = getComputedStyle(el);
                        const box = el.getBoundingClientRect();
                        return style.display !== 'none' && style.visibility !== 'hidden' &&
                            box.width > 0 && box.height > 0;
                    } catch (e) {
                        return false;
                    }
                };
                const cards = [];
                for (const root of roots) {
                    for (const el of Array.from(root.querySelectorAll('section, article, div'))) {
                        if (!visible(el)) continue;
                        const text = el.innerText || '';
                        if (text.includes('关键指标') && text.includes('播放')) cards.push(el);
                    }
                }
                cards.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
                const card = cards[0];
                if (!card) return false;
                const candidates = Array.from(card.querySelectorAll('button, div, span, input, [role=combobox], [class*=select]'))
                    .filter(visible)
                    .filter(el => {
                        const text = norm(el.innerText || el.textContent || el.value);
                        return labels.has(text) || Array.from(labels).some(label => text.includes(label));
                    });
                candidates.sort((a, b) => norm(a.innerText || a.textContent || a.value).length -
                    norm(b.innerText || b.textContent || b.value).length);
                const el = candidates[0];
                if (!el) return false;
                try { el.scrollIntoView({block: 'center', inline: 'center'}); } catch (e) {}
                el.click();
                return true;
            }'''
        ))
    except Exception:
        return False


async def _select_wechat_video_period(page, label: str) -> bool:
    opened = await _open_wechat_key_metric_period_dropdown(page)
    await page.wait_for_timeout(150)
    clicked = await _click_visible_text(page, label, exact=True)
    for _ in range(8):
        await page.wait_for_timeout(250)
        card_text = await _extract_wechat_key_metric_card_text(page)
        if label in card_text:
            return True
    return False


async def _scrape_wechat_video_period_metrics(page) -> dict:
    """Collect video-data key metrics for yesterday, 7 days, and 30 days."""
    periods = [
        ('day_total', '昨日数据'),
        ('week_total', '近7天'),
        ('month_total', '近30天'),
    ]
    period_metrics = {}

    await _click_visible_text(page, '数据中心', exact=True)
    await _wait_for_page_text(page, ['视频数据', '关键指标', '播放'], timeout_ms=2000, min_count=1)
    await _click_visible_text(page, '视频数据', exact=True)
    await _wait_for_page_text(page, ['关键指标', '播放', '近7天', '近30天'], timeout_ms=3500, min_count=2)
    await _click_visible_text(page, '全部视频', exact=True)
    await _wait_for_page_text(page, ['关键指标', '播放'], timeout_ms=1200, min_count=1)

    for key, label in periods:
        selected = await _select_wechat_video_period(page, label)
        if not selected:
            print(f'[DC] WECHAT_VIDEO video-data {label}: period select failed')
            continue
        card_text = await _extract_wechat_key_metric_card_text(page)
        parsed = _parse_wechat_key_metric_text(card_text)
        if parsed:
            period_metrics[key] = parsed
            print(f'[DC] WECHAT_VIDEO video-data {label}: {parsed}')
        else:
            print(f'[DC] WECHAT_VIDEO video-data {label}: no metrics parsed')

    metric_keys = ('play', 'like', 'comment', 'share', 'new_fans')
    same_metrics = lambda a, b: bool(a and b) and all(
        (a.get(k, 0) or 0) == (b.get(k, 0) or 0) for k in metric_keys
    )
    if (
        same_metrics(period_metrics.get('day_total'), period_metrics.get('week_total')) and
        same_metrics(period_metrics.get('week_total'), period_metrics.get('month_total'))
    ):
        print('[DC] WECHAT_VIDEO video-data: week/month duplicated day metrics; keeping day only')
        period_metrics.pop('week_total', None)
        period_metrics.pop('month_total', None)

    if not period_metrics:
        return {}

    result = {
        '_periodMetrics': {
            'videoData': {
                **period_metrics,
                'source': 'channels_data_center_video_data',
                'collectedAt': time.strftime('%Y-%m-%d %H:%M:%S'),
            }
        }
    }

    day = period_metrics.get('day_total') or {}
    if day:
        result.update({
            'newViews': day.get('play', 0),
            'newLikes': day.get('like', 0),
            'newComments': day.get('comment', 0),
            'newShares': day.get('share', 0),
            'newFollowers': day.get('new_fans', 0),
        })

    return result


async def _scrape_dashboard(page) -> dict:
    import traceback
    text = await _get_page_text(page)
    print(f'[DEBUG _scrape_dashboard] text len={len(text)}, first 300: {text[:300]}', flush=True)
    # Strip "关于腾讯" footer
    idx = text.find('关于腾讯')
    if idx > 0:
        text = text[:idx]
    metrics = {}
    metrics.update(_extract_douyin_overview_metrics(text))
    print(f'[DEBUG _scrape_dashboard] after douyin extract: {metrics}', flush=True)

    profile_section = text[:8000] if len(text) > 8000 else text
    
    # Core metrics from profile section
    for key in ['followers', 'following', 'likes', 'comments', 'shares']:
        for pat in _METRIC_PATTERNS.get(key, []):
            m = pat.search(profile_section)
            if m:
                metrics[key] = _parse_metric_num(m.group(1))
                break

    # Video count - broader match
    m_v = re.search(r'视频\s*(\d{2,})', profile_section[:2000])
    if m_v:
        metrics['videos'] = int(m_v.group(1))

    # Views
    views_val = None
    for pat in _METRIC_PATTERNS.get('views', []):
        m = pat.search(text[:4000])
        if m:
            val = _parse_metric_num(m.group(1))
            if val < 100_000_000:
                views_val = val
                break
    if not views_val:
        try:
            dc_link = await page.query_selector('text=数据中心')
            if not dc_link:
                dc_link = await page.query_selector('[class*="data-center"]')
            if dc_link:
                await dc_link.click()
                await page.wait_for_timeout(3000)
                text2 = await page.evaluate('() => document.body.innerText')
                for pat in _METRIC_PATTERNS.get('views', []):
                    m = pat.search(text2[:4000])
                    if m:
                        val = _parse_metric_num(m.group(1))
                        if val < 100_000_000:
                            views_val = val
                            break
        except:
            pass
    if views_val:
        metrics['views'] = views_val
    print(f'[DEBUG _scrape_dashboard] after views extract: {metrics}', flush=True)

    # ┢�┢� 昨日数据 (Yesterday's metrics) ┢�┢�
    yd_start = text.find('昨日数据')
    if yd_start > 0:
        yd = text[yd_start:yd_start+800]
        # 凢�增关�? exact match
        m = re.search(r'凢�增关注\s*([\d,.]+[万wW]?)', yd)
        if m: metrics['newFollowers'] = _parse_metric_num(m.group(1))
        # 新增播放: only from 昨日 section
        m = re.search(r'新增播放\s*([\d,.]+[万wW]?)', yd)
        if m: metrics['newViews'] = _parse_metric_num(m.group(1))
        # 新增评论
        m = re.search(r'新增评论\s*([\d,.]+[万wW]?)', yd)
        if m: metrics['newComments'] = _parse_metric_num(m.group(1))
        # 新增分享
        m = re.search(r'新增分享\s*([\d,.]+[万wW]?)', yd)
        if m: metrics['newShares'] = _parse_metric_num(m.group(1))
        # 新增 (standalone, after 新增评论 and 新增分享 check �?treat as likes)
        m = re.search(r'新增\s*([\d,.]+[万wW]?)\s*(?:\n|$)', yd)
        if m: metrics['newLikes'] = _parse_metric_num(m.group(1))

    # ┢�┢� Nickname & Avatar ┢�┢�
    try:
        info = await page.evaluate('''() => {
            const result = { nickname: null, avatar: null };
            // Penetrate wujie-app shadow DOM for 视频�?
            const w = document.querySelector('wujie-app');
            const root = (w && w.shadowRoot) ? w.shadowRoot : document;
            const body = root.querySelector('body') || document.body;
            const text = body.innerText;
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

            // Strategy 1: Find real display name (line before 抖音�?快手�?小红书号 label)
            for (let i = 0; i < Math.min(lines.length, 50); i++) {
                const line = lines[i];
                if (line.match(/^(抖音号|快手号|小红书号|账号ID)/)) {
                    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
                        const candidate = lines[j];
                        if (candidate.length >= 2 && candidate.length <= 30 &&
                            !/^\\d{5,}$/.test(candidate) &&
                            !/^(抖音|快手|小红书|创作者|首页|数据|内容|粉丝|关注|获赞)/.test(candidate)) {
                            result.nickname = candidate; break;
                        }
                    }
                    if (result.nickname) break;
                }
            }

            // Strategy 2: Try page title
            if (!result.nickname) {
                const title = document.title || '';
                const clean = title.replace(/[\\-|–��].*$/, '').replace(/创作者中心|创作服务平台|数据平台|抖音|快手|小红书|视频号助手|腾讯视频�?g, '').trim();
                const platformUINames = ['视频号助�?, '视频�?, '微信', '抖音创作服务平台', '快手创作者中�?];
                if (clean.length >= 2 && clean.length <= 30 && !/^\\d+$/.test(clean) && !platformUINames.includes(clean)) {
                    result.nickname = clean;
                }
            }

            // Strategy 3: DOM selectors (penetrate shadow DOM)
            if (!result.nickname) {
                const selectors = [
                    '[class*="account-name"]', '[class*="nickname"]', '[class*="profile-name"]',
                    '[class*="user-name"]', 'h1', '[class*="creator-name"]',
                ];
                for (const sel of selectors) {
                    const el = root.querySelector(sel);
                    if (el) {
                        const txt = el.innerText.trim();
                        if (txt.length >= 2 && txt.length <= 30 && !/^\\d{5,}$/.test(txt)) {
                            result.nickname = txt; break;
                        }
                    }
                }
            }

            // Strategy 4: Fallback
            if (!result.nickname) {
                for (let i = 0; i < Math.min(lines.length, 15); i++) {
                    const candidate = lines[i];
                    if (candidate.length >= 2 && candidate.length <= 20 &&
                        !/^\\d{5,}$/.test(candidate) &&
                        !/^(抖音|快手|小红书|创作者|首页|数据|内容|粉丝|关注|获赞|账号|平台)/.test(candidate) &&
                        !/[\u4e00-\u9fa5]{6,}/.test(candidate)) {
                        result.nickname = candidate; break;
                    }
                }
            }

            // Try avatar
            const imgs = root.querySelectorAll('img');
            for (const el of imgs) {
                const src = el.src || '';
                if (src.includes('douyin') || src.includes('byteimg') || src.includes('pstatp') ||
                    src.includes('kuaishou') || src.includes('xhscdn') || src.includes('xiaohongshu') ||
                    src.includes('wx.qlogo.cn') || src.includes('wx3.qlogo.cn') || src.includes('finderhead')) {
                    if (el.width > 30 || el.height > 30) { result.avatar = src; break; }
                }
            }
            return result;
        }''')
        nick = _sanitize_text(info.get('nickname') or '')
        if nick and nick not in _NAV_NAMES and len(nick) >= 2:
            metrics['_nickname'] = nick
        if info.get('avatar'):
            metrics['_avatar'] = info['avatar']
    except:
        pass

    return metrics


async def _scrape_data_center(page, platform: str) -> dict:
    """Extract analytics from data center page, including historical multi-day data"""
    from datetime import datetime, timedelta

    result = {}
    history = []

    # --- Step 1: Full page text for metric extraction ---
    text = await _get_page_text(page)
    result.update(_extract_douyin_overview_metrics(text))

    # Try to find yesterday's data section first (most reliable)
    yd_match = re.search(r'昨日数据([\s\S]*?)(?:�?天|�?0天|$)', text[:8000])
    search_text = yd_match.group(1) if yd_match else text[:6000]

    for pat in _METRIC_PATTERNS.get('views', []):
        m = pat.search(search_text)
        if m:
            val = _parse_metric_num(m.group(1))
            if 0 < val < 100_000_000:
                result['views'] = val
                break

    for pat in _METRIC_PATTERNS.get('followers', []):
        m = pat.search(search_text)
        if m:
            result['followers'] = _parse_metric_num(m.group(1))
            break

    # --- Step 2: Try to extract historical data table (7-day / 30-day tables) ---
    try:
        table_data = await page.evaluate('''() => {
            const result = [];
            // Penetrate wujie-app shadow DOM for 视频�?
            const w = document.querySelector('wujie-app');
            const root = (w && w.shadowRoot) ? w.shadowRoot : document;
            const allTables = root.querySelectorAll('table');
            for (const table of allTables) {
                const headers = [];
                table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td').forEach(th => {
                    headers.push((th.innerText || '').trim());
                });
                if (!headers.some(h => h.includes('日期') || h.includes('时间') || /\\d{4}[-/]\\d{2}/.test(h))) {
                    continue;
                }
                const tbody = table.querySelector('tbody') || table;
                tbody.querySelectorAll('tr').forEach(row => {
                    const cells = row.querySelectorAll('td, th');
                    const rowData = [];
                    cells.forEach(cell => rowData.push((cell.innerText || '').trim()));
                    if (rowData.length >= 2) result.push(rowData);
                });
                if (result.length > 0) break;
            }
            // Fallback: find date-prefixed lines in the full text
            if (result.length === 0) {
                const body = (w && w.shadowRoot)
                    ? w.shadowRoot.querySelector('body')
                    : document.body;
                const fullText = body ? body.innerText : document.body.innerText;
                const lines = fullText.split('\\n');
                const datePattern = /^(\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2})/;
                const numPattern = /[\\d,.]+[万wW]?/g;
                for (let i = 0; i < lines.length; i++) {
                    const m = lines[i].match(datePattern);
                    if (m) {
                        const row = [m[1]];
                        // Collect numbers from this and next lines
                        for (let j = i; j < Math.min(i + 3, lines.length); j++) {
                            const nums = lines[j].match(numPattern);
                            if (nums) row.push(...nums);
                        }
                        if (row.length >= 3) result.push(row);
                    }
                }
            }
            return result.slice(0, 35); // max 35 days
        }''')

        if table_data:
            today = datetime.now().date()
            for row in table_data:
                if len(row) < 2:
                    continue
                # Try to parse date from first column
                date_str = row[0].strip()
                parsed_date = None
                for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%Y.%m.%d', '%m-%d', '%m/%d', '%m.%d']:
                    try:
                        if len(fmt) <= 5:  # short format, add current year
                            parsed_date = datetime.strptime(f'{datetime.now().year}-{date_str}', f'%Y-{fmt}').date()
                        else:
                            parsed_date = datetime.strptime(date_str, fmt).date()
                        break
                    except ValueError:
                        continue

                if not parsed_date:
                    # Check for "昨天", "前天", "今日" etc.
                    if '昨天' in date_str:
                        parsed_date = today - timedelta(days=1)
                    elif '前天' in date_str:
                        parsed_date = today - timedelta(days=2)
                    elif '今日' in date_str or '今天' in date_str:
                        parsed_date = today
                    else:
                        continue

                # Extract metric values from remaining columns
                metrics_for_date = {}
                # Column mapping varies by platform �?try heuristics
                remaining = row[1:]
                # Flatten: split each cell by whitespace and extract numbers
                nums = []
                for cell in remaining:
                    for part in cell.split():
                        val = _parse_metric_num(part)
                        if val > 0:
                            nums.append(val)

                # Heuristic: first number = views, second = likes, third = comments
                if len(nums) >= 1:
                    metrics_for_date['views'] = nums[0]
                if len(nums) >= 2:
                    metrics_for_date['likes'] = nums[1]
                if len(nums) >= 3:
                    metrics_for_date['comments'] = nums[2]
                if len(nums) >= 4:
                    metrics_for_date['shares'] = nums[3]

                if metrics_for_date:
                    history.append({
                        'date': parsed_date.isoformat(),
                        **metrics_for_date,
                    })

        # Deduplicate by date
        seen = set()
        deduped = []
        for h in history:
            if h['date'] not in seen:
                seen.add(h['date'])
                deduped.append(h)
        history = deduped

    except Exception as e:
        print(f'[DC] historical data extraction error: {e}')

    # --- Step 3: Simple table scan (label-value pairs) ---
    try:
        table_rows = await page.evaluate('''() => {
            const rows = [];
            document.querySelectorAll('table tr, [class*="row"], [class*="item"]').forEach(el => {
                const cells = el.querySelectorAll('td, th, [class*="cell"]');
                if (cells.length >= 2) {
                    const label = (cells[0].innerText || '').trim();
                    const value = (cells[1].innerText || '').trim();
                    rows.push([label, value]);
                }
            });
            return rows;
        }''')
        for label, value in table_rows:
            for key, patterns in _METRIC_PATTERNS.items():
                for pat in patterns:
                    if pat.search(label):
                        if key not in result:
                            result[key] = _parse_metric_num(value)
                        break
    except:
        pass

    # Try clicking data center tabs for more data
    tab_selectors = {
        '视频数据': '[class*=tab]:has-text("视频数据"), span:has-text("视频数据"), a:has-text("视频数据")',
        '粉丝数据': '[class*=tab]:has-text("粉丝数据"), span:has-text("粉丝数据"), a:has-text("粉丝数据")',
        '直播数据': '[class*=tab]:has-text("直播数据"), span:has-text("直播数据"), a:has-text("直播数据")',
    }
    for tab_name, selector in tab_selectors.items():
        try:
            tab = await page.query_selector(selector)
            if tab:
                await tab.click()
                await page.wait_for_timeout(3000)
                tab_text = await page.evaluate('() => document.body.innerText')

                # Extract metrics from tab
                for key in ['followers', 'likes', 'views', 'comments', 'shares']:
                    if key not in result or result.get(key, 0) == 0:
                        for pat in _METRIC_PATTERNS.get(key, []):
                            m = pat.search(tab_text[:6000])
                            if m:
                                val = _parse_metric_num(m.group(1))
                                if val > 0:
                                    result[key] = val
                                    break

                # Live metrics
                for label, key in [('观看人数', 'liveViews'), ('最高在线', 'liveMaxOnline'),
                                   ('新增粉丝', 'liveFollowers'), ('直播收入', 'liveRevenue')]:
                    m = re.search(rf'{label}\s*([\d,.]+[万wW]?)', tab_text[:3000])
                    if m:
                        result[key] = _parse_metric_num(m.group(1))
        except Exception:
            pass

    if platform == 'WECHAT_VIDEO':
        try:
            period_result = await _scrape_wechat_video_period_metrics(page)
            if period_result.get('_periodMetrics'):
                for key in ('views', 'likes', 'comments', 'shares'):
                    result.pop(key, None)
            result.update(period_result)
        except Exception as e:
            print(f'[DC] WECHAT_VIDEO video-data period metrics error: {e}')

    result['_history'] = history
    return result


async def _scrape_video_list(page, platform: str, max_posts: int = 0) -> list:
    """Scrape video list metrics and stop on natural pagination signals."""
    global _collector_progress
    import hashlib
    limit = max_posts if isinstance(max_posts, int) and max_posts > 0 else None

    if platform == 'WECHAT_VIDEO':
        api_videos = await _scrape_wechat_video_list_api(page, max_posts=max_posts)
        if api_videos:
            print(f'[DC] WECHAT_VIDEO: post_list API collected {len(api_videos)} posts')
            return api_videos
        print('[DC] WECHAT_VIDEO: post_list API returned no posts, falling back to DOM parsing')
    
    await _wait_for_page_text(page, ['视频管理', '视频 (', '合集', '搜索视频'], timeout_ms=2500, min_count=1)
    
    all_videos = []
    seen_titles = set()
    
    page_num = 1
    while True:
        # Extract page text (uses _get_page_text with wujie-app shadow DOM fallback)
        text = await _get_page_text(page)
        if not text or len(text) < 200:
            videos = []
        else:
            # Parse videos in Python (avoids JS errors in WeChat Video wujie-app shadow DOM)
            raw_lines = [l.strip() for l in text.split('\n') if l.strip()]
            videos = []
            for i, line in enumerate(raw_lines):
                if re.search(r'\d{4}?\d{2}?\d{2}??', line) and i > 0 and len(raw_lines[i-1]) > 5:
                    title = raw_lines[i-1].strip()[:80]
                    if '???' in title or '???' in title:
                        continue
                    date = line.strip()
                    numbers = []
                    for j in range(i + 1, min(i + 5, len(raw_lines))):
                        nums = re.findall(r'[\d,.]+[万W]?', raw_lines[j])
                        numbers.extend(nums)
                    if numbers:
                        videos.append({'title': title, 'date': date, 'numbers': numbers[:5]})
        
        skip = ['??','??','??','??','??','????','??','??',
                '运营','变现','服务','通知','帮助','咨询','规范','协议',
                '????','????','??','???ID','Tencent','?',
                '草�6�0','主页','活动','直播','图文','音乐','音频','关于腾讯',
                '?????','????','??','??','??','??','??',
                '??','????','??','??','????','????']
        
        page_videos = 0
        for v in videos:
            t = (v.get('title') or '').strip()
            if not t or len(t) < 3 or any(w in t for w in skip):
                continue
            norm = t.lower().replace(' ', '')
            if norm in seen_titles:
                continue
            seen_titles.add(norm)
            
            nums = sorted([_parse_metric_num(n) for n in v.get('numbers', [])
                          if _parse_metric_num(n) > 0], reverse=True)
            if len(nums) < 1:
                continue
            
            all_videos.append({
                'id': hashlib.md5(t.encode()).hexdigest()[:12],
                'title': t,
                'date': v.get('date', ''),
                'views': nums[0] if len(nums) > 0 else 0,
                'likes': nums[1] if len(nums) > 1 else 0,
                'comments': nums[2] if len(nums) > 2 else 0,
                'shares': nums[3] if len(nums) > 3 else 0,
            })
            page_videos += 1
        
        if page_videos == 0 and page_num > 1:
            # No more pages
            break
        
        # Click next page inside wujie-app shadow DOM
        _collector_progress['video_page'] = page_num
        _collector_progress['video_count'] = len(all_videos)
        if limit and len(all_videos) >= limit:
            break
        clicked = await _wujie_click_text(page, '???')
        page_num += 1
        if not clicked:
            break
    
    return all_videos[:limit] if limit else all_videos


async def _ensure_wechat_video_list_page(page) -> bool:
    """Open Content Management > Video so the Channels post_list API is available."""
    async def _looks_ready() -> bool:
        try:
            text = await _get_page_text(page)
            return (
                ('/platform/post/list' in page.url and '\u89c6\u9891\u7ba1\u7406' in text) or
                ('\u89c6\u9891\u7ba1\u7406' in text and '\u89c6\u9891 (' in text and '\u5408\u96c6' in text)
            )
        except Exception:
            return False

    async def _click_label(label: str) -> bool:
        try:
            return bool(await page.evaluate(
                r'''(target) => {
                    const roots = [document];
                    const wujie = document.querySelector('wujie-app');
                    if (wujie && wujie.shadowRoot) roots.push(wujie.shadowRoot);

                    const norm = text => String(text || '').replace(/\s+/g, '').trim();
                    const visible = el => {
                        try {
                            const style = getComputedStyle(el);
                            const box = el.getBoundingClientRect();
                            return style.display !== 'none' && style.visibility !== 'hidden' &&
                                box.width > 0 && box.height > 0;
                        } catch (e) {
                            return false;
                        }
                    };

                    const selector = [
                        'button', 'a', 'li', 'span', 'div', 'p',
                        '[role=button]', '[role=menuitem]', '[class*=menu]', '[class*=nav]'
                    ].join(',');
                    const targetText = norm(target);
                    const candidates = [];
                    for (const root of roots) {
                        for (const el of Array.from(root.querySelectorAll(selector))) {
                            const text = norm(el.textContent);
                            if (!text) continue;
                            if (text === targetText || text.startsWith(targetText) || text.includes(targetText)) {
                                candidates.push(el);
                            }
                        }
                    }
                    candidates.sort((a, b) => {
                        const at = norm(a.textContent);
                        const bt = norm(b.textContent);
                        const score = el => (visible(el) ? 100 : 0) +
                            (norm(el.textContent) === targetText ? 30 : 0) +
                            (norm(el.textContent).startsWith(targetText) ? 10 : 0) -
                            Math.min(norm(el.textContent).length, 200) / 1000;
                        return score(b) - score(a);
                    });
                    const el = candidates[0];
                    if (!el) return false;
                    try { el.scrollIntoView({block: 'center', inline: 'center'}); } catch (e) {}
                    el.click();
                    return true;
                }''',
                label,
            ))
        except Exception:
            return False

    if await _looks_ready():
        return True

    await _click_label('\u5185\u5bb9\u7ba1\u7406')
    await _wait_for_page_text(page, ['视频', '图文', '音乐'], timeout_ms=1600, min_count=1)
    await _click_label('\u89c6\u9891')
    await _wait_for_page_text(page, ['视频管理', '视频 (', '合集', '搜索视频'], timeout_ms=3500, min_count=1)
    if await _looks_ready():
        return True

    try:
        await page.goto('https://channels.weixin.qq.com/platform', wait_until='domcontentloaded', timeout=30000)
        await _wait_for_page_text(page, ['内容管理', '数据中心', '首页'], timeout_ms=2500, min_count=1)
        await _click_label('\u5185\u5bb9\u7ba1\u7406')
        await _wait_for_page_text(page, ['视频', '图文', '音乐'], timeout_ms=1600, min_count=1)
        await _click_label('\u89c6\u9891')
        await _wait_for_page_text(page, ['视频管理', '视频 (', '合集', '搜索视频'], timeout_ms=3500, min_count=1)
    except Exception:
        pass
    return await _looks_ready()


async def _scrape_wechat_video_list_api(page, max_posts: int = 0) -> list:
    """Collect WeChat Channels posts through the paged API."""
    try:
        ready = await _ensure_wechat_video_list_page(page)
        if not ready:
            print('[DC] WECHAT_VIDEO: could not open video management page before post_list API')

        return await page.evaluate(
            r'''async ({maxPosts}) => {
                const pageSize = 20;
                const limit = Number.isFinite(Number(maxPosts)) && Number(maxPosts) > 0
                    ? Number(maxPosts)
                    : 0;
                const maxPages = 1000;
                const pageUrl = 'https://channels.weixin.qq.com/micro/content/post/list';
                const results = [];
                const seen = new Set();

                function makeId() {
                    if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
                    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
                }

                function makeEndpoint() {
                    const aid = makeId();
                    const rid = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 12)}`;
                    return `/micro/content/cgi-bin/mmfinderassistant-bin/post/post_list?_aid=${aid}&_rid=${rid}&_pageUrl=${encodeURIComponent(pageUrl)}`;
                }

                function num(value) {
                    if (value === null || value === undefined) return 0;
                    if (typeof value === 'number') return Math.round(value);
                    let s = String(value).trim().replace(/,/g, '');
                    if (!s) return 0;
                    let mult = 1;
                    if (s.includes('\u4ebf')) mult = 100000000;
                    else if (s.includes('\u4e07') || /w/i.test(s)) mult = 10000;
                    else if (s.includes('\u5343') || /k/i.test(s)) mult = 1000;
                    const m = s.match(/[\d.]+/);
                    return m ? Math.round(parseFloat(m[0]) * mult) : 0;
                }

                function first(...values) {
                    for (const value of values) {
                        if (value !== null && value !== undefined && value !== '') return value;
                    }
                    return '';
                }

                function walk(obj, visitor, depth = 0) {
                    if (!obj || depth > 6) return undefined;
                    const hit = visitor(obj);
                    if (hit !== undefined && hit !== null && hit !== '') return hit;
                    if (Array.isArray(obj)) {
                        for (const item of obj) {
                            const nested = walk(item, visitor, depth + 1);
                            if (nested !== undefined && nested !== null && nested !== '') return nested;
                        }
                    } else if (typeof obj === 'object') {
                        for (const value of Object.values(obj)) {
                            const nested = walk(value, visitor, depth + 1);
                            if (nested !== undefined && nested !== null && nested !== '') return nested;
                        }
                    }
                    return undefined;
                }

                function getAny(obj, keys) {
                    const keySet = new Set(keys.map(k => k.toLowerCase()));
                    return walk(obj, current => {
                        if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
                        for (const [key, value] of Object.entries(current)) {
                            if (keySet.has(key.toLowerCase()) && value !== null && value !== undefined && value !== '') {
                                return value;
                            }
                        }
                        return undefined;
                    });
                }

                function findPostArray(obj) {
                    const direct = obj && obj.data && Array.isArray(obj.data.list) ? obj.data.list : null;
                    if (direct) return direct;
                    let best = [];
                    walk(obj, current => {
                        if (!Array.isArray(current) || current.length === 0) return undefined;
                        const score = current.slice(0, 5).filter(item => {
                            if (!item || typeof item !== 'object') return false;
                            return item.desc || item.objectId || item.exportId ||
                                getAny(item, ['title', 'description', 'postId', 'feedId', 'id']);
                        }).length;
                        if (score > 0 && current.length > best.length) best = current;
                        return undefined;
                    });
                    return best;
                }

                function formatTime(value) {
                    const n = num(value);
                    if (!n) return String(value || '');
                    const ms = n > 100000000000 ? n : n * 1000;
                    const d = new Date(ms);
                    if (Number.isNaN(d.getTime())) return String(value || '');
                    const pad = x => String(x).padStart(2, '0');
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                }

                function normalize(item) {
                    const desc = item && typeof item.desc === 'object' && !Array.isArray(item.desc) ? item.desc : {};
                    const mediaList = Array.isArray(desc.media) ? desc.media : [];
                    const media = mediaList.find(m => m && typeof m === 'object') || {};
                    const title = String(first(
                        desc.description,
                        item.description,
                        item.title,
                        item.objectDesc,
                        item.object_desc,
                        getAny(item, ['contentDesc', 'content_desc', 'wording'])
                    ) || '').replace(/\s+/g, ' ').trim();
                    const rawId = first(
                        item.objectId,
                        item.object_id,
                        item.exportId,
                        item.export_id,
                        item.feedId,
                        item.feed_id,
                        item.postId,
                        item.post_id,
                        item.id
                    );
                    const publishRaw = first(
                        item.effectiveTime,
                        item.effective_time,
                        item.publishTime,
                        item.publish_time,
                        item.createTime,
                        item.create_time,
                        item.createtime,
                        item.postTime,
                        item.post_time
                    );
                    const publishTime = formatTime(publishRaw);
                    const cover = String(first(
                        media.coverUrl,
                        media.cover_url,
                        media.thumbUrl,
                        media.thumb_url,
                        media.fullCoverUrl,
                        item.coverUrl,
                        item.cover_url,
                        item.thumbUrl,
                        item.thumb_url
                    ) || '');
                    const duration = num(first(media.videoPlayLen, media.duration, item.videoPlayLen, item.duration));
                    return {
                        id: String(rawId || title || JSON.stringify(item).slice(0, 80)),
                        content_id: String(rawId || ''),
                        title,
                        cover_url: cover,
                        cover,
                        content_type: 'video',
                        publish_time: publishTime,
                        publishedAt: publishTime,
                        date: publishTime,
                        duration,
                        videoDuration: duration,
                        views: num(first(item.readCount, item.read_count, item.playCount, item.play_count, item.viewCount, item.view_count)),
                        likes: num(first(item.likeCount, item.like_count, item.praiseCount, item.praise_count)),
                        comments: num(first(item.commentCount, item.comment_count)),
                        shares: num(first(item.forwardCount, item.forward_count, item.shareCount, item.share_count)),
                        saves: num(first(item.favCount, item.fav_count)),
                    };
                }

                async function fetchPage(currentPage) {
                    const resp = await fetch(makeEndpoint(), {
                        method: 'POST',
                        credentials: 'include',
                        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
                        body: JSON.stringify({
                            pageSize,
                            currentPage,
                            userpageType: 11,
                            stickyOrder: true,
                            timestamp: String(Date.now()),
                            _log_finder_uin: '',
                            _log_finder_id: '',
                            rawKeyBuff: '',
                            pluginSessionId: null,
                            scene: 7,
                            reqScene: 7,
                        }),
                    });
                    const text = await resp.text();
                    try {
                        return {status: resp.status, json: JSON.parse(text), text};
                    } catch (e) {
                        return {status: resp.status, json: null, text};
                    }
                }

                for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
                    const payload = await fetchPage(currentPage);
                    if (payload.status >= 400 || !payload.json) break;
                    const rows = findPostArray(payload.json);
                    if (!rows.length) break;
                    let added = 0;
                    for (const row of rows) {
                        const post = normalize(row);
                        if (!post.title || post.title.length < 2) continue;
                        const key = post.id || post.title;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        results.push(post);
                        added += 1;
                        if (limit && results.length >= limit) break;
                    }
                    if (added === 0) break;
                    if (limit && results.length >= limit) break;
                    if (rows.length < pageSize) break;
                }

                return limit ? results.slice(0, limit) : results;
            }''',
            {'maxPosts': max_posts},
        )
    except Exception as e:
        print(f'[DC] WECHAT_VIDEO post_list API error: {str(e)[:120]}')
        return []


async def _scrape_monetization(page) -> dict:
    """Extract revenue/monetization metrics from creator monetization page
    Supports 抖音变现中心, 快手变现, etc."""
    result = {}
    text = await page.evaluate('() => document.body.innerText')

    patterns = {
        'revenue': [
            re.compile(r'累计收入\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'总收益\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'预估收入\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'本月收入\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
        ],
        'gmv': [
            re.compile(r'GMV\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'成交金额\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'锢�售额\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
        ],
        'orders': [
            re.compile(r'订单数\s*[�?]?\s*([\d,.]+[万wW]?)'),
            re.compile(r'成交单数\s*[�?]?\s*([\d,.]+[万wW]?)'),
        ],
        'commission': [
            re.compile(r'佣金\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'带货佣金\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
        ],
    }

    # Search first 6000 chars for monetization data
    search_text = text[:6000]
    for key, pats in patterns.items():
        for pat in pats:
            m = pat.search(search_text)
            if m:
                result[key] = _parse_metric_num(m.group(1))
                break

    # Also try table-based extraction
    try:
        table_data = await page.evaluate('''() => {
            const rows = [];
            document.querySelectorAll('table tr, [class*="row"], [class*="item"], [class*="card"]').forEach(el => {
                const cells = el.querySelectorAll('td, th, [class*="cell"], [class*="label"], [class*="value"]');
                if (cells.length >= 2) {
                    rows.push([(cells[0].innerText||'').trim(), (cells[1].innerText||'').trim()]);
                }
            });
            return rows;
        }''')
        rev_patterns = ['收入','收益','GMV','成交','订单','佣金','锢�售额','带货','变现']
        for label, value in table_data:
            if any(w in label for w in rev_patterns):
                for key, pats in patterns.items():
                    for pat in pats:
                        if pat.search(label) and key not in result:
                            result[key] = _parse_metric_num(value)
                            break
    except:
        pass

    return result


async def _scrape_store_dashboard(page, platform: str) -> dict:
    """Scrape detailed store metrics from store backend pages."""
    result = {'revenue': 0, 'gmv': 0, 'orders': 0, 'commission': 0,
              'buyerCount': 0, 'productCount': 0, 'avgOrderValue': 0,
              'storeScore': None, 'storeDiagnosis': None, '_storeName': None}

    try:
        text = await _get_page_text(page)
        search_text = text[:10000]

        # 1. Basic monetization (reuse existing patterns)
        mon_patterns = {
            'revenue': [
                re.compile(r'累计收入\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'总收益\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'成交金额\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            ],
            'gmv': [
                re.compile(r'GMV\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'锢�售额\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'交易额\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            ],
            'orders': [
                re.compile(r'订单数\s*[�?]?\s*([\d,.]+[万wW]?)'),
                re.compile(r'成交单数\s*[�?]?\s*([\d,.]+[万wW]?)'),
                re.compile(r'支付订单\s*[�?]?\s*([\d,.]+[万wW]?)'),
            ],
            'commission': [
                re.compile(r'佣金\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'预计佣金\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            ],
        }
        for key, pats in mon_patterns.items():
            for pat in pats:
                m = pat.search(search_text)
                if m:
                    result[key] = _parse_metric_num(m.group(1))
                    break

        # 2. Store-specific metrics
        for key, pats in _STORE_METRIC_PATTERNS.items():
            for pat in pats:
                m = pat.search(search_text)
                if m:
                    val = m.group(1).strip()
                    if key in ('storeScore',):
                        try:
                            result[key] = float(val)
                        except ValueError:
                            result[key] = None
                    elif key == 'storeDiagnosis':
                        result[key] = _sanitize_text(val)
                    else:
                        result[key] = _parse_metric_num(val)
                    break

        # 3. Store name
        store_name_patterns = [
            re.compile(r'店铺名称\s*[�?]\s*(\S.{2,30})'),
            re.compile(r'小店名称\s*[�?]\s*(\S.{2,30})'),
        ]
        for pat in store_name_patterns:
            m = pat.search(search_text)
            if m:
                result['_storeName'] = _sanitize_text(m.group(1).strip())
                break

        # 4. Table-based extraction for store pages
        try:
            table_data = await page.evaluate('''() => {
                const rows = [];
                document.querySelectorAll('table tr, [class*="row"], [class*="item"], [class*="card"], [class*="metric"]').forEach(el => {
                    const cells = el.querySelectorAll('td, th, [class*="cell"], [class*="label"], [class*="value"], [class*="name"]');
                    if (cells.length >= 2) {
                        rows.push([(cells[0].innerText||'').trim(), (cells[1].innerText||'').trim()]);
                    }
                });
                return rows;
            }''')
            store_patterns = ['店铺', '收入', 'GMV', '成交', '订单', '佣金', '买家', '商品', '客单价', '体验分', '评分', '诊断', '销售额', '支付人数', '在售']
            for label, value in table_data:
                if any(w in label for w in store_patterns):
                    for key, pats in {**mon_patterns, **_STORE_METRIC_PATTERNS}.items():
                        for pat in pats:
                            if pat.search(label) and (key not in result or result.get(key) in (None, 0)):
                                if key in ('storeScore',):
                                    try:
                                        result[key] = float(value)
                                    except ValueError:
                                        pass
                                elif key == 'storeDiagnosis':
                                    result[key] = _sanitize_text(value)
                                else:
                                    result[key] = _parse_metric_num(value)
                                break
        except:
            pass

    except Exception as e:
        print(f'[STORE] scrape error {platform}: {e}')

    return result



async def _page_goto_retry(page, url, max_retries=2, platform=''):
    """Navigate to URL with retry."""
    for attempt in range(max_retries):
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await page.wait_for_timeout(700 if attempt == 0 else 1200)
            # Verify page has loaded content
            text_len = await page.evaluate('''() => {
                const w = document.querySelector("wujie-app");
                if (w && w.shadowRoot) {
                    const body = w.shadowRoot.querySelector("body");
                    if (body) return body.innerText.length;
                }
                return document.body ? document.body.innerText.length : 0;
            }''')
            # For WECHAT_VIDEO: wujie-app micro-frontend renders lazily; let downstream handle it
            if platform == 'WECHAT_VIDEO':
                await _wait_for_page_text(page, ['首页', '内容管理', '数据中心', '视频数据', '视频管理'], timeout_ms=2500, min_count=1)
                print(f"[DC] _page_goto_retry WECHAT_VIDEO: text_len={text_len}, proceeding anyway")
                return True
            if text_len > 50:
                return True
            print(f"[DC] Page content too short ({text_len} chars) at {url[:60]}, wujie_app present, attempt {attempt+1}/{max_retries}")
            # For other SPA platforms using shadow DOM, may need more render time
            if attempt == 0:
                await page.wait_for_timeout(2000)
            else:
                await page.wait_for_timeout(1200)
        except Exception as e:
            print(f"[DC] Page goto error (attempt {attempt+1}): {str(e)[:100]}")
    return False
async def _scrape_account_pages(context, platform: str, account_label: str = '', max_posts: int = 0, sleep_sec: float = 1.5) -> dict:
    """Scan pages in a single authenticated session."""
    global _collector_progress
    entry = PLATFORM_DASHBOARDS.get(platform)
    if not entry:
        return {'metrics': {}, 'video_stats': []}

    url = entry['url']
    data_center_url = entry.get('data_center')
    video_list_url = entry.get('video_list')
    monetization_url = entry.get('monetization')

    try:
        page = await context.new_page()
    except Exception as e:
        print(f'[DC] Context closed, skipping {platform}: {e}')
        return {'metrics': {}, 'video_stats': []}

    metrics = {}
    video_stats = []
    quick_mode = isinstance(max_posts, int) and max_posts > 0

    # ┢�┢� WECHAT_VIDEO: 响应拦截 auth_data API（头�?昵称/粉丝数） ┢�┢�
    # DOM �?img.avatar �?src 为空，必须从 API 响应获取�?
    # 在导航前注册监听，页面加载时 API 带有�?cookie，拦截自然生效��?
    # 支持多账号：每个 profile 各自有独�?session�?
    captured_auth = {}
    if platform == 'WECHAT_VIDEO':
        async def _on_auth_response(response):
            if 'auth' not in captured_auth and 'auth_data' in response.url and response.status == 200:
                try:
                    ct = response.headers.get('content-type', '')
                    if 'json' in ct or 'text' in ct:
                        text = await response.text()
                        if text.startswith('{'):
                            import json as _json
                            data = _json.loads(text)
                            if data.get('errCode') == 0:
                                captured_auth['auth'] = data.get('data', {})
                                print(f'[DC] WECHAT_VIDEO: auth_data captured, headImgUrl={data.get("data",{}).get("finderUser",{}).get("headImgUrl","?")[:50]}')
                            else:
                                print(f'[DC] WECHAT_VIDEO: auth_data errCode={data.get("errCode")}, msg={data.get("errMsg","?")}')
                except Exception:
                    pass
        page.on('response', _on_auth_response)

    try:
        # 1. Dashboard (with retry)
        ok = await _page_goto_retry(page, url, platform=platform)
        if not ok:
            print(f'[DC] {platform}: Dashboard page failed to load, skipping')
            return {'metrics': {}, 'video_stats': [], 'expired': True}
        if platform == 'WECHAT_VIDEO':
            await _wait_for_page_text(page, ['内容管理', '数据中心', '视频号ID', '首页'], timeout_ms=5000, min_count=1)
        else:
            try:
                await page.wait_for_selector('[class*=content], [class*=main], [role=main], main', timeout=6000)
            except:
                await page.wait_for_timeout(2000)

        # Check if we landed on a login page (cookie expired / invalid)
        current_url = page.url.lower()
        page_title = (await page.title()).lower() if hasattr(page, 'title') else ''
        # URL path-based detection �?avoid broad words like 'scan'/'verify'/'authorize'
        # that appear in normal dashboard URLs
        login_url_patterns = ['/login', '/passport', '/signin', '/sign-in',
                              '/qrcode', '/qr_code', '/sso/', '/oauth/login']
        if any(pat in current_url for pat in login_url_patterns):
            print(f'[DC] {platform}: redirected to login page (url={current_url[:80]}), skipping')
            return {'metrics': {}, 'video_stats': [], 'expired': True}

        # Also check page title �?but only for DOUYIN where title-based detection is reliable
        # WECHAT_VIDEO dashboard title may contain "登录" even when authenticated
        if platform != 'WECHAT_VIDEO':
            login_titles = ['登录', 'sign in', 'log in']
            if any(kw in page_title for kw in login_titles):
                print(f'[DC] {platform}: login page detected by title "{page_title[:60]}", skipping')
                return {'metrics': {}, 'video_stats': [], 'expired': True}

        try:
            # DOM login check �?skip DOUYIN (detected by URL above; creator pages
            # contain QR elements like mobile app download = false positives)
            if platform in ('DOUYIN', 'WECHAT_VIDEO'):
                login_dom = False
            else:
                login_dom = await page.evaluate('''() => {
                    const text = (document.body && document.body.innerText || '').toLowerCase();
                    const mediaUrls = Array.from(document.querySelectorAll('iframe,img'))
                        .map(el => (el.src || '').toLowerCase()).join('\\n');
                    // QR code image is the strongest login signal
                    const hasQrCode = document.querySelector('img[class*="qr"], img[src*="qr"], img[src*="qrcode"], img[alt*="qr"]')
                        || mediaUrls.includes('qrcode') || mediaUrls.includes('qr_code');
                    // Only login-specific text markers (not generic WeChat terms)
                    const textMarkers = [
                        '\\u626b\\u7801\\u767b\\u5f55',
                        '\\u4e8c\\u7ef4\\u7801\\u767b\\u5f55',
                        '\\u8bf7\\u626b\\u7801\\u767b\\u5f55'
                    ];
                    const hasLoginText = textMarkers.some(marker => text.includes(marker));
                    // Login form elements
                    const hasLoginForm = document.querySelector('input[type="password"], button[class*="login"], div[class*="login-form"], div[class*="qrcode-container"]');
                    return hasQrCode || hasLoginText || !!hasLoginForm ||
                        /login|passport|qrcode|qr_code/.test(mediaUrls);
                }''')
            if login_dom:
                import time as _t
                _ts = _t.strftime('%H%M%S')
                _ssh = f'C:/Users/EDY/jujuju/desktop-companion/_debug_login_{platform}_{_ts}.png'
                try:
                    await page.screenshot(path=_ssh, full_page=False)
                    _ptxt = await page.evaluate('() => document.body.innerText.substring(0, 2000)')
                    print(f'[DC] {platform}: login UI detected! screenshot={_ssh}', flush=True)
                    print(f'[DC] Page URL: {page.url}', flush=True)
                    print(f'[DC] Page text (2000): {_ptxt}', flush=True)
                except Exception as _e:
                    print(f'[DC] Debug screenshot error: {_e}', flush=True)
                print(f'[DC] {platform}: login UI detected, marking cookie expired')
                return {'metrics': {}, 'video_stats': [], 'expired': True}
        except Exception:
            pass

        metrics = await _scrape_dashboard(page)

        # WECHAT_VIDEO: 从拦截的 auth_data API 补充头像/昵称/粉丝�?
        # DOM 提取 img.avatar �?src 总是空，API 拦截是可靠来�?
        if platform == 'WECHAT_VIDEO':
            # Poll for auth_data response (API may fire during or after page load)
            for _poll in range(20):
                if captured_auth.get('auth'):
                    break
                await asyncio.sleep(0.5)
            if captured_auth.get('auth'):
                fu = captured_auth['auth'].get('finderUser', {})
                if fu.get('headImgUrl') and not metrics.get('_avatar'):
                    metrics['_avatar'] = fu['headImgUrl']
                    print(f'[DC] WECHAT_VIDEO: avatar(API): {fu["headImgUrl"][:60]}...')
                if fu.get('nickname') and not metrics.get('_nickname'):
                    metrics['_nickname'] = fu['nickname']
                if fu.get('fansCount') and not metrics.get('followers'):
                    metrics['followers'] = fu['fansCount']
            else:
                print(f'[DC] WECHAT_VIDEO: auth_data not captured after 10s, trying DOM fallback...')
                # Fallback: aggressively search shadow DOM for avatar images
                try:
                    dom_avatar = await page.evaluate('''() => {
                        const w = document.querySelector("wujie-app");
                        const root = (w && w.shadowRoot) ? w.shadowRoot : document;
                        // Try all images, prioritize those with avatar-like class names
                        const allImgs = root.querySelectorAll("img");
                        for (const img of allImgs) {
                            const src = img.src || "";
                            const cls = (img.className || "").toLowerCase();
                            const alt = (img.alt || "").toLowerCase();
                            const w = img.width || img.naturalWidth || 0;
                            const h = img.height || img.naturalHeight || 0;
                            // WeChat avatar patterns
                            if (src.includes("wx.qlogo.cn") || src.includes("finderhead") ||
                                src.includes("wx3.qlogo.cn") || src.includes("headimgurl") ||
                                cls.includes("avatar") || cls.includes("head") ||
                                cls.includes("profile") || alt.includes("\u5934\u50cf")) {
                                return src;
                            }
                        }
                        // Fallback: find any reasonably-sized image near top of page
                        for (const img of allImgs) {
                            const src = img.src || "";
                            const w = img.width || img.naturalWidth || 0;
                            const h = img.height || img.naturalHeight || 0;
                            if (src.length > 50 && w > 30 && h > 30 && (w === h || Math.abs(w-h) < 5)) {
                                return src;
                            }
                        }
                        return "";
                    }''')
                    if dom_avatar and not metrics.get('_avatar'):
                        metrics['_avatar'] = dom_avatar
                        print(f'[DC] WECHAT_VIDEO: avatar(DOM fallback): {dom_avatar[:60]}...')
                    elif not dom_avatar:
                        print(f'[DC] WECHAT_VIDEO: DOM fallback also failed - no avatar image found')
                except Exception as e:
                    print(f'[DC] WECHAT_VIDEO: DOM fallback error: {str(e)[:100]}')

        # 2. Data center
        if data_center_url:
            _collector_progress['phase'] = '数据中心'
            try:
                await _page_goto_retry(page, data_center_url, platform=platform)
                if platform == 'WECHAT_VIDEO':
                    await _wait_for_page_text(page, ['关键指标', '视频数据', '播放', '数据趋势'], timeout_ms=6000, min_count=1)
                else:
                    try:
                        await page.wait_for_selector('[class*=content], [class*=main], [role=main], main', timeout=6000)
                    except:
                        await page.wait_for_timeout(2000)
                dc = await _scrape_data_center(page, platform)
                for k, v in dc.items():
                    prefer_video_period = platform == 'WECHAT_VIDEO' and k in {
                        '_periodMetrics',
                        'newViews', 'newLikes', 'newComments', 'newShares', 'newFollowers',
                        'views', 'likes', 'comments', 'shares',
                    }
                    if v is not None and (prefer_video_period or k not in metrics or metrics.get(k, 0) == 0):
                        metrics[k] = v
            except Exception as e:
                print(f'[DC] data-center error {platform}: {e}')

        # 3. Video list
        if video_list_url:
            _collector_progress['phase'] = '视频采集'
            try:
                await _page_goto_retry(page, video_list_url, platform=platform)
                if platform == 'WECHAT_VIDEO':
                    await _wait_for_page_text(page, ['视频管理', '视频 (', '合集', '搜索视频'], timeout_ms=5000, min_count=1)
                else:
                    await page.wait_for_timeout(1200)
                video_stats = await _scrape_video_list(page, platform, max_posts=max_posts)
            except Exception as e:
                import traceback
                print(f'[DC] video-list error {platform}: {e}')
                traceback.print_exc()

        # 4. Monetization / Revenue
        if monetization_url and not quick_mode:
            try:
                await page.goto(monetization_url, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(2500)
                rev = await _scrape_monetization(page)
                for k, v in rev.items():
                    if v is not None and (isinstance(v, bool) or v > 0 or isinstance(v, str)):
                        metrics[k] = v
            except Exception as e:
                print(f'[DC] monetization error {platform}: {e}')

        # 5. Extra pages (粉丝画像, 内容数据, etc.)
        for extra_url in ([] if quick_mode else entry.get('extra_pages', [])):
            try:
                await page.goto(extra_url, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(2000)
                extra_text = await page.evaluate('() => document.body.innerText')
                # Try to extract any numeric metrics from extra pages
                for key, pats in _METRIC_PATTERNS.items():
                    if key not in metrics or metrics.get(key, 0) == 0:
                        for pat in pats:
                            m = pat.search(extra_text[:6000])
                            if m:
                                val = _parse_metric_num(m.group(1))
                                if val > 0:
                                    metrics[key] = val
                                    break
            except Exception as e:
                print(f'[DC] extra-page error {extra_url}: {e}')

        # 6. Douyin API collection (richer data via internal APIs, no signature needed in browser context)
        if platform.upper() == 'DOUYIN':
            try:
                print(f'[DouyinAPI] Starting API-based collection...')
                await page.goto('https://www.douyin.com', wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(900 if quick_mode else 2000)

                api_result = await collect_douyin_data(
                    page, max_posts=max_posts, sleep_sec=sleep_sec, fetch_comments=False,
                    account_label=account_label  # 身份验证：多账号场景确认没串�?
                )
                if api_result.success:
                    # Log identity for audit
                    if api_result.detected_nickname:
                        ident_msg = f'[DouyinAPI] Detected: [{api_result.detected_nickname}]'
                        if account_label:
                            match_status = 'MATCH' if api_result.detected_nickname == account_label else 'MISMATCH'
                            ident_msg += f' (expected: [{account_label}], {match_status})'
                        print(ident_msg)
                    # Merge API data into metrics (API data is richer, prefer it over screen-scraped)
                    for k, v in api_result.metrics.items():
                        if v is not None and v != 0:
                            metrics[k] = v
                    # Replace video_stats if API returned more data
                    old_count = len(video_stats)
                    if api_result.video_stats and len(api_result.video_stats) > old_count:
                        video_stats = api_result.video_stats
                        print(f'[DouyinAPI] Replaced video_stats: {len(video_stats)} posts from API (was {old_count} from DOM)')
                    # Store extra data (hot search etc.)
                    if api_result.extra:
                        metrics['_api_extra'] = api_result.extra
                    print(f'[DouyinAPI] API collection SUCCESS: {len(api_result.video_stats)} posts, metrics={list(api_result.metrics.keys())}')
                else:
                    print(f'[DouyinAPI] API collection FAILED: {api_result.error}, keeping screen-scraped data')
            except Exception as e:
                print(f'[DouyinAPI] API collection exception: {e}, falling back to screen-scraped data')

    finally:
        try: await page.close()
        except: pass

    return {'metrics': metrics, 'video_stats': video_stats}


async def _safe_close_ctx(ctx):
    """Close a browser context and ignore already-closed errors."""
    if ctx is None:
        return
    try:
        await ctx.close()
    except Exception:
        pass


async def _scrape_one_account(
    pw,
    account_id: str,
    platform: str,
    profile_dir: Path,
    nickname: str = '',
    max_posts: int = _DEFAULT_QUICK_MAX_POSTS,
) -> dict:
    """Scrape one account with its saved storage state."""
    entry = PLATFORM_DASHBOARDS.get(platform)
    if not entry:
        return {'accountId': account_id, 'metrics': {}, 'videoStats': []}

    state_json = profile_dir / 'state.json'
    if not state_json.exists():
        print(f'[DC] No state.json for {nickname or account_id[:12]}, skipping')
        return {'accountId': account_id, 'metrics': {}, 'videoStats': []}

    context = None
    browser = None
    try:
        # Use persistent context per account (separate Chrome instance for cookie isolation)
        launch_kw = {
            'user_data_dir': str(profile_dir), 'headless': True,
            'viewport': {'width': 1280, 'height': 800}, 'locale': 'zh-CN',
            'args': ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        }
        if _BROWSER_PATH: launch_kw['executable_path'] = _BROWSER_PATH
        elif _BROWSER_CHANNEL: launch_kw['channel'] = _BROWSER_CHANNEL
        context = await pw.chromium.launch_persistent_context(**launch_kw)

        # Load cookies and localStorage from state.json (runs for both CDP and fallback paths)
        try:
            import json as _json
            state = _json.loads(state_json.read_text('utf-8'))
            if state.get('cookies'): await context.add_cookies(state['cookies'])
            # Restore localStorage from state.json origins (critical for WECHAT_VIDEO auth)
            # Without finder_login_token etc. in localStorage, WeChat Video shows login page
            for origin_entry in state.get('origins', []):
                origin_url = origin_entry.get('origin', '')
                ls_items = origin_entry.get('localStorage', [])
                if not origin_url or not ls_items:
                    continue
                try:
                    inject_page = await context.new_page()
                    await inject_page.goto(origin_url, wait_until='domcontentloaded', timeout=15000)
                    await inject_page.wait_for_timeout(1000)
                    # Build JS to inject all localStorage items (use JSON for safe escaping)
                    items_json = _json.dumps(
                        {item.get('name', ''): item.get('value', '') for item in ls_items},
                        ensure_ascii=False,
                    )
                    js_code = f'() => {{ const items = JSON.parse({json.dumps(items_json, ensure_ascii=False)}); for (const [k,v] of Object.entries(items)) {{ try {{ localStorage.setItem(k, v); }} catch(e) {{}} }} }}'
                    await inject_page.evaluate(js_code)
                    await inject_page.wait_for_timeout(500)
                    await inject_page.close()
                    print(f'[DC] Restored {len(ls_items)} localStorage items for {origin_url}')
                except Exception as ls_err:
                    print(f'[DC] localStorage restore warning for {origin_url}: {str(ls_err)[:100]}')
        except Exception: pass

        label = nickname or account_id[:12]
        print(f'[DC] Scraping {label} ({platform})...')
        post_limit = max_posts if isinstance(max_posts, int) and max_posts > 0 else 0
        douyin_sleep = 0.35 if post_limit else 1.5
        try:
            from local_db import is_first_collection
            if is_first_collection(account_id) and not post_limit:
                douyin_sleep = 2.0
                print(f'[DC] First collection for {label}, full pagination sleep=2.0s')
        except Exception as e:
            print(f'[DC] Error checking first collection for {label}: {e}')
        result = await _scrape_account_pages(context, platform, account_label=label, max_posts=post_limit, sleep_sec=douyin_sleep)
        # 提取刷新后的 Cookie，供上层上传到服务器
        fresh_cookies = []
        try:
            fresh_cookies = await context.cookies()
        except Exception:
            pass
        # After successful scrape, keep account active and mark collection time.
        # Condition: any meaningful data returned (metrics with any key, OR video_stats)
        # Do NOT require both �?metrics alone (e.g. follower_count) is enough to mark active
        metrics_ok = bool(result.get('metrics'))  # any non-empty metrics dict
        videos_ok = bool(result.get('video_stats'))
        if metrics_ok or videos_ok:
            try:
                from local_db import update_collection_time, update_status
                update_status(account_id, 'active')
                update_collection_time(account_id)
            except Exception:
                pass
        elif result.get('expired'):
            try:
                from local_db import update_status
                update_status(account_id, 'expired')
            except Exception:
                pass
            print(f'[DC] Cookie expired for {label}, needs re-scan')
        else:
            print(f'[DC] No data scraped for {label}; keeping current account status')
        return {'accountId': account_id, 'metrics': result['metrics'], 'videoStats': result['video_stats'], 'freshCookies': fresh_cookies}
    except Exception as e:
        print(f'[DC] scrape error {platform}/{account_id}: {str(e)[:120]}')
        return {'accountId': account_id, 'metrics': {}, 'videoStats': []}
    finally:
        if context:
            try:
                # 不要关闭伴侣 Chrome �?context（会导致整个浏览器崩掉）
                if not (browser and browser.contexts and context == browser.contexts[0]):
                    await context.close()
            except: pass


async def _scrape_all(accounts: list, max_posts: int = _DEFAULT_QUICK_MAX_POSTS, collection_mode: str = 'quick') -> list:
    """Scrape multiple accounts with isolated browser profiles."""
    global _collector_progress
    from playwright.async_api import async_playwright
    from local_db import get_profile_path

    results = []
    _collector_progress['total'] = len(accounts)
    _collector_progress['current'] = 0
    _collector_progress['mode'] = collection_mode
    _collector_progress['max_posts'] = max_posts

    async with async_playwright() as pw:
        for acc in accounts:
            _collector_progress['current'] += 1
            _collector_progress['nickname'] = acc.get('nickname', '')[:20]
            _collector_progress['phase'] = '仪表盘'
            _collector_progress['video_page'] = 0
            _collector_progress['video_count'] = 0
            aid = (acc.get('id') or '').strip()
            platform = (acc.get('platform') or '').strip().upper()
            if not aid or not platform:
                continue
            if platform not in PLATFORM_DASHBOARDS:
                continue
            profile_dir = get_profile_path(aid)
            if not profile_dir:
                print(f'[DC] No local profile for {aid}, skipping')
                continue

            result = await _scrape_one_account(
                pw, aid, platform, profile_dir,
                nickname=acc.get('nickname', ''),
                max_posts=max_posts,
            )
            results.append(result)

    return results


def _run_collection_once(
    max_posts: int = _DEFAULT_QUICK_MAX_POSTS,
    collection_mode: str = 'quick',
    trigger_type: str = 'manual',
):
    global _collector_running, _collector_last_run
    global _collector_last_error, _CONFIG_CACHE

    if not _collector_lock.acquire(blocking=False):
        _collector_last_error = 'Collection already running'
        print('[DC] Collection already running, skipping duplicate trigger')
        return

    _collector_running = True
    _collector_progress['mode'] = collection_mode
    _collector_progress['max_posts'] = max_posts
    run_id = None
    accounts_total = 0
    reported = 0
    video_reported = 0
    print('[DC] Stage 1: lock acquired, loading config', flush=True)
    try:
        cfg = _load_config()
        print(f'[DC] Stage 1a: config loaded, api_url={cfg.get("api_url","?")[:30]}', flush=True)
        _CONFIG_CACHE = cfg
        api_url = cfg.get('api_url', '').rstrip('/')
        token = cfg.get('token', '')

        if not api_url or not token:
            _collector_last_error = 'No backend token; running local-only collection'
            # Don't return �?allow collection to run locally even without valid token

        if api_url and not token:
            token = _login_with_saved_credentials(cfg)

        from local_db import (
            finish_collection_run,
            get_all_accounts,
            get_profile_path,
            start_collection_run,
            update_collection_time,
            update_nickname,
        )
        import requests
        run_id = start_collection_run(collection_mode, max_posts, trigger_type)

        # 从本�?DB 获取扢�有绑定的账号（含 expired �?不预判过期，实际试了再说�?        local_accounts = get_all_accounts(include_expired=True)
        print(f'[DC] Stage 1b: got {len(local_accounts)} local accounts', flush=True)
        if not local_accounts:
            print('[DC] Stage 4: collection complete, saving results', flush=True)
            _collector_last_run = time.strftime('%Y-%m-%d %H:%M:%S')
            _collector_last_error = None
            finish_collection_run(run_id, 'success', 0, 0, 0)
            return

        backend_account_ids = {}
        print(f'[DC] Stage 2: fetching remote accounts from API...', flush=True)
        if api_url and token:
            def fetch_remote_accounts(current_token: str):
                return requests.get(
                    f'{api_url}/platforms/accounts?take=200',
                    headers={'Authorization': f'Bearer {current_token}'},
                    timeout=15,
                )

            try:
                remote_resp = fetch_remote_accounts(token)
                if remote_resp.status_code == 401:
                    fresh_token = _login_with_saved_credentials(cfg)
                    if fresh_token:
                        token = fresh_token
                        remote_resp = fetch_remote_accounts(token)

                if remote_resp.status_code < 400:
                    body = remote_resp.json()
                    inner = body.get('data') or body
                    remote_accounts = inner.get('accounts') if isinstance(inner, dict) else []
                    by_platform_uid = {}
                    by_platform_uid_name = {}
                    by_platform_name = {}
                    for remote in remote_accounts or []:
                        remote_id = (remote.get('id') or '').strip()
                        remote_platform = (remote.get('platform') or '').strip().upper()
                        remote_uid = (remote.get('platformUserId') or '').strip()
                        remote_name = (remote.get('nickname') or '').strip()
                        if remote_id and remote_platform and remote_uid:
                            by_platform_uid[(remote_platform, remote_uid)] = remote_id
                            if remote_name:
                                by_platform_uid_name[(remote_platform, remote_uid)] = remote_name
                        if remote_id and remote_platform and remote_name:
                            by_platform_name[(remote_platform, remote_name)] = remote_id

                    for acc in local_accounts:
                        local_id = (acc.get('id') or '').strip()
                        local_platform = (acc.get('platform') or '').strip().upper()
                        local_uid = (acc.get('platform_uid') or '').strip()
                        local_name = (acc.get('nickname') or '').strip()
                        backend_id = (
                            by_platform_uid.get((local_platform, local_uid))
                            or by_platform_name.get((local_platform, local_name))
                        )
                        if backend_id:
                            backend_account_ids[local_id] = backend_id
                            remote_name = by_platform_uid_name.get((local_platform, local_uid))
                            if remote_name and remote_name != local_name:
                                try:
                                    update_nickname(local_id, remote_name)
                                    acc['nickname'] = remote_name
                                    print(f'[DC] Synced local nickname: {local_name} -> {remote_name}')
                                except Exception as e:
                                    print(f'[DC] Local nickname sync failed for {local_id}: {e}')
                            if backend_id != local_id:
                                print(f'[DC] Mapped local account {local_id} -> backend {backend_id}')
                else:
                    print(f'[DC] Cannot fetch backend accounts: HTTP {remote_resp.status_code}')
            except Exception as e:
                print(f'[DC] Backend account mapping failed: {str(e)[:120]}')

        # 构��采集列表（本地 DB 里的账号 + 后端平台类型�?
        accounts = []
        for acc in local_accounts:
            aid = acc['id']
            nickname = acc.get('nickname', '')
            accounts.append({
                'id': aid,
                'platform': acc['platform'],
                'nickname': nickname,
            })
        accounts_total = len(accounts)

        print(
            f'[DC] Stage 3: scraping {len(accounts)} accounts from local profiles '
            f'(mode={collection_mode}, max_posts={max_posts})',
            flush=True,
        )
        # Windows: daemon 线程�?asyncio.run() 可能卡死，手动管�?event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            scraped = loop.run_until_complete(_scrape_all(
                accounts,
                max_posts=max_posts,
                collection_mode=collection_mode,
            ))
        finally:
            try:
                # Clean up async generators before closing loop
                loop.run_until_complete(loop.shutdown_asyncgens())
            except Exception:
                pass
            loop.close()
            asyncio.set_event_loop(None)  # Prevent dangling loop reference on Windows

        def can_report_to_backend(local_account_id, backend_account_id):
            if not api_url or not token or not backend_account_id:
                return False
            if backend_account_ids.get(local_account_id):
                return True
            return not str(backend_account_id).startswith('local_')

        for item in scraped:
            local_account_id = item['accountId']
            backend_account_id = backend_account_ids.get(local_account_id, local_account_id)
            can_report = can_report_to_backend(local_account_id, backend_account_id)
            metrics = item['metrics']
            # Extract historical data before cleaning up
            history = metrics.pop('_history', []) if isinstance(metrics, dict) else []

            # ┢�┢� ALWAYS save to local DB first (even if backend is down) ┢�┢�
            try:
                from local_db import update_metrics, save_contents, save_history_snapshot
                update_metrics(local_account_id, metrics)
                vstats = item.get('videoStats') or []
                if vstats:
                    save_contents(local_account_id, vstats)
                save_history_snapshot(local_account_id)
                update_collection_time(local_account_id)
            except Exception as e:
                print(f'[DC] Local save error {local_account_id}: {e}')

            nickname = metrics.pop('_nickname', None) if isinstance(metrics, dict) else None
            avatar = metrics.pop('_avatar', None) if isinstance(metrics, dict) else None
            if nickname:
                try:
                    update_nickname(local_account_id, nickname)
                except Exception as e:
                    print(f'[DC] Local nickname update failed for {local_account_id}: {e}')

            if can_report and metrics and any(v for v in metrics.values() if isinstance(v, (int, float))):
                payload = {'accountId': backend_account_id,
                           'metrics': {
                               **metrics,
                               **({'_nickname': nickname} if nickname else {}),
                               **({'_avatar': avatar} if avatar else {}),
                           }}
                try:
                    r = requests.post(
                        f'{api_url}/platforms/report-metrics',
                        json=payload,
                        headers={'Authorization': f'Bearer {token}'},
                        timeout=30,
                    )
                    if r.status_code < 400:
                        reported += 1
                        update_collection_time(local_account_id)
                    else:
                        print(
                            f'[DC] Report HTTP {r.status_code} for '
                            f'{local_account_id}->{backend_account_id}: {r.text[:200]}')
                except Exception as e:
                    print(f'[DC] Report error {local_account_id}->{backend_account_id}: {e}')

            # Report historical data (7-day / 30-day) if available
            if can_report and history:
                for hist_entry in history:
                    hist_date = hist_entry.pop('date', None)
                    if not hist_date:
                        continue
                    try:
                        r = requests.post(
                            f'{api_url}/platforms/report-metrics',
                            json={
                                'accountId': backend_account_id,
                                'metrics': hist_entry,
                                'date': hist_date,
                            },
                            headers={'Authorization': f'Bearer {token}'},
                            timeout=30,
                        )
                    except Exception as e:
                        print(f'[DC] History report error {local_account_id}->{backend_account_id} {hist_date}: {e}')

        # Report per-video stats
        for item in scraped:
            local_account_id = item['accountId']
            backend_account_id = backend_account_ids.get(local_account_id, local_account_id)
            can_report = can_report_to_backend(local_account_id, backend_account_id)
            vstats = item.get('videoStats') or []
            if not vstats:
                continue
            if not can_report:
                print(f'[DC] Skipping backend video report for local-only account {local_account_id}')
                continue
            try:
                r = requests.post(
                    f'{api_url}/platforms/report-post-stats',
                    json={'accountId': backend_account_id, 'posts': vstats},
                    headers={'Authorization': f'Bearer {token}'},
                    timeout=30,
                )
                if r.status_code < 400:
                    video_reported += len(vstats)
                else:
                    print(
                        f'[DC] Video report HTTP {r.status_code} for '
                        f'{local_account_id}->{backend_account_id}: {r.text[:200]}')
            except Exception as e:
                print(f'[DC] Video report error {local_account_id}->{backend_account_id}: {e}')

        # Sync avatars extracted from dashboard
        for item in scraped:
            local_account_id = item['accountId']
            backend_account_id = backend_account_ids.get(local_account_id, local_account_id)
            can_report = can_report_to_backend(local_account_id, backend_account_id)
            m = item.get('metrics', {})
            m.pop('_nickname', None)
            avatar = m.pop('_avatar', None)
            if can_report and avatar:
                try:
                    r = requests.put(
                        f'{api_url}/accounts/{backend_account_id}',
                        json={'avatar': avatar},
                        headers={'Authorization': f'Bearer {token}'},
                        timeout=15,
                    )
                    if r.status_code < 400:
                        print(f'[DC] Synced avatar for {local_account_id}->{backend_account_id}')
                except Exception as e:
                    print(f'[DC] Avatar sync error {local_account_id}->{backend_account_id}: {e}')

        # Upload fresh cookies to server (keeps DataSyncScheduler alive)
        cookies_uploaded = 0
        for item in scraped:
            local_account_id = item['accountId']
            backend_account_id = backend_account_ids.get(local_account_id, local_account_id)
            can_report = can_report_to_backend(local_account_id, backend_account_id)
            fresh_cookies = item.get('freshCookies') or []
            if can_report and fresh_cookies and not str(backend_account_id).startswith('local_'):
                try:
                    cookie_list = [
                        {'name': c.get('name',''), 'value': c.get('value',''), 'domain': c.get('domain',''),
                         'path': c.get('path','/'), 'expires': c.get('expires', -1),
                         'httpOnly': c.get('httpOnly', False), 'secure': c.get('secure', False),
                         'sameSite': c.get('sameSite', 'Lax')}
                        for c in fresh_cookies if c.get('name')
                    ]
                    if cookie_list:
                        r = requests.post(
                            f'{api_url}/accounts/{backend_account_id}/cookies',
                            json={'cookies': cookie_list},
                            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                            timeout=15,
                        )
                        if r.status_code == 200:
                            cookies_uploaded += 1
                        else:
                            print(f'[DC] Cookie upload HTTP {r.status_code} for {backend_account_id}')
                except Exception as e:
                    print(f'[DC] Cookie upload error for {backend_account_id}: {e}')
        if cookies_uploaded:
            print(f'[DC] Uploaded cookies for {cookies_uploaded} accounts')

        print('[DC] Stage 4: collection complete, saving results', flush=True)
        _collector_last_run = time.strftime('%Y-%m-%d %H:%M:%S')
        _collector_last_error = None
        finish_collection_run(run_id, 'success', accounts_total, reported, video_reported)
        # 仅对采集成功的账号更�?cookie 状��（失败/过期的跳过，避免虚假时间�?
        platform_map = {'DOUYIN':'douyin','XIAOHONGSHU':'xiaohongshu','KUAISHOU':'kuaishou','WECHAT_VIDEO':'tencent'}
        success_account_ids = set()
        for item in scraped:
            if item.get('metrics') or item.get('videoStats'):
                success_account_ids.add(item.get('accountId', ''))
        if success_account_ids:
            for acc in local_accounts:
                if acc.get('id') in success_account_ids:
                    key = platform_map.get(acc.get('platform', ''))
                    if key:
                        _record_scan_time(key)
        print(f'[DC] Done: {reported}/{len(scraped)} reported')
    except Exception as e:
        _collector_last_error = str(e)
        print(f'[DC] Fatal: {e}')
        try:
            from local_db import finish_collection_run
            finish_collection_run(run_id, 'error', accounts_total, reported, video_reported, str(e))
        except Exception:
            pass
    finally:
        _collector_running = False
        _collector_lock.release()


def _get_collection_interval() -> int:
    # Return seconds until next collection based on time of day.
    now = time.localtime()
    hour = now.tm_hour
    if 8 <= hour < 20:
        return 30 * 60  # daytime: 30 min
    else:
        # Nighttime (20:00 - 8:00): sleep until 8:00 AM next day
        target = time.struct_time((now.tm_year, now.tm_mon, now.tm_mday, 8, 0, 0,
                                   now.tm_wday, now.tm_yday, now.tm_isdst))
        target_ts = time.mktime(target)
        if hour >= 20:
            target_ts += 86400  # after 8 PM, target is tomorrow 8 AM
        return max(60, int(target_ts - time.mktime(now)))

def _data_collector_loop():
    # Background scheduler.
    if _collector_next_run_at is None:
        _schedule_next_collection()
    while True:
        wait_seconds = (_collector_next_run_at or 0) - time.time()
        if wait_seconds > 0:
            time.sleep(min(5, max(1, wait_seconds)))
            continue
        try:
            _run_collection_once(
                _collector_schedule_max_posts,
                _collector_schedule_mode,
                'scheduled',
            )
        except Exception as e:
            print(f'[DC] Loop error: {e}')
        interval = _schedule_next_collection()
        print(
            f'[DC] Next scheduled {(_collector_schedule_mode or "quick")} collection '
            f'in {interval // 60} min (hour={time.localtime().tm_hour})'
        )

_collector_loop_lock = threading.Lock()
_collector_loop_started = False


# ══════════════════════════════════════════════════════════════════
# Shared Playwright login worker (scan-bind)
# ══════════════════════════════════════════════════════════════════

def _make_login_worker(platform, info, queue, ctrl_queue, api_url, token, use_sse=False, session_id=None):
    # Create a scan-bind login worker.
    def login_worker():
        async def _run():
            context = None
            page = None
            browser = None
            scan_profile_dir = None
            try:
                if not _CDP_URL and info['key'] != 'WECHAT_VIDEO':
                    err_msg = 'Chrome CDP 未启动，请先解决 Chrome 启动问题后重试'
                    if use_sse:
                        queue.put(json.dumps({'type':'error','data':err_msg}))
                    return
                from playwright.async_api import async_playwright
                from local_db import PROFILE_ROOT, add_account, get_or_create_profile_dir, update_status

                async with async_playwright() as pw:
                    if info['key'] == 'WECHAT_VIDEO':
                        import shutil as _shutil
                        scan_profile_dir = PROFILE_ROOT / f'_scan_wechat_{session_id or uuid.uuid4().hex[:8]}'
                        try:
                            resolved_root = PROFILE_ROOT.resolve()
                            resolved_scan = scan_profile_dir.resolve()
                            if scan_profile_dir.exists() and resolved_root in resolved_scan.parents:
                                _shutil.rmtree(scan_profile_dir, ignore_errors=True)
                        except Exception:
                            pass
                        scan_profile_dir.mkdir(parents=True, exist_ok=True)
                        launch_kw = {
                            'user_data_dir': str(scan_profile_dir),
                            'headless': False,
                            'viewport': {'width': 1280, 'height': 800},
                            'locale': 'zh-CN',
                            'args': ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--lang=zh-CN'],
                        }
                        if _BROWSER_PATH:
                            launch_kw['executable_path'] = _BROWSER_PATH
                        elif _BROWSER_CHANNEL:
                            launch_kw['channel'] = _BROWSER_CHANNEL
                        context = await pw.chromium.launch_persistent_context(**launch_kw)
                    else:
                        try:
                            browser = await pw.chromium.connect_over_cdp(_CDP_URL)
                        except Exception as e:
                            err_msg = f'无法连接 Chrome CDP: {str(e)[:100]}'
                            if use_sse:
                                queue.put(json.dumps({'type':'error','data':err_msg}))
                            if session_id:
                                scan_status[session_id] = 'error'
                                scan_errors[session_id] = err_msg
                            return

                        # 复用已有 context（单窗口模式），不再每次 new_context 弢�新窗�?                        existing = browser.contexts
                        context = None
                        if existing:
                            try:
                                context = existing[0]
                                # 关掉 about:blank 占位 tab
                                for p in list(context.pages):
                                    if 'about:blank' in p.url or not p.url or p.url == 'about:blank':
                                        try: await p.close()
                                        except: pass
                            except Exception:
                                context = None

                        if context is None:
                            context = await browser.new_context(
                                viewport={'width': 1280, 'height': 800},
                                locale='zh-CN',
                            )
                    # �?Cookie 隔离不同平台登录
                    try:
                        await context.clear_cookies()
                    except Exception:
                        print('[Worker] clear_cookies failed, creating new context')
                        try: await context.close()
                        except: pass
                        context = await browser.new_context(
                            viewport={'width': 1280, 'height': 800},
                            locale='zh-CN',
                        )

                    page = await context.new_page()  # TAB，不是新窗口
                    page.on('popup', lambda popup: asyncio.ensure_future(popup.close()))

                    if use_sse:
                        queue.put(json.dumps({'type':'browser','data':'浏览器已打开'}))

                    if info['key'] == 'WECHAT_VIDEO':
                        try:
                            await page.goto('https://channels.weixin.qq.com', wait_until='domcontentloaded', timeout=15000)
                            await page.evaluate('''async () => {
                                try { localStorage.clear(); } catch (e) {}
                                try { sessionStorage.clear(); } catch (e) {}
                                try {
                                    if (window.indexedDB && indexedDB.databases) {
                                        const dbs = await indexedDB.databases();
                                        await Promise.all((dbs || []).map(db => db && db.name ? new Promise(resolve => {
                                            const req = indexedDB.deleteDatabase(db.name);
                                            req.onsuccess = req.onerror = req.onblocked = () => resolve();
                                        }) : Promise.resolve()));
                                    }
                                } catch (e) {}
                                try {
                                    if (window.caches) {
                                        const names = await caches.keys();
                                        await Promise.all(names.map(name => caches.delete(name)));
                                    }
                                } catch (e) {}
                            }''')
                            await page.wait_for_timeout(500)
                        except Exception as e:
                            print(f'[Worker] WECHAT_VIDEO storage clear warning: {str(e)[:100]}')

                    await page.goto(info['url'], wait_until='domcontentloaded', timeout=30000)
                    await page.wait_for_timeout(8000)
                    await page.wait_for_load_state("networkidle")
                    await page.wait_for_timeout(3000)

                    if use_sse:
                        try:
                            screenshot = await page.screenshot(type='png')
                            b64 = base64.b64encode(screenshot).decode()
                            queue.put(json.dumps({'type':'qr_code','data':f'data:image/png;base64,{b64}'}))
                        except:
                            pass
                        queue.put(json.dumps({'type':'status','data':'请在 Chrome 窗口中完成扫码登录，然后回到此页面点"已完成登录"'}))

                    wechat_login_markers = (
                        '视频号ID', '数据中心', '内容管理', '视频管理', '视频数据',
                        '互动管理', '直播', '收入与服务', '带货助手',
                    )

                    for i in range(600):
                        await page.wait_for_timeout(500)
                        try:
                            msg = ctrl_queue.get_nowait()
                            if msg == 'EXTRACT_COOKIES':
                                print('[Worker] Received EXTRACT_COOKIES, extracting...')
                                break
                            if msg == 'CANCEL':
                                if use_sse:
                                    queue.put(json.dumps({'type':'error','data':'用户取消'}))
                                if page:
                                    try: await page.close()
                                    except: pass
                                return
                        except Empty:
                            pass
                        if info['key'] == 'WECHAT_VIDEO' and i >= 8 and i % 4 == 0:
                            try:
                                probe_text = await _get_page_text(page)
                                marker_count = sum(1 for marker in wechat_login_markers if marker in probe_text)
                                if 'login.html' not in (page.url or '') and marker_count >= 2:
                                    print(f'[Worker] WECHAT_VIDEO login auto-detected: url={page.url} markers={marker_count}', flush=True)
                                    break
                            except Exception:
                                pass
                    else:
                        if use_sse:
                            queue.put(json.dumps({"type":"error","data":"操作超时，请重试"}))
                        if page:
                            try: await page.close()
                            except: pass
                        return
                    if use_sse:
                        queue.put(json.dumps({'type':'status','data':'正在提取信息...'}))

                    # ┢�┢� 提取页面信息（不再提�?cookie 字符串）┢�┢�
                    if info['key'] == 'WECHAT_VIDEO':
                        try:
                            await page.goto('https://channels.weixin.qq.com/platform', wait_until='domcontentloaded', timeout=30000)
                            await page.wait_for_timeout(6000)
                            page_text_check = await _get_page_text(page)
                            marker_count = sum(1 for marker in wechat_login_markers if marker in page_text_check)
                            if 'login.html' in page.url or marker_count < 2:
                                err_msg = '未检测到有效的视频号后台登录态，请等后台首页完全加载后再点“已完成登录”'
                                print(f'[Worker] WECHAT_VIDEO login validation failed: url={page.url} markers={marker_count}')
                                if use_sse:
                                    queue.put(json.dumps({'type':'error','data':err_msg}))
                                if session_id:
                                    scan_status[session_id] = 'error'
                                    scan_errors[session_id] = err_msg
                                if page:
                                    try: await page.close()
                                    except: pass
                                return
                        except Exception as e:
                            err_msg = f'验证视频号登录��失�? {str(e)[:80]}'
                            print(f'[Worker] WECHAT_VIDEO login validation error: {str(e)[:120]}')
                            if use_sse:
                                queue.put(json.dumps({'type':'error','data':err_msg}))
                            if session_id:
                                scan_status[session_id] = 'error'
                                scan_errors[session_id] = err_msg
                            if page:
                                try: await page.close()
                                except: pass
                            return

                    cookies = await context.cookies()
                    page_text = await _get_page_text(page)
                    try:
                        with open(Path(tempfile.gettempdir()) / 'pixingyun_page.txt', 'w', encoding='utf-8') as f:
                            f.write(page_text[:5000])
                    except: pass

                    if not cookies:
                        if use_sse:
                            queue.put(json.dumps({'type':'error','data':'未获取到 Cookie，请�?Chrome 窗口中确认已登录'}))
                        if page:
                            try: await page.close()
                            except: pass
                        return

                    # Scrape real ID and nickname from the logged-in page
                    import re, requests
                    page_text = await page.evaluate('() => document.body.innerText')
                    try:
                        with open(Path(tempfile.gettempdir()) / 'pixingyun_page.txt', 'w', encoding='utf-8') as f:
                            f.write(page_text[:3000])
                    except: pass
                    real_id = ''
                    nickname = None
                    m = re.search(r'视频号ID[:\s]*(\S+)', page_text)
                    if m:
                        real_id = m.group(1).strip()
                    lines = page_text.split('\n')
                    for i, line in enumerate(lines):
                        if '视频号ID' in line and i >= 2:
                            for j in range(i-1, max(i-4, -1), -1):
                                c = _sanitize_text(lines[j].strip())
                                if c and len(c) > 1 and len(c) < 30 and not c.isdigit() and c not in ('视频号', '视频号助手', '微信'):
                                    nickname = c
                                    break
                            break
                    # 抖音�?
                    if not real_id:
                        m = re.search(r'抖音号[:\s]*(\S+)', page_text)
                        if m:
                            real_id = m.group(1).strip()
                            if not nickname:
                                # 抖音号上方��常是昵�?
                                for i, line in enumerate(lines):
                                    if '抖音号' in line and i >= 1:
                                        for j in range(i-1, max(i-3, -1), -1):
                                            c = _sanitize_text(lines[j].strip())
                                            if c and 2 < len(c) < 30 and not c.isdigit():
                                                nickname = c
                                                break
                                        break
                    # 快手�?
                    if not real_id:
                        m = re.search(r'快手号[:\s]*(\S+)', page_text)
                        if m:
                            real_id = m.group(1).strip()
                    # 小红书号
                    if not real_id:
                        m = re.search(r'小红书号[:\s]*(\S+)', page_text)
                        if m:
                            real_id = m.group(1).strip()

                    if not nickname and real_id:
                        nickname = real_id
                    if not nickname:
                        nickname = _sanitize_text(info['name'])

                    platform_uid = real_id if real_id else f"{platform}_{int(time.time())}"
                    platform_key = info['key']  # DOUYIN / WECHAT_VIDEO etc.

                    # ┢�┢� 后端注册（尽力��为，失败不阻断本地流程）─┢�
                    import requests as req
                    existing_id = None
                    data = {'code': -1, 'message': 'Backend unavailable'}  # default: backend failed
                    try:
                        check_resp = req.get(
                            f"{api_url.rstrip('/')}/accounts",
                            headers={'Authorization': f'Bearer {token}'},
                            timeout=10,
                        )
                        if check_resp.status_code == 200:
                            for acc in ((check_resp.json().get('data') or {}).get('accounts') or []):
                                if acc.get('platformUserId') == platform_uid or (acc.get('nickname') == nickname and acc.get('platform') == platform_key):
                                    existing_id = acc.get('id')
                                    break
                    except Exception:
                        pass  # Backend unreachable; proceed with local-only

                    account_id = existing_id
                    if existing_id:
                        try:
                            resp = req.put(
                                f"{api_url.rstrip('/')}/accounts/{existing_id}",
                                json={'nickname': nickname, 'cookies': ''},
                                headers={'Authorization': f'Bearer {token}','Content-Type': 'application/json'},
                                timeout=15,
                            )
                            if resp.status_code == 200:
                                account_id = (resp.json().get('data') or {}).get('id') or existing_id
                        except Exception:
                            pass
                    else:
                        try:
                            resp = req.post(
                                f"{api_url.rstrip('/')}/accounts",
                                json={'platform': platform_key, 'platformUserId': platform_uid,
                                      'nickname': nickname, 'cookies': ''},
                                headers={'Authorization': f'Bearer {token}','Content-Type': 'application/json'},
                                timeout=15,
                            )
                            if resp.status_code in (200, 201):
                                account_id = (resp.json().get('data') or {}).get('id')
                        except Exception:
                            pass

                    # ┢�┢� 上传 Cookie 到服务器（让后端 DataSyncScheduler 也能使用）─┢�
                    if account_id and not account_id.startswith('local_') and cookies:
                        try:
                            cookie_list = [
                                {'name': c['name'], 'value': c['value'], 'domain': c.get('domain', ''),
                                 'path': c.get('path', '/'), 'expires': c.get('expires', -1),
                                 'httpOnly': c.get('httpOnly', False), 'secure': c.get('secure', False),
                                 'sameSite': c.get('sameSite', 'Lax')}
                                for c in cookies
                            ]
                            upload_resp = req.post(
                                f"{api_url.rstrip('/')}/accounts/{account_id}/cookies",
                                json={'cookies': cookie_list},
                                headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                                timeout=15,
                            )
                            if upload_resp.status_code == 200:
                                print(f'[Worker] Cookie uploaded to server: {len(cookie_list)} cookies for account {account_id}')
                            else:
                                print(f'[Worker] Cookie upload failed: {upload_resp.status_code} {upload_resp.text[:200]}')
                        except Exception as e:
                            print(f'[Worker] Cookie upload error (non-fatal): {e}')

                    # ┢�┢� 存入本地 DB + 保存 Profile 状��?┢�┢�
                    #  即使后端注册失败，本地也要保存（矩阵管理是离线优先架构）
                    if not account_id:
                        # Check local DB for existing account with same platform_uid
                        from local_db import get_accounts_by_platform
                        local_accounts = get_accounts_by_platform(platform_key)
                        for la in local_accounts:
                            if la.get('platform_uid') == platform_uid:
                                account_id = la['id']
                                print(f'[Worker] Reusing existing local account {account_id} for uid {platform_uid}')
                                break
                        if not account_id:
                            import uuid as _uuid
                            account_id = f'local_{_uuid.uuid4().hex[:16]}'
                            print(f'[Worker] Backend unreachable, using local ID: {account_id}')
                    
                    # Always save locally (regardless of backend status)
                    profile_dir = get_or_create_profile_dir(account_id, platform_key)
                    add_account(account_id, platform_key, profile_dir.name,
                            platform_uid=platform_uid, nickname=nickname)
                    try:
                        update_status(account_id, 'active')
                    except Exception:
                        pass
                    # CDP 模式：保�?storage_state �?Profile 目录，供 _scrape_all 使用
                    target_profile = str(profile_dir)
                    Path(target_profile).mkdir(parents=True, exist_ok=True)
                    state_path = Path(target_profile) / 'state.json'
                    await context.storage_state(path=str(state_path))
                    print(f'[Worker] Storage state saved: {state_path}')

                    # Save cookie freshness info alongside state.json
                    try:
                        cookie_info = {
                            'last_cookie_refresh': time.strftime('%Y-%m-%d %H:%M:%S'),
                            'cookie_age_seconds': 0,
                        }
                        cookie_info_path = Path(target_profile) / 'cookie_info.json'
                        cookie_info_path.write_text(json.dumps(cookie_info, ensure_ascii=False))
                    except Exception as e:
                        print(f'[Worker] Cookie info save warning: {e}')

                    # ┢�┢� Cookie 已在 state.json 中持久化，无霢�额外固化步骤 ┢�┢�
                    # state.json 可供 _scrape_one_account 通过 storage_state 加载

                    # 立即采集初始数据
                    metrics = {}
                    # 判断是否已在仪表盘（有数据内容就行，不依赖URL判断�?
                    has_dashboard = any(kw in page_text[:2000]
                        for kw in ['关注者', '粉丝', '数据中心', 'dashboard', '粉丝数据'])
                    if has_dashboard:
                        try:
                            m_f = re.search(r'关注者\s*(\d[\d,.]*)', page_text)
                            if m_f: metrics['followers'] = _parse_metric_num(m_f.group(1))
                            m_f2 = re.search(r'粉丝\s*(?:\n\s*)?([\d,.]+[万wW]?)', page_text[:3000])
                            if m_f2 and 'followers' not in metrics:
                                metrics['followers'] = _parse_metric_num(m_f2.group(1))

                            yd_start = page_text.find('昨日数据')
                            if yd_start > 0:
                                yd = page_text[yd_start:yd_start+500]
                                for label, key in [('净增关注','newFollowers'),('新增播放','newViews'),('新增评论','newComments'),('新增分享','newShares')]:
                                    m = re.search(rf'{label}\s*([\d,.]+[万wW]?)', yd)
                                    if m: metrics[key] = _parse_metric_num(m.group(1))
                                # 新增❤️ / 新增(行尾) �?likes，排除已被上述前缢�匹配的行
                                m_like = re.search(r'新增(?!播放|评论|分享)\s*([\d,.]+[万wW]?)', yd)
                                if m_like: metrics['newLikes'] = _parse_metric_num(m_like.group(1))

                            # Deep scrape
                            extra = {}
                            try:
                                extra = await _scrape_account_pages(
                                    context,
                                    platform_key,
                                    max_posts=_DEFAULT_QUICK_MAX_POSTS,
                                    sleep_sec=0.35,
                                )
                            except Exception as e:
                                print(f'[DC] deep scrape error {platform_key}: {e}')
                            for k, v in extra.get('metrics', {}).items():
                                prefer_video_period = platform_key == 'WECHAT_VIDEO' and k in {
                                    '_periodMetrics',
                                    'newViews', 'newLikes', 'newComments', 'newShares', 'newFollowers',
                                    'views', 'likes', 'comments', 'shares',
                                }
                                if v is not None and (prefer_video_period or k not in metrics or metrics.get(k, 0) == 0):
                                    metrics[k] = v

                            # Save deep scrape results to local DB immediately
                            extra_metrics = extra.get('metrics', {})
                            if extra_metrics or extra.get('video_stats'):
                                try:
                                    from local_db import update_metrics, save_contents, save_history_snapshot, update_collection_time
                                    update_metrics(account_id, extra_metrics)
                                    vstats = extra.get('video_stats') or []
                                    if vstats:
                                        save_contents(account_id, vstats)
                                    save_history_snapshot(account_id)
                                    update_collection_time(account_id)
                                except Exception as e:
                                    print(f'[DC] Local DB save error {account_id}: {e}')

                            # Extract historical data before reporting
                            history = metrics.pop('_history', []) if isinstance(metrics, dict) else []
                            can_report_initial = bool(
                                api_url and token and account_id
                                and not str(account_id).startswith('local_')
                            )

                            if can_report_initial and metrics:
                                req.post(f"{api_url.rstrip('/')}/platforms/report-metrics",
                                    json={'accountId': account_id, 'metrics': metrics},
                                    headers={'Authorization': f'Bearer {token}'}, timeout=30)

                            # Report historical data (7-day / 30-day)
                            if can_report_initial and history:
                                for hist_entry in history:
                                    hist_date = hist_entry.pop('date', None)
                                    if not hist_date:
                                        continue
                                    try:
                                        req.post(
                                            f'{api_url}/platforms/report-metrics',
                                            json={'accountId': account_id, 'metrics': hist_entry, 'date': hist_date},
                                            headers={'Authorization': f'Bearer {token}'}, timeout=30,
                                        )
                                    except Exception:
                                        pass

                            vstats = extra.get('video_stats') or []
                            if can_report_initial and vstats and account_id:
                                try:
                                    req.post(
                                        f'{api_url}/platforms/report-post-stats',
                                        json={'accountId': account_id, 'posts': vstats},
                                        headers={'Authorization': f'Bearer {token}'}, timeout=30,
                                    )
                                except Exception:
                                    pass

                            if use_sse:
                                f_count = metrics.get('followers', '?')
                                v_count = metrics.get('views', '?')
                                p_count = len(vstats)
                                queue.put(json.dumps({'type':'status','data':f'数据已采集 粉丝{f_count} 播放{v_count} 视频{p_count}条'}))
                        except Exception as e:
                            if use_sse:
                                queue.put(json.dumps({'type':'status','data':f'数据采集失败: {str(e)[:80]}'}))

                    if platform_key == 'WECHAT_VIDEO' and scan_profile_dir:
                        try:
                            source_profile = Path(scan_profile_dir).resolve()
                            target_profile_path = Path(target_profile).resolve()
                            profile_root = PROFILE_ROOT.resolve()
                            if profile_root in source_profile.parents and profile_root in target_profile_path.parents:
                                source_state = source_profile / 'state.json'
                                await context.storage_state(path=str(source_state))
                                source_cookie_info = source_profile / 'cookie_info.json'
                                source_cookie_info.write_text(json.dumps({
                                    'last_cookie_refresh': time.strftime('%Y-%m-%d %H:%M:%S'),
                                    'cookie_age_seconds': 0,
                                    'profile_persisted': True,
                                }, ensure_ascii=False), encoding='utf-8')
                                if page:
                                    try: await page.close()
                                    except: pass
                                    page = None
                                if context:
                                    try: await context.close()
                                    except: pass
                                    context = None
                                import shutil as _shutil
                                if target_profile_path.exists():
                                    _shutil.rmtree(target_profile_path, ignore_errors=True)
                                _shutil.copytree(source_profile, target_profile_path, dirs_exist_ok=True)
                                print(f'[Worker] WECHAT_VIDEO full profile persisted: {target_profile_path}')
                        except Exception as e:
                            print(f'[Worker] WECHAT_VIDEO full profile persist warning: {str(e)[:120]}')

                    upload_ok = data.get('code') == 0 or bool(account_id)
                    upload_err = f"上传失败: {data.get('message','未知错误')}"
                    if upload_ok:
                        _record_scan_time(platform)
                    if use_sse:
                        if upload_ok:
                            queue.put(json.dumps({'type':'success','data':{'platform':platform,'cookies_count':len(cookies),'account_id':account_id}}))
                        else:
                            queue.put(json.dumps({'type':'error','data':upload_err}))

                    # 只关 page，不�?context（会杢��?CDP 浏览器）
                    if page:
                        try: await page.close()
                        except: pass

                    if session_id:
                        scan_status[session_id] = 'done' if upload_ok else 'error'
                        if upload_ok:
                            scan_errors.pop(session_id, None)
                        else:
                            scan_errors[session_id] = upload_err
                        if session_id in active_sessions: del active_sessions[session_id]
            except Exception as e:
                import traceback
                err_full = traceback.format_exc()
                try:
                    with open(Path(tempfile.gettempdir()) / 'pixingyun_error.log', 'w', encoding='utf-8') as f:
                        f.write(err_full)
                except: pass
                if session_id:
                    scan_status[session_id] = 'error'
                    scan_errors[session_id] = f'浏览器异�? {str(e)[:200]}'
                    if session_id in active_sessions: del active_sessions[session_id]
                if use_sse:
                    queue.put(json.dumps({'type':'error','data':f'浏览器异�? {str(e)[:200]}'}))

        asyncio.run(_run())
    return login_worker


# ══════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return make_response(UI_HTML)


@app.route('/health')
def health():
    resp = make_response(jsonify({'status':'ok','version':APP_VERSION,'platforms':list(PLATFORMS.keys())}))
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


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
    print(f'[ConfirmLogin] sid={sid} in_sessions={sid in active_sessions} total_sessions={len(active_sessions)}', flush=True)
    if sid in active_sessions:
        active_sessions[sid].put('EXTRACT_COOKIES')
        scan_status[sid] = 'uploading'
        scan_errors.pop(sid, None)
        print(f'[ConfirmLogin] EXTRACT_COOKIES sent to ctrl_queue, status=uploading', flush=True)
        return jsonify({'code':0,'msg':'ok'})
    print(f'[ConfirmLogin] SESSION NOT FOUND! active_keys={list(active_sessions.keys())}')
    return jsonify({'code':404,'msg':'session not found'}), 404


@app.route('/api/scan-bind/poll/<session_id>')
def scan_bind_poll(session_id):
    st = scan_status.get(session_id, 'not_found')
    return jsonify({'status': st, 'msg': scan_errors.get(session_id, '')})


@app.route('/api/cancel-scan', methods=['POST'])
def cancel_scan():
    sid = request.json.get('session_id', '') if request.is_json else request.args.get('session_id', '')
    if sid in active_sessions:
        active_sessions[sid].put('CANCEL')
        scan_errors.pop(sid, None)
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
    if not _CDP_URL:
        return jsonify({'code':503,'msg':'Chrome CDP 未就绪，请先解决 Chrome 启动问题'}), 503

    info = PLATFORMS[platform]
    session_id = uuid.uuid4().hex[:12]
    queue = Queue()
    active_sessions[session_id] = queue
    scan_status[session_id] = 'browser'
    scan_errors.pop(session_id, None)

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
    active_sessions[session_id] = ctrl_queue  # confirm_login puts to ctrl_queue
    scan_status[session_id] = 'browser'
    scan_errors.pop(session_id, None)
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
                except:
                    yield f"data: {json.dumps({'type':'status','data':str(msg)})}\n\n"
            elif isinstance(msg, dict):
                yield f"data: {json.dumps(msg)}\n\n"

    resp = Response(sse_stream(), mimetype='text/event-stream',
                    headers={'Cache-Control':'no-cache','X-Accel-Buffering':'no',
                             'Access-Control-Allow-Origin':'*'})
    @resp.call_on_close
    def cleanup():
        active_sessions.pop(session_id, None)
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
            run_async(open_login_window(store.get('profile_id') or local_id, _BROWSER_PATH, _BROWSER_CHANNEL))
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
    doudian_jobs[job_id] = {
        'status': 'running',
        'store_id': local_id,
        'store_name': store.get('name'),
        'started_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'message': '采集中',
    }

    def _worker():
        try:
            with _doudian_sync_lock:
                result = _run_doudian_store_sync(local_id, api_url, token)
            doudian_jobs[job_id].update({
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
            doudian_jobs[job_id].update({
                'status': 'error',
                'message': msg,
                'finished_at': time.strftime('%Y-%m-%d %H:%M:%S'),
            })

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({'code': 0, 'job_id': job_id, 'msg': '抖店同步已开始'})


@app.route('/api/doudian/jobs/<job_id>')
def doudian_job_status(job_id):
    job = doudian_jobs.get(job_id)
    if not job:
        return jsonify({'code': 404, 'msg': '任务不存在'}), 404
    return jsonify({'code': 0, 'data': job})


@app.route('/api/doudian/schedule')
def doudian_schedule_status():
    now = time.time()
    countdown = max(0, int((_doudian_next_run_at or now) - now)) if _doudian_next_run_at else None
    next_run_at_text = (
        time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(_doudian_next_run_at))
        if _doudian_next_run_at
        else None
    )
    return jsonify({
        'code': 0,
        'data': {
            'started': _doudian_scheduler_started,
            'running': _doudian_sync_lock.locked(),
            'interval_seconds': _doudian_schedule_interval,
            'next_run_at': next_run_at_text,
            'countdown_seconds': countdown,
            'last_run': _doudian_last_run,
            'last_error': _doudian_last_error,
        },
    })


# ══════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    import threading, sys, os, time, urllib.request, webbrowser

    no_cdp = '--no-cdp' in sys.argv

    if no_cdp:
        _CDP_URL = None
        print('=' * 50)
        print('  披星云伴侣 v3.1 (纯浏览器模式)')
        print('  警告: 此模式下扫码绑定功能不可用')
        print('=' * 50)
        print(f'[Main] 启动 Flask http://localhost:5409 ...')
        _ensure_doudian_scheduler_started()
        app.run(host='127.0.0.1', port=5409, debug=False)
        sys.exit(0)

    print('=' * 50)
    print('  披星云桌面伴侣 v3.1 (单窗口 CDP 模式)')
    print('=' * 50)

    APP_URL = 'http://localhost:5409'

    # ┢�┢� 1. 先启�?Flask ┢�┢�
    def start_flask():
        app.run(host='127.0.0.1', port=5409, debug=False)

    flask_thread = threading.Thread(target=start_flask, daemon=True)
    flask_thread.start()

    # 等待 Flask 就绪
    print('[Main] 等待 Flask 就绪...')
    deadline = time.time() + 10
    flask_ready = False
    while time.time() < deadline:
        try:
            urllib.request.urlopen(APP_URL, timeout=1)
            flask_ready = True
            break
        except Exception:
            time.sleep(0.3)
    if not flask_ready:
        print('[Main] 错误: Flask 启动超时')
        sys.exit(1)
    print('[Main] Flask 就绪')
    _ensure_doudian_scheduler_started()

    # ┢�┢� 2. 启动 CDP Chrome ┢�┢�
    cdp_ready = False
    try:
        print('[Main] 启动 Chrome（含 CDP 调试端口 + app 窗口�?..')
        _cdp.start(open_url=APP_URL, app_mode=True)
        _CDP_URL = _cdp.get_url()
        cdp_ready = True
        print(f'[Main] Chrome 就绪 | CDP: {_CDP_URL} | App: {APP_URL}')
    except Exception as e:
        print(f'[Main] Chrome 启动失败: {e}')
        webbrowser.open(APP_URL)
        print('[Main] 回���到系统浏览器')
        _CDP_URL = None

    # ┢�┢� 3. 等待用户关闭 ┢�┢�
    # Start the scheduler countdown on launch. It does not collect immediately;
    # the first scheduled quick collection happens after the normal interval.
    if _load_config().get('auto_collect_on_start') is True:
        def _auto_start_collector():
            global _collector_loop_started
            time.sleep(15)  # Wait for auto-login to complete
            with _collector_loop_lock:
                if _collector_loop_started:
                    return
                _collector_loop_started = True
                _schedule_next_collection()
                print('[Main] Auto-starting background collector now, then scheduled quick collection')
                threading.Thread(
                    target=_run_collection_once,
                    args=(_DEFAULT_QUICK_MAX_POSTS, 'quick', 'auto_start'),
                    daemon=True,
                ).start()
                threading.Thread(target=_data_collector_loop, daemon=True).start()
        threading.Thread(target=_auto_start_collector, daemon=True).start()
    else:
        with _collector_loop_lock:
            if not _collector_loop_started:
                _collector_loop_started = True
                _schedule_next_collection()
                threading.Thread(target=_data_collector_loop, daemon=True).start()
        print('[Main] Background collector countdown started; scheduled mode=quick, max_posts=20')

    try:
        while (cdp_ready and _cdp.is_running) or (not cdp_ready):
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        print('[Main] 正在关闭...')
        _cdp.stop()

