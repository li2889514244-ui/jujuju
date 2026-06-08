"""
披星云桌面伴侣 v2.4 — 带 UI 界面，一键扫码 + 自动数据采集
用法: python companion_app.py
"""
import asyncio, json, os, re, sys, tempfile, threading, time, uuid, base64
from pathlib import Path
from queue import Queue, Empty
from flask import Flask, request, jsonify, Response, make_response, send_from_directory
from pixing_worker import start_worker, stop_worker, get_status as get_worker_status
from chrome_cdp import ChromeCDP
from douyin_api_collector import collect_douyin_data

# ── AES-256-GCM encryption helpers ─────────────────────────────
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
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent.resolve()
    STATIC_DIR = str(BASE_DIR / '_internal' / 'static')
else:
    BASE_DIR = Path(__file__).parent.resolve()
    STATIC_DIR = 'static'
app = Flask(__name__, static_folder=STATIC_DIR)

# ── 平台配置 ──────────────────────────────────────────────────
PLATFORMS = {
    'douyin':   {'name':'抖音','url':'https://creator.douyin.com/','key':'DOUYIN'},
    'xiaohongshu': {'name':'小红书','url':'https://creator.xiaohongshu.com/','key':'XIAOHONGSHU'},
    'kuaishou': {'name':'快手','url':'https://cp.kuaishou.com/','key':'KUAISHOU'},
    'tencent':  {'name':'视频号','url':'https://channels.weixin.qq.com/','key':'WECHAT_VIDEO'},
}

# ── 浏览器检测 ──────────────────────────────────────────────
def _find_browser():
    """检测可用浏览器，返回 (executable_path, channel) 或 (None, channel_name)"""
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

# ── CDP 模式 Chrome 实例 ───────────────────────────────────────
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


# ── 持久化浏览器 Profile ─────────────────────────────────────
_PROFILE_ROOT = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'MatrixFlow' / 'browser-profiles'


async def _get_persistent_context(headless: bool = True, extra_args: list = None) -> tuple:
    """返回 (context, page) — 使用持久化 profile，抖音不再每次跳验证"""
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

# ── HTML UI ──────────────────────────────────────────────────
UI_HTML = r'''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>披星云伴侣</title>
<style>
:root{--sidebar-w:220px;--sidebar-bg:#141829;--sidebar-hover:#1e2640;--sidebar-active:#2a3558;--accent:#4f6ef7;--accent-hover:#3d5bd9;--danger:#e05050;--success:#34c759;--text:#1d1d1f;--text2:#6e6e73;--border:#e5e5ea;--bg:#f2f2f7;--card-bg:#ffffff;--radius:6px}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden}
body{font-family:"Segoe UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif;background:var(--bg);color:var(--text);font-size:13px;user-select:none;-webkit-user-select:none;display:flex}

/* ── Sidebar ── */
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
.btn-pw{background:rgba(255,149,0,.12);color:#ffb84d}
.btn-pw:hover{background:rgba(255,149,0,.2)}

/* ── Content Area ── */
.content{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
.content-toolbar{display:flex;align-items:center;gap:12px;padding:14px 24px;background:var(--card-bg);border-bottom:1px solid var(--border);min-height:52px}
.content-toolbar h2{font-size:15px;font-weight:600;color:var(--text)}
.content-toolbar .online-dot{width:7px;height:7px;border-radius:50%;margin-left:auto}
.content-body{flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center}

/* ── Login Panel (centered) ── */
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

/* ── Main Workspace ── */
.workspace{width:100%;max-width:640px}
.workspace-empty{text-align:center;padding:60px 20px;color:var(--text2)}
.workspace-empty .empty-icon{font-size:48px;margin-bottom:16px;opacity:.4}
.workspace-empty h3{font-size:16px;color:var(--text);margin-bottom:8px}
.workspace-empty p{font-size:13px;line-height:1.7}

/* ── Status States ── */
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

/* ── Account List ── */
.acct-list{margin-top:20px}
.acct-list h4{font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
.acct-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f3;font-size:12px}
.acct-row .acct-platform{background:var(--accent);color:#fff;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:500;flex-shrink:0}
.acct-row .acct-name{flex:1;color:var(--text);font-weight:500}
.acct-row .acct-time{color:var(--text2);font-size:11px;flex-shrink:0}
.acct-row .acct-del{color:var(--danger);font-size:11px;cursor:pointer;flex-shrink:0;padding:2px 6px;border-radius:3px}
.acct-row .acct-del:hover{background:rgba(224,80,80,.1)}

/* ── Cookie Alerts ── */
.cookie-alert{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#fff8e1;border-radius:var(--radius);margin-top:6px;font-size:11px}
.cookie-alert.warn{background:#fff3f3}
</style></head><body>

<!-- ═══ SIDEBAR ═══ -->
<aside class="sidebar">
  <div class="sidebar-logo">
    <div class="logo-icon">&#10025;</div>
    <span class="logo-text">披星云</span>
    <span class="logo-ver">v3.1</span>
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
      <span>{{siteConnected?'已连接 MatrixFlow':'等待连接...'}}</span>
    </div>
    <div class="sidebar-footer-btns">
      <button class="btn-collect" @click="triggerCollect" :disabled="collecting">{{collecting?'采集中...':'触发采集'}}</button>
    </div>
    <div class="collect-progress" v-if="dcProgress && dcProgress.running" style="padding:8px 12px;font-size:11px;color:#8890b0">
      <div style="margin-bottom:4px">{{dcProgress.progress?.nickname||'采集'}} ({{dcProgress.progress?.current||0}}/{{dcProgress.progress?.total||0}})</div>
      <div style="margin-bottom:4px">{{dcProgress.progress?.phase||''}}</div>
      <div class="progress-bar" style="background:rgba(255,255,255,.08);height:3px;border-radius:2px">
        <div class="fill" :style="{width:Math.round((dcProgress.progress?.current||0)/(dcProgress.progress?.total||1)*100)+'%',height:'100%',background:'var(--accent)',borderRadius:'2px'}"></div>
      </div>
      <div v-if="dcProgress.progress?.video_page>1" style="margin-top:3px;font-size:10px">视频第{{dcProgress.progress.video_page}}页 / {{dcProgress.progress.video_count}}条</div>
    </div>
  </div>
</aside>

<!-- ═══ CONTENT ═══ -->
<main class="content">

  <!-- Toolbar -->
  <header class="content-toolbar" v-if="configured">
    <h2>{{selectedPlatform?selectedPlatform.name+' - 扫码绑定':'选择左侧平台开始操作'}}</h2>
    <div class="online-dot" :style="{background:siteConnected?'#34c759':'#ff9500'}"></div>
  </header>

  <div class="content-body">

    <!-- ── Login Screen ── -->
    <div class="login-wrapper" v-if="!configured">
      <div class="login-card">
        <div class="login-logo">
          <div class="li">&#10025;</div>
          <h1>披星云伴侣</h1>
          <p>多平台矩阵账号管理桌面工具</p>
        </div>
        <div class="field"><label>邮箱</label><input v-model="loginEmail" placeholder="输入邮箱" @keyup.enter="doLogin"></div>
        <div class="field"><label>密码</label><input v-model="loginPass" type="password" placeholder="输入密码" @keyup.enter="doLogin"></div>
        <label class="field-check"><input type="checkbox" v-model="rememberPwd">记住密码（自动登录）</label>
        <div class="login-err" v-if="loginError">{{loginError}}</div>
        <button class="login-btn" @click="doLogin" :disabled="loginLoading">{{loginLoading?'登录中...':'登 录'}}</button>
      </div>
    </div>

    <!-- ── Workspace (after login) ── -->
    <div class="workspace" v-if="configured">

      <!-- Empty / idle state -->
      <div class="workspace-empty" v-if="status==='idle'&&!selected">
        <div class="empty-icon">&#8592;</div>
        <h3>选择平台开始</h3>
        <p>在左侧导航栏选择一个平台<br>Chrome 浏览器将自动打开对应平台的登录页</p>
      </div>

      <!-- Idle with platform selected -->
      <div class="scan-card" v-if="status==='idle'&&selected">
        <div class="scan-title">{{selectedPlatform.name}} 扫码绑定</div>
        <div class="step-list">
          <div class="step-row"><span class="step-num">1</span>打开 MatrixFlow 网站并登录</div>
          <div class="step-row"><span class="step-num">2</span>点击"添加账号"按钮</div>
          <div class="step-row"><span class="step-num">3</span>网站自动连接桌面伴侣</div>
          <div class="step-row"><span class="step-num">4</span>Chrome 弹出 → 手机扫码登录</div>
        </div>
        <div style="margin-top:20px">
          <button class="btn btn-primary" @click="selectPlatform(selected)">开始绑定</button>
        </div>
      </div>

      <!-- Loading -->
      <div class="scan-card" v-if="status==='loading'">
        <div class="spinner"></div>
        <p style="color:var(--text2);font-size:13px">正在启动浏览器...</p>
        <div class="progress-bar"><div class="fill" :style="{width:progress+'%'}"></div></div>
      </div>

      <!-- Browser open -->
      <div class="scan-card" v-if="status==='browser'">
        <div class="result-ok success">&#10003;</div>
        <p class="result-msg" style="font-weight:600">Chrome 浏览器已打开</p>
        <p style="color:var(--text2);font-size:13px;margin:8px 0">请在 Chrome 窗口中完成扫码登录</p>
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
        <p class="result-sub">刷新 MatrixFlow 网页即可看到新账号</p>
        <button class="btn btn-primary mt12" @click="reset">继续绑定其他平台</button>
      </div>

      <!-- Error -->
      <div class="scan-card" v-if="status==='error'">
        <p class="result-err">{{errorMsg}}</p>
        <button class="btn btn-primary" @click="reset">重试</button>
      </div>

      <!-- Account list -->
      <div class="acct-list" v-if="localAccounts.length">
        <h4>已绑定账号 ({{localAccounts.length}})</h4>
        <div class="acct-row" v-for="a in localAccounts" :key="a.id">
          <span class="acct-platform">{{a.platform}}</span>
          <span class="acct-name">{{a.nickname||a.platform_uid||a.id.slice(0,8)}}</span>
          <span class="acct-time">{{a.last_collected_at?a.last_collected_at.slice(11,16):'待采集'}}</span>
          <span class="acct-time" v-if="a.status==='expired'">需重扫</span>
          <span class="acct-del" @click="removeLocalAccount(a.id)">删除</span>
        </div>
      </div>

    </div>
  </div>
</main>

<script src="/static/vue.global.prod.js"></script>
<script>
const {createApp}=Vue
createApp({data(){return{
  platforms:[{id:'douyin',name:'抖音',icon:'🎵',hint:'扫码登录'},{id:'xiaohongshu',name:'小红书',icon:'📕',hint:'扫码登录'},{id:'kuaishou',name:'快手',icon:'🎬',hint:'扫码登录'},{id:'tencent',name:'视频号',icon:'📺',hint:'微信扫码'}],
  selected:'',status:'idle',qrUrl:'',errorMsg:'',siteConnected:false,evtSource:null,progress:0,timer:null,platformFromUrl:'',tokenFromUrl:'',apiFromUrl:'',sessionId:'',
  configured:false,loginEmail:'',loginPass:'',loginLoading:false,loginError:'',rememberPwd:true,loginHint:'',
  cookieStatus:null,cookieAlerts:[],cookieFreshness:'',collecting:false,
  dcProgress:null,_dcPollTimer:null,
  pwRunning:false,pwCompleted:0,pwTask:'',
  localAccounts:[],
}},computed:{selectedPlatform(){return this.platforms.find(p=>p.id===this.selected)}},
methods:{
  async fetchPixingStatus(){try{const r=await fetch('/api/pixing-worker/status');const j=await r.json();this.pwRunning=j.running;this.pwCompleted=j.completed;this.pwTask=j.current_task||''}catch(e){}},
  async togglePixingWorker(){const url=this.pwRunning?'/api/pixing-worker/stop':'/api/pixing-worker/start';await fetch(url,{method:'POST'});await this.fetchPixingStatus()},
  async triggerCollect(){this.collecting=true;try{await fetch('/api/data-collection/trigger',{method:'POST'});this._startProgressPoll()}catch(e){this.collecting=false}},
  _startProgressPoll(){const self=this;self._stopProgressPoll();self._dcPollTimer=setInterval(async()=>{try{const r=await fetch('/api/data-collection/status');const j=await r.json();self.dcProgress=j;if(!j.running){self._stopProgressPoll();self.collecting=false}}catch(e){}},1500)},
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
    if(!id){this.errorMsg='请选择平台';return}
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
        else if(s.status==='error'){this.status='error';this.errorMsg='上传失败，请重试';clearInterval(poll)}
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
            cfg = json.loads(CONFIG_FILE.read_text(encoding='utf-8'))
            # Decrypt saved_password if encrypted (format: nonce:ciphertext)
            if cfg.get('saved_password') and ':' in cfg['saved_password'] and _HAS_CRYPTO:
                try:
                    key = _get_encryption_key()
                    cfg['saved_password'] = _decrypt_password(cfg['saved_password'], key)
                except Exception:
                    pass  # Legacy plaintext or wrong key — keep as-is
            return cfg
        except Exception:
            pass
    # 首次启动：生成默认配置（不会覆盖已有配置，升级安全）
    default = {'api_url': 'https://ddddkiii.com/api/v1', 'token': ''}
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
            pass  # Can't encrypt — save plaintext as last resort
    CONFIG_FILE.write_text(json.dumps(safe_cfg, ensure_ascii=False, indent=2),
                           encoding='utf-8')


_CONFIG_CACHE = _load_config()


def _login_with_saved_credentials(cfg: dict) -> str:
    """Return a fresh access token using the saved login, or an empty string."""
    import requests as req

    email = cfg.get('saved_email', '')
    password = cfg.get('saved_password', '')
    api_url = cfg.get('api_url', 'https://ddddkiii.com/api/v1').rstrip('/')
    if not email or not password or not api_url:
        return ''
    try:
        r = req.post(
            f'{api_url}/auth/login',
            json={'email': email, 'password': password},
            timeout=15,
        )
        if r.status_code not in (200, 201):
            print(f'[Auth] Saved-login failed: HTTP {r.status_code}')
            return ''

        body = r.json()
        inner = body.get('data') or body
        token = inner.get('accessToken') or inner.get('access_token') or ''
        refresh_token = inner.get('refreshToken') or inner.get('refresh_token') or ''
        if not token:
            return ''

        cfg['token'] = token
        if refresh_token:
            cfg['refreshToken'] = refresh_token
        _save_config(cfg)
        _CONFIG_CACHE.update(cfg)
        return token
    except Exception as e:
        print(f'[Auth] Saved-login error: {str(e)[:120]}')
        return ''

PLATFORM_DASHBOARDS = {
    'DOUYIN': {
        'url': 'https://creator.douyin.com',
        'domain': '.douyin.com',
        'data_center': 'https://creator.douyin.com/creator-micro/data/content',
        'video_list': 'https://creator.douyin.com/creator-micro/content/manage',
        'monetization': 'https://creator.douyin.com/creator-micro/revenue/monetize',
        'creator_center': 'https://creator.douyin.com/creator-micro/creation',  # 创作中心→发布管理
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

# Progress tracking for UI
_collector_progress = {
    'total': 0, 'current': 0, 'nickname': '',
    'phase': '', 'video_page': 0, 'video_count': 0
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


# ══════════════════════════════════════════════════════════════════
# Scan-bind session store
# ══════════════════════════════════════════════════════════════════
active_sessions = {}  # session_id -> queue
scan_status = {}  # session_id -> status (browser/uploading/done/error)


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
                    cfg['saved_password'] = password
                _save_config(cfg)
                _CONFIG_CACHE.update(cfg)
                # 自动启动数字人视频 worker
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
        return jsonify({'error': f'无法连接服务器: {str(e)[:80]}'})

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
    email = cfg.get('saved_email', '')
    password = cfg.get('saved_password', '')
    if not email or not password:
        return jsonify({'configured': bool(cfg.get('token'))})
    api_url = cfg.get('api_url', 'https://ddddkiii.com/api/v1')
    try:
        r = req.post(f'{api_url}/auth/login', json={'email': email, 'password': password}, timeout=15)
        if r.status_code in (200, 201):
            body = r.json()
            inner = body.get('data') or body
            token = inner.get('accessToken') or inner.get('access_token') or ''
            refresh_token = inner.get('refreshToken') or inner.get('refresh_token') or ''
            if token:
                cfg['token'] = token
                if refresh_token:
                    cfg['refreshToken'] = refresh_token
                _save_config(cfg)
                _CONFIG_CACHE.update(cfg)
                return jsonify({'configured': True, 'message': '自动登录成功'})
    except: pass
    return jsonify({'configured': bool(cfg.get('token'))})

@app.route('/api/config', methods=['GET', 'POST'])
def handle_config():
    global _CONFIG_CACHE
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        cfg = _load_config()
        for key in ('api_url', 'token'):
            if key in data:
                cfg[key] = data[key].strip() if isinstance(data[key], str) else str(data[key])
        _save_config(cfg)
        _CONFIG_CACHE = cfg
        return jsonify({'status': 'ok'})
    safe = {k: v for k, v in _CONFIG_CACHE.items() if k not in ('token', 'saved_password', 'refreshToken', 'accessToken', 'saved_password')}
    if _CONFIG_CACHE.get('token'):
        safe['token_set'] = True
    if _CONFIG_CACHE.get('saved_email'):
        safe['saved_email'] = _CONFIG_CACHE['saved_email']
    safe['configured'] = bool(_CONFIG_CACHE.get('token'))
    return jsonify(safe)


@app.route('/api/data-collection/status')
def data_collection_status():
    cookie_status = _get_cookie_status()
    return jsonify({
        'running': _collector_running,
        'configured': bool(_CONFIG_CACHE.get('api_url')
                           and _CONFIG_CACHE.get('token')),
        'last_run': _collector_last_run,
        'last_error': _collector_last_error,
        'cookies_age_hours': cookie_status,
        'progress': _collector_progress,
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
    # 首次触发时启动后台定时循环
    if not _collector_loop_started:
        _collector_loop_started = True
        threading.Thread(target=_data_collector_loop, daemon=True).start()
    if _collector_running:
        return jsonify({'status': 'already_running'})
    # 立即执行一次采集
    t = threading.Thread(target=_run_collection_once, daemon=True)
    t.start()
    return jsonify({'status': 'started'})


# ══════════════════════════════════════════════════════════════════
# 本地账号管理 API（1账号1Profile 架构）
# ══════════════════════════════════════════════════════════════════
@app.route('/api/local-accounts')
def local_accounts_list():
    """列出所有本地绑定的账号"""
    from local_db import get_all_accounts
    accounts = get_all_accounts(include_expired=True)
    return jsonify({'code': 0, 'data': accounts})


@app.route('/api/local-accounts/<account_id>', methods=['DELETE'])
def local_accounts_delete(account_id):
    """删除本地账号绑定（Profile 目录保留，只标记删除）"""
    from local_db import remove_account, get_profile_path
    profile = get_profile_path(account_id)
    remove_account(account_id)
    # 可选：也删除 Profile 目录
    if profile and profile.exists():
        import shutil
        try:
            shutil.rmtree(str(profile), ignore_errors=True)
        except: pass
    return jsonify({'code': 0, 'msg': 'deleted'})


@app.route('/api/local-accounts/<account_id>/rebind', methods=['POST'])
def local_accounts_rebind(account_id):
    """重新扫码绑定某个账号（刷新 cookie）"""
    from local_db import get_account
    acc = get_account(account_id)
    if not acc:
        return jsonify({'code': 404, 'msg': '账号不存在'}), 404
    # 触发扫码流程（使用现有 scan-bind 机制）
    return jsonify({'code': 0, 'msg': '请在桌面伴侣中重新扫码', 'platform': acc['platform']})


# ══════════════════════════════════════════════════════════════════
# Metric extraction (data collector)
# ══════════════════════════════════════════════════════════════════

_METRIC_PATTERNS = {
    'followers': [
        # 抖音/douyin specific: profile section "粉丝\n159" or "粉丝：159"
        re.compile(r'(?:^|\n)粉丝\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
        re.compile(r'粉丝数?\s*[：:]\s*([\d,.]+[万wW]?)'),
        # 视频号: 关注者4764
        re.compile(r'关注者\s*(\d[\d,.]*)'),
    ],
    'following': [
        # Use MULTILINE to anchor to line start, avoid matching nav/sidebar "关注"
        re.compile(r'(?:^|\n)关注\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
    ],
    'likes': [
        # 获赞 might be on its own line: "获赞\n132" or "获赞：132"
        re.compile(r'(?:^|\n)获赞\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
        re.compile(r'点赞\s*[：:]\s*([\d,.]+[万wW]?)'),
        re.compile(r"新增\s*([\d,.]+[万wW]?)"),
        re.compile(r'总获赞\s*[：:]?\s*([\d,.]+[万wW]?)'),
    ],
    'views': [
        # 可参考播放量 / 播放量 — must be at line start to avoid matching recommendations
        re.compile(r'(?:^|\n)(?:可)?参考播放量\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
        re.compile(r'(?:^|\n)播放量\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
        # 视频号: 新增播放\n4
        re.compile(r'新增播放\s*([\d,.]+[万wW]?)'),
    ],
    'comments': [
        re.compile(r'评论\s*[：:]\s*([\d,.]+[万wW]?)'),
    ],
    'shares': [
        re.compile(r'分享\s*[：:]\s*([\d,.]+[万wW]?)'),
    ],
}

# Store-specific metric patterns (抖店/微信小店/小红书商家)
_STORE_METRIC_PATTERNS = {
    'buyerCount': [
        re.compile(r'成交人数\s*[：:]?\s*([\d,.]+[万wW]?)'),
        re.compile(r'支付人数\s*[：:]?\s*([\d,.]+[万wW]?)'),
        re.compile(r'下单人数\s*[：:]?\s*([\d,.]+[万wW]?)'),
        re.compile(r'买家数\s*[：:]?\s*([\d,.]+[万wW]?)'),
    ],
    'productCount': [
        re.compile(r'在售商品\s*[：:]?\s*([\d,.]+)'),
        re.compile(r'商品数\s*[：:]?\s*([\d,.]+)'),
        re.compile(r'在线商品\s*[：:]?\s*([\d,.]+)'),
    ],
    'avgOrderValue': [
        re.compile(r'客单价\s*[：:]?\s*¥?\s*([\d,.]+)'),
        re.compile(r'笔单价\s*[：:]?\s*¥?\s*([\d,.]+)'),
    ],
    'storeScore': [
        # 抖店体验分 (usually 0-100 or 0-5)
        re.compile(r'店铺体验分\s*[：:]?\s*([\d.]+)'),
        re.compile(r'体验分\s*[：:]?\s*([\d.]+)'),
        re.compile(r'商家体验分\s*[：:]?\s*([\d.]+)'),
        # 微信小店评分
        re.compile(r'店铺评分\s*[：:]?\s*([\d.]+)'),
        re.compile(r'综合评分\s*[：:]?\s*([\d.]+)'),
        # 小红书店铺分
        re.compile(r'店铺分\s*[：:]?\s*([\d.]+)'),
        re.compile(r'商家分\s*[：:]?\s*([\d.]+)'),
    ],
    'storeDiagnosis': [
        # Store diagnosis text — grab the section after "店铺诊断" label
        re.compile(r'店铺诊断[：:]\s*(.{10,200}?)(?:\n|$)'),
        re.compile(r'诊断结果[：:]\s*(.{10,200}?)(?:\n|$)'),
        re.compile(r'经营诊断[：:]\s*(.{10,200}?)(?:\n|$)'),
    ],
}


def _sanitize_text(s: str) -> str:
    """Remove garbled characters from scraped text (double-encoding cleanup)"""
    if not s: return ''
    try:
        # Try to fix common double-encoding: latin-1 bytes interpreted as UTF-8
        fixed = s.encode('latin-1', errors='replace').decode('utf-8', errors='replace')
        if fixed.count('�') < s.count('�'):
            return fixed
    except: pass
    # Replace any remaining replacement chars with empty
    return s.replace('�', '').strip()


def _parse_metric_num(s: str) -> int:
    s = s.strip().replace(',', '').replace(' ', '')
    if s.endswith(('万', 'w', 'W')):
        return int(float(s[:-1]) * 10000)
    try:
        return int(float(s))
    except ValueError:
        return 0


async def _get_page_text(page) -> str:
    """Extract full page text, penetrating wujie-app shadow DOM if present.
    WeChat Video (channels.weixin.qq.com) uses <wujie-app> micro-frontend
    that renders content inside shadowRoot — document.body.innerText alone
    only gets sidebar text (~967 chars), missing the actual page content."""
    try:
        text = await page.evaluate('''() => {
            const w = document.querySelector('wujie-app');
            if (w && w.shadowRoot) {
                const body = w.shadowRoot.querySelector('body');
                if (body) return body.innerText;
            }
            return document.body.innerText;
        }''')
        return text
    except:
        return await page.evaluate('() => document.body.innerText')


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


async def _scrape_dashboard(page) -> dict:
    text = await _get_page_text(page)
    # Strip "关于腾讯" footer
    idx = text.find('关于腾讯')
    if idx > 0:
        text = text[:idx]
    metrics = {}

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

    # ── 昨日数据 (Yesterday's metrics) ──
    yd_start = text.find('昨日数据')
    if yd_start > 0:
        yd = text[yd_start:yd_start+800]
        # 净增关注: exact match
        m = re.search(r'净增关注\s*([\d,.]+[万wW]?)', yd)
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
        # 新增 (standalone, after 新增评论 and 新增分享 check — treat as likes)
        m = re.search(r'新增\s*([\d,.]+[万wW]?)\s*(?:\n|$)', yd)
        if m: metrics['newLikes'] = _parse_metric_num(m.group(1))

    # ── Nickname & Avatar ──
    try:
        info = await page.evaluate('''() => {
            const result = { nickname: null, avatar: null };
            // Penetrate wujie-app shadow DOM for 视频号
            const w = document.querySelector('wujie-app');
            const root = (w && w.shadowRoot) ? w.shadowRoot : document;
            const body = root.querySelector('body') || document.body;
            const text = body.innerText;
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

            // Strategy 1: Find real display name (line before 抖音号/快手号/小红书号 label)
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
                const clean = title.replace(/[\\-|–—].*$/, '').replace(/创作者中心|创作服务平台|数据平台|抖音|快手|小红书|视频号助手|腾讯视频号/g, '').trim();
                const platformUINames = ['视频号助手', '视频号', '微信', '抖音创作服务平台', '快手创作者中心'];
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
                    src.includes('kuaishou') || src.includes('xhscdn') || src.includes('xiaohongshu')) {
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

    # Try to find yesterday's data section first (most reliable)
    yd_match = re.search(r'昨日数据([\s\S]*?)(?:近7天|近30天|$)', text[:8000])
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
            // Penetrate wujie-app shadow DOM for 视频号
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
                # Column mapping varies by platform — try heuristics
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

    result['_history'] = history
    return result


async def _scrape_video_list(page, platform: str) -> list:
    """从视频号作品列表页提取每条视频的播放/点赞/评论。
    穿透 wujie-app shadow DOM，遍历全部页（最多 9 页，每页 20 条）。"""
    global _collector_progress
    import hashlib
    
    await page.wait_for_timeout(6000)
    
    all_videos = []
    seen_titles = set()
    
    page_num = 1
    while True:
        # Wait for content to load
        await page.wait_for_timeout(3000 if page_num == 1 else 2500)
        
        # Extract from shadow DOM body text
        videos = await page.evaluate('''() => {
            const w = document.querySelector('wujie-app');
            if (!w || !w.shadowRoot) return [];
            const body = w.shadowRoot.querySelector('body');
            if (!body) return [];
            const text = body.innerText || '';
            if (text.length < 200) return [];  // page didn't load
            
            const lines = text.split('\\n').filter(l => l.trim());
            const results = [];
            // Pattern: title line -> date line (YYYY年MM月DD日) -> numbers
            for (let i = 0; i < lines.length; i++) {
                if (/\\d{4}年\\d{2}月\\d{2}日/.test(lines[i]) &&
                    i > 0 && lines[i-1].length > 5) {
                    const title = lines[i-1].trim().substring(0, 80);
                    const date = lines[i].trim();
                    // Collect numbers from next 1-4 lines (play count, likes, etc.)
                    const numbers = [];
                    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                        const nums = lines[j].match(/[\\d,.]+[万wW]?/g);
                        if (nums) numbers.push(...nums);
                    }
                    if (title && !title.includes('下一页') && !title.includes('上一页')) {
                        results.push({ title, date, numbers: numbers.slice(0, 5) });
                    }
                }
            }
            return results;
        }''')
        
        skip = ['管理','设置','登录','退出','首页','数据中心','内容','互动',
                '运营','变现','服务','通知','帮助','咨询','规范','协议',
                '帮上热门','昨日数据','关注者','视频号ID','Tencent','©',
                '草稿','主页','活动','直播','图文','音乐','音频','关于腾讯',
                '视频号助手','公众号','微信','扫码','确认','刷新','过期',
                '平台','创作者','原创','声明','原创声明','声明原创']
        
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
        
        # Click "下一页" inside wujie-app shadow DOM
        _collector_progress['video_page'] = page_num
        _collector_progress['video_count'] = len(all_videos)
        clicked = await _wujie_click_text(page, '下一页')
        page_num += 1
        if not clicked:
            break
    
    # Trim to top 50 to avoid overwhelming local DB (162 videos is a lot)
    return all_videos


async def _scrape_monetization(page) -> dict:
    """Extract revenue/monetization metrics from creator monetization page
    Supports 抖音变现中心, 快手变现, etc."""
    result = {}
    text = await page.evaluate('() => document.body.innerText')

    patterns = {
        'revenue': [
            re.compile(r'累计收入\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'总收益\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'预估收入\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'本月收入\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
        ],
        'gmv': [
            re.compile(r'GMV\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'成交金额\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'销售额\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
        ],
        'orders': [
            re.compile(r'订单数\s*[：:]?\s*([\d,.]+[万wW]?)'),
            re.compile(r'成交单数\s*[：:]?\s*([\d,.]+[万wW]?)'),
        ],
        'commission': [
            re.compile(r'佣金\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'带货佣金\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
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
        rev_patterns = ['收入','收益','GMV','成交','订单','佣金','销售额','带货','变现']
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
    """Scrape detailed store metrics from store backend pages.
    Covers 抖店(fxg.jinritemai.com), 微信小店(store.weixin.qq.com), 小红书商家(seller.xiaohongshu.com)"""
    result = {'revenue': 0, 'gmv': 0, 'orders': 0, 'commission': 0,
              'buyerCount': 0, 'productCount': 0, 'avgOrderValue': 0,
              'storeScore': None, 'storeDiagnosis': None, '_storeName': None}

    try:
        text = await _get_page_text(page)
        search_text = text[:10000]

        # 1. Basic monetization (reuse existing patterns)
        mon_patterns = {
            'revenue': [
                re.compile(r'累计收入\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'总收益\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'成交金额\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
            ],
            'gmv': [
                re.compile(r'GMV\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'销售额\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'交易额\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
            ],
            'orders': [
                re.compile(r'订单数\s*[：:]?\s*([\d,.]+[万wW]?)'),
                re.compile(r'成交单数\s*[：:]?\s*([\d,.]+[万wW]?)'),
                re.compile(r'支付订单\s*[：:]?\s*([\d,.]+[万wW]?)'),
            ],
            'commission': [
                re.compile(r'佣金\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'预计佣金\s*[：:]?\s*¥?\s*([\d,.]+[万wW]?)'),
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
            re.compile(r'店铺名称\s*[：:]\s*(\S.{2,30})'),
            re.compile(r'小店名称\s*[：:]\s*(\S.{2,30})'),
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
            store_patterns = ['店铺名','收入','GMV','成交','订单','佣金','买家','商品','客单价','体验分','评分','诊断','销售额','支付人数','在售']
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


async def _scrape_account_pages(context, platform: str, account_label: str = '') -> dict:
    """Scan once, grab all pages in a single authenticated session.
    Navigates dashboard → data center → video list → monetization.
    account_label: 账号标签(如"唐商披星"), 用于日志审计防止多账号串号
    Returns {'metrics': {...}, 'video_stats': [...]}"""
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

    try:
        # 1. Dashboard
        await page.goto(url, wait_until='domcontentloaded', timeout=30000)
        try:
            await page.wait_for_selector('[class*=content], [class*=main], [role=main], main', timeout=15000)
        except:
            await page.wait_for_timeout(15000)

        # Check if we landed on a login page (cookie expired / invalid)
        current_url = page.url.lower()
        page_title = (await page.title()).lower() if hasattr(page, 'title') else ''
        login_keywords = ['login', 'qrcode', 'qr_code', 'scan', 'passport',
                          'signin', 'authorize', 'verify']
        if any(kw in current_url for kw in login_keywords):
            print(f'[DC] {platform}: redirected to login page (url={current_url[:80]}), skipping')
            return {'metrics': {}, 'video_stats': [], 'expired': True}

        # Also check page title for login indicators
        login_titles = ['登录', 'sign in', 'log in']
        if any(kw in page_title for kw in login_titles):
            print(f'[DC] {platform}: login page detected by title "{page_title[:60]}", skipping')
            return {'metrics': {}, 'video_stats': [], 'expired': True}

        try:
            login_dom = await page.evaluate('''() => {
                const text = (document.body && document.body.innerText || '').toLowerCase();
                const mediaUrls = Array.from(document.querySelectorAll('iframe,img'))
                    .map(el => (el.src || '').toLowerCase()).join('\\n');
                const textMarkers = [
                    'login', 'sign in', 'qrcode',
                    '\\u626b\\u7801\\u767b\\u5f55',
                    '\\u8bf7\\u4f7f\\u7528\\u5fae\\u4fe1',
                    '\\u5fae\\u4fe1\\u626b\\u4e00\\u626b',
                    '\\u6388\\u6743\\u767b\\u5f55',
                    '\\u7acb\\u5373\\u767b\\u5f55',
                    '\\u8d26\\u53f7\\u767b\\u5f55'
                ];
                return textMarkers.some(marker => text.includes(marker)) ||
                    /login|passport|authorize|qrcode|qr_code/.test(mediaUrls);
            }''')
            if login_dom:
                print(f'[DC] {platform}: login UI detected, marking cookie expired')
                return {'metrics': {}, 'video_stats': [], 'expired': True}
        except Exception:
            pass

        metrics = await _scrape_dashboard(page)

        # 2. Data center
        if data_center_url:
            _collector_progress['phase'] = '数据中心'
            try:
                await page.goto(data_center_url, wait_until='domcontentloaded', timeout=30000)
                try:
                    await page.wait_for_selector('[class*=content], [class*=main], [role=main], main', timeout=15000)
                except:
                    await page.wait_for_timeout(15000)
                dc = await _scrape_data_center(page, platform)
                for k, v in dc.items():
                    if v is not None and (k not in metrics or metrics.get(k, 0) == 0):
                        metrics[k] = v
            except Exception as e:
                print(f'[DC] data-center error {platform}: {e}')

        # 3. Video list
        if video_list_url:
            _collector_progress['phase'] = '视频采集'
            try:
                await page.goto(video_list_url, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(8000)
                video_stats = await _scrape_video_list(page, platform)
            except Exception as e:
                print(f'[DC] video-list error {platform}: {e}')

        # 4. Monetization / Revenue
        if monetization_url:
            try:
                await page.goto(monetization_url, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(6000)
                rev = await _scrape_monetization(page)
                for k, v in rev.items():
                    if v is not None and (isinstance(v, bool) or v > 0 or isinstance(v, str)):
                        metrics[k] = v
            except Exception as e:
                print(f'[DC] monetization error {platform}: {e}')

        # 5. Extra pages (粉丝画像, 内容数据, etc.)
        for extra_url in entry.get('extra_pages', []):
            try:
                await page.goto(extra_url, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(5000)
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
                await page.wait_for_timeout(3000)

                api_result = await collect_douyin_data(
                    page, max_posts=200, fetch_comments=False,
                    account_label=account_label  # 身份验证：多账号场景确认没串号
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
    """安全关闭 context，忽略已关闭的错误"""
    if ctx is None:
        return
    try:
        await ctx.close()
    except Exception:
        pass


async def _scrape_one_account(pw, account_id: str, platform: str, profile_dir: Path, nickname: str = '') -> dict:
    """采集单个账号：连伴侣 Chrome + storage_state 加载该账号 cookie"""
    entry = PLATFORM_DASHBOARDS.get(platform)
    if not entry:
        return {'accountId': account_id, 'metrics': {}, 'videoStats': []}

    state_json = profile_dir / 'state.json'
    if not state_json.exists():
        print(f'[DC] No state.json for {nickname or account_id[:12]}, skipping')
        return {'accountId': account_id, 'metrics': {}, 'videoStats': []}

    context = None
    try:
        browser = None
        try:
            browser = await pw.chromium.connect_over_cdp(_CDP_URL)
        except Exception:
            pass

        if browser and browser.contexts:
            # ── CDP 模式下不复用主 context，每个账号用自己的 persistent context ──
            # 否则所有视频号账号共用一个 cookie，数据全串
            context = None  # fall through to persistent_context below

        if not context:
            launch_kw = {
                'user_data_dir': str(profile_dir), 'headless': True,
                'viewport': {'width': 1280, 'height': 800}, 'locale': 'zh-CN',
                'args': ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
            }
            if _BROWSER_PATH: launch_kw['executable_path'] = _BROWSER_PATH
            elif _BROWSER_CHANNEL: launch_kw['channel'] = _BROWSER_CHANNEL
            context = await pw.chromium.launch_persistent_context(**launch_kw)
            try:
                import json as _json
                state = _json.loads(state_json.read_text('utf-8'))
                if state.get('cookies'): await context.add_cookies(state['cookies'])
            except Exception: pass

        label = nickname or account_id[:12]
        print(f'[DC] Scraping {label} ({platform})...')
        result = await _scrape_account_pages(context, platform, account_label=label)
        # After successful scrape, keep account active and mark collection time.
        if result.get('metrics') or result.get('video_stats'):
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
        return {'accountId': account_id, 'metrics': result['metrics'], 'videoStats': result['video_stats']}
    except Exception as e:
        print(f'[DC] scrape error {platform}/{account_id}: {str(e)[:120]}')
        return {'accountId': account_id, 'metrics': {}, 'videoStats': []}
    finally:
        if context:
            try:
                # 不要关闭伴侣 Chrome 的 context（会导致整个浏览器崩掉）
                if not (browser and browser.contexts and context == browser.contexts[0]):
                    await context.close()
            except: pass


async def _scrape_all(accounts: list) -> list:
    """多账号采集：每个账号独立 Chrome 实例，用自己的 Profile（1账号=1实例=1cookie）"""
    global _collector_progress
    from playwright.async_api import async_playwright
    from local_db import get_profile_path

    results = []
    _collector_progress['total'] = len(accounts)
    _collector_progress['current'] = 0

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
            )
            results.append(result)

    return results


def _run_collection_once():
    global _collector_running, _collector_last_run
    global _collector_last_error, _CONFIG_CACHE

    if not _collector_lock.acquire(blocking=False):
        _collector_last_error = 'Collection already running'
        print('[DC] Collection already running, skipping duplicate trigger')
        return

    _collector_running = True
    try:
        cfg = _load_config()
        _CONFIG_CACHE = cfg
        api_url = cfg.get('api_url', '').rstrip('/')
        token = cfg.get('token', '')

        if not api_url or not token:
            _collector_last_error = 'No backend token; running local-only collection'
            # Don't return — allow collection to run locally even without valid token

        if api_url and not token:
            token = _login_with_saved_credentials(cfg)

        from local_db import get_all_accounts, update_collection_time, get_profile_path
        import requests

        # 从本地 DB 获取所有绑定的账号（含 expired — 不预判过期，实际试了再说）
        local_accounts = get_all_accounts(include_expired=True)
        if not local_accounts:
            _collector_last_run = time.strftime('%Y-%m-%d %H:%M:%S')
            _collector_last_error = None
            return

        backend_account_ids = {}
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
                    by_platform_name = {}
                    for remote in remote_accounts or []:
                        remote_id = (remote.get('id') or '').strip()
                        remote_platform = (remote.get('platform') or '').strip().upper()
                        remote_uid = (remote.get('platformUserId') or '').strip()
                        remote_name = (remote.get('nickname') or '').strip()
                        if remote_id and remote_platform and remote_uid:
                            by_platform_uid[(remote_platform, remote_uid)] = remote_id
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
                            if backend_id != local_id:
                                print(f'[DC] Mapped local account {local_id} -> backend {backend_id}')
                else:
                    print(f'[DC] Cannot fetch backend accounts: HTTP {remote_resp.status_code}')
            except Exception as e:
                print(f'[DC] Backend account mapping failed: {str(e)[:120]}')

        # 构造采集列表（本地 DB 里的账号 + 后端平台类型）
        accounts = []
        for acc in local_accounts:
            aid = acc['id']
            nickname = acc.get('nickname', '')
            accounts.append({
                'id': aid,
                'platform': acc['platform'],
                'nickname': nickname,
            })

        print(f'[DC] Scraping {len(accounts)} accounts from local profiles')
        # Windows: daemon 线程中 asyncio.run() 可能卡死，手动管理 event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            scraped = loop.run_until_complete(_scrape_all(accounts))
        finally:
            loop.close()

        reported = 0

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

            # ── ALWAYS save to local DB first (even if backend is down) ──
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
        video_reported = 0
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

        _collector_last_run = time.strftime('%Y-%m-%d %H:%M:%S')
        _collector_last_error = None
        # 更新所有已采集平台的 cookie 状态
        platform_map = {'DOUYIN':'douyin','XIAOHONGSHU':'xiaohongshu','KUAISHOU':'kuaishou','WECHAT_VIDEO':'tencent'}
        for acc in local_accounts:
            key = platform_map.get(acc.get('platform',''))
            if key: _record_scan_time(key)
        print(f'[DC] Done: {reported}/{len(scraped)} reported')
    except Exception as e:
        _collector_last_error = str(e)
        print(f'[DC] Fatal: {e}')
    finally:
        _collector_running = False
        _collector_lock.release()


def _get_collection_interval() -> int:
    """Return seconds until next collection based on time of day.
    Day (8:00-21:00): 30 minutes. Night (21:00-8:00): 2 hours."""
    now = time.localtime()
    hour = now.tm_hour
    if 8 <= hour < 21:
        return 30 * 60  # daytime: 30 min
    else:
        return 120 * 60  # nighttime: 2 hours

def _data_collector_loop():
    """后台定时采集循环 —— 仅在用户手动触发采集后才启动"""
    time.sleep(30)
    while True:
        try:
            _run_collection_once()
        except Exception as e:
            print(f'[DC] Loop error: {e}')
        interval = _get_collection_interval()
        print(f'[DC] Next collection in {interval // 60} min (hour={time.localtime().tm_hour})')
        time.sleep(interval)

_collector_loop_started = False


# ══════════════════════════════════════════════════════════════════
# Shared Playwright login worker (scan-bind)
# ══════════════════════════════════════════════════════════════════

def _make_login_worker(platform, info, queue, ctrl_queue, api_url, token, use_sse=False, session_id=None):
    """扫码绑定 Worker — 单窗口模式，复用 CDP Context，各平台通过清 Cookie 隔离"""
    def login_worker():
        async def _run():
            context = None
            page = None
            try:
                if not _CDP_URL:
                    err_msg = 'Chrome CDP 未启动，请先解决 Chrome 启动问题后重试'
                    if use_sse:
                        queue.put(json.dumps({'type':'error','data':err_msg}))
                    return
                from playwright.async_api import async_playwright
                from local_db import add_account, get_or_create_profile_dir

                async with async_playwright() as pw:
                    try:
                        browser = await pw.chromium.connect_over_cdp(_CDP_URL)
                    except Exception as e:
                        err_msg = f'无法连接 Chrome CDP: {str(e)[:100]}'
                        if use_sse:
                            queue.put(json.dumps({'type':'error','data':err_msg}))
                        if session_id:
                            scan_status[session_id] = 'error'
                        return

                    # 复用已有 context（单窗口模式），不再每次 new_context 开新窗口
                    existing = browser.contexts
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
                    # 清 Cookie 隔离不同平台登录
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
                    else:
                        if use_sse:
                            queue.put(json.dumps({"type":"error","data":"操作超时（5分钟），请重试"}))
                        if page:
                            try: await page.close()
                            except: pass
                        return
                    if use_sse:
                        queue.put(json.dumps({'type':'status','data':'正在提取信息...'}))

                    # ── 提取页面信息（不再提取 cookie 字符串）──
                    cookies = await context.cookies()
                    page_text = await page.evaluate('() => document.body.innerText')
                    try:
                        with open(Path(tempfile.gettempdir()) / 'pixingyun_page.txt', 'w', encoding='utf-8') as f:
                            f.write(page_text[:5000])
                    except: pass

                    if not cookies:
                        if use_sse:
                            queue.put(json.dumps({'type':'error','data':'未获取到 Cookie，请在 Chrome 窗口中确认已登录'}))
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
                                if c and len(c) > 1 and len(c) < 30 and not c.isdigit() and c not in ('视频号','视频号助手','微信'):
                                    nickname = c
                                    break
                            break
                    # 抖音号
                    if not real_id:
                        m = re.search(r'抖音号[:\s]*(\S+)', page_text)
                        if m:
                            real_id = m.group(1).strip()
                            if not nickname:
                                # 抖音号上方通常是昵称
                                for i, line in enumerate(lines):
                                    if '抖音号' in line and i >= 1:
                                        for j in range(i-1, max(i-3, -1), -1):
                                            c = _sanitize_text(lines[j].strip())
                                            if c and 2 < len(c) < 30 and not c.isdigit():
                                                nickname = c
                                                break
                                        break
                    # 快手号
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

                    # ── 后端注册（尽力而为，失败不阻断本地流程）──
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
                        pass  # Backend unreachable — proceed with local-only

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

                    # ── 存入本地 DB + 保存 Profile 状态 ──
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
                    # CDP 模式：保存 storage_state 到 Profile 目录，供 _scrape_all 使用
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

                    # ── Cookie 已在 state.json 中持久化，无需额外固化步骤 ──
                    # state.json 可供 _scrape_one_account 通过 storage_state 加载

                    # 立即采集初始数据
                    metrics = {}
                    # 判断是否已在仪表盘（有数据内容就行，不依赖URL判断）
                    has_dashboard = any(kw in page_text[:2000]
                        for kw in ['关注者', '粉丝', '数据中心', 'dashboard', '粉丝数'])
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
                                # 新增❤️ / 新增(行尾) → likes，排除已被上述前缀匹配的行
                                m_like = re.search(r'新增(?!播放|评论|分享)\s*([\d,.]+[万wW]?)', yd)
                                if m_like: metrics['newLikes'] = _parse_metric_num(m_like.group(1))

                            # Deep scrape
                            extra = {}
                            try:
                                extra = await _scrape_account_pages(context, platform_key)
                            except Exception as e:
                                print(f'[DC] deep scrape error {platform_key}: {e}')
                            for k, v in extra.get('metrics', {}).items():
                                if v is not None and (k not in metrics or metrics.get(k, 0) == 0):
                                    metrics[k] = v

                            # Save deep scrape results to local DB immediately
                            extra_metrics = extra.get('metrics', {})
                            if extra_metrics or extra.get('video_stats'):
                                try:
                                    from local_db import update_metrics, save_contents, update_collection_time
                                    update_metrics(account_id, extra_metrics)
                                    vstats = extra.get('video_stats') or []
                                    if vstats:
                                        save_contents(account_id, vstats)
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
                                queue.put(json.dumps({'type':'status','data':f'数据已采集: 粉丝{f_count} 播放{v_count} 视频{p_count}条'}))
                        except Exception as e:
                            if use_sse:
                                queue.put(json.dumps({'type':'status','data':f'数据采集失败: {str(e)[:80]}'}))

                    if data.get('code') == 0:
                        _record_scan_time(platform)
                    if use_sse:
                        if data.get('code') == 0 or account_id:
                            queue.put(json.dumps({'type':'success','data':{'platform':platform,'cookies_count':len(cookies),'account_id':account_id}}))
                        else:
                            queue.put(json.dumps({'type':'error','data':f"上传失败: {data.get('message','未知错误')}"}))

                    # 只关 page，不关 context（会杀死 CDP 浏览器）
                    if page:
                        try: await page.close()
                        except: pass

                    if session_id:
                        scan_status[session_id] = 'done'
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
                    if session_id in active_sessions: del active_sessions[session_id]
                if use_sse:
                    queue.put(json.dumps({'type':'error','data':f'浏览器异常: {str(e)[:200]}'}))

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
    resp = make_response(jsonify({'status':'ok','platforms':list(PLATFORMS.keys())}))
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


@app.route('/api/confirm-login', methods=['POST'])
def confirm_login():
    sid = request.json.get('session_id', '') if request.is_json else request.args.get('session_id', '')
    print(f'[ConfirmLogin] sid={sid} in_sessions={sid in active_sessions} total_sessions={len(active_sessions)}', flush=True)
    if sid in active_sessions:
        active_sessions[sid].put('EXTRACT_COOKIES')
        scan_status[sid] = 'uploading'
        print(f'[ConfirmLogin] EXTRACT_COOKIES sent to ctrl_queue, status=uploading', flush=True)
        return jsonify({'code':0,'msg':'ok'})
    print(f'[ConfirmLogin] SESSION NOT FOUND! active_keys={list(active_sessions.keys())}')
    return jsonify({'code':404,'msg':'session not found'}), 404


@app.route('/api/scan-bind/poll/<session_id>')
def scan_bind_poll(session_id):
    st = scan_status.get(session_id, 'not_found')
    return jsonify({'status': st})


@app.route('/api/cancel-scan', methods=['POST'])
def cancel_scan():
    sid = request.json.get('session_id', '') if request.is_json else request.args.get('session_id', '')
    if sid in active_sessions:
        active_sessions[sid].put('CANCEL')
        return jsonify({'code':0,'msg':'ok'})
    return jsonify({'code':404,'msg':'session not found'}), 404


@app.route('/api/scan-bind/trigger')
def scan_bind_trigger():
    """网站调用 — 返回 JSON，快速触发扫码"""
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

    worker = _make_login_worker(platform, info, queue, queue, api_url, token, use_sse=False, session_id=session_id)
    t = threading.Thread(target=worker, daemon=True)
    t.start()

    resp = make_response(jsonify({'code':0,'session_id':session_id,'msg':'扫码窗口已打开，请在浏览器中完成登录'}))
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


@app.route('/api/scan-bind/start')
def scan_bind_start():
    """桌面伴侣 UI 调用 — SSE 流式返回扫码进度"""
    platform = request.args.get('platform', '').strip()
    token = request.args.get('token', '')
    api_url = request.args.get('api_url', '')

    if not platform or not token or not api_url:
        return jsonify({'code':400,'msg':'缺少参数（platform/token/api_url）'}), 400
    if platform not in PLATFORMS:
        return jsonify({'code':400,'msg':f'不支持的平台: {platform}'}), 400

    info = PLATFORMS[platform]
    session_id = uuid.uuid4().hex[:12]
    queue = Queue()       # SSE events: worker → UI
    ctrl_queue = Queue()  # control messages: UI → worker
    active_sessions[session_id] = ctrl_queue  # confirm_login puts to ctrl_queue
    scan_status[session_id] = 'browser'
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


# ══════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    import threading, sys, os, time, urllib.request, webbrowser

    no_cdp = '--no-cdp' in sys.argv

    if no_cdp:
        _CDP_URL = None  # 关键：防止 503 检查形同虚设
        print('=' * 50)
        print('  披星云伴侣 v3.1 (纯浏览器模式)')
        print('  警告: 此模式下扫码绑定功能不可用')
        print('=' * 50)
        print(f'[Main] 启动 Flask 于 http://localhost:5409 ...')
        app.run(host='127.0.0.1', port=5409, debug=False)
        sys.exit(0)

    print('=' * 50)
    print('  披星云桌面伴侣 v3.1 (单窗口 CDP 模式)')
    print('=' * 50)

    APP_URL = 'http://localhost:5409'

    # ── 1. 先启动 Flask ──
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

    # ── 2. 启动 CDP Chrome ──
    cdp_ready = False
    try:
        print('[Main] 启动 Chrome（含 CDP 调试端口 + app 窗口）...')
        _cdp.start(open_url=APP_URL, app_mode=True)
        _CDP_URL = _cdp.get_url()
        cdp_ready = True
        print(f'[Main] Chrome 就绪 | CDP: {_CDP_URL} | App: {APP_URL}')
    except Exception as e:
        print(f'[Main] Chrome 启动失败: {e}')
        webbrowser.open(APP_URL)
        print('[Main] 回退到系统浏览器')
        _CDP_URL = None

    # ── 3. 等待用户关闭 ──
    # Keep collection idle until the user explicitly triggers it.
    if _load_config().get('auto_collect_on_start') is True:
        def _auto_start_collector():
            global _collector_loop_started
            time.sleep(15)  # Wait for auto-login to complete
            if not _collector_loop_started:
                _collector_loop_started = True
                print('[Main] Auto-starting background collector (every 30min day / 2h night)')
                threading.Thread(target=_run_collection_once, daemon=True).start()
                threading.Thread(target=_data_collector_loop, daemon=True).start()
        threading.Thread(target=_auto_start_collector, daemon=True).start()
    else:
        print('[Main] Background collector idle; use trigger to start scheduled collection')

    try:
        while _cdp.is_running:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        print('[Main] 正在关闭...')
        _cdp.stop()
