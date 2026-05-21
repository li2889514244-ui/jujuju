"""
披星云桌面伴侣 v2.4 — 带 UI 界面，一键扫码 + 自动数据采集
用法: python companion_app.py
"""
import asyncio, json, os, re, sys, threading, time, uuid, base64
from pathlib import Path
from queue import Queue, Empty
from flask import Flask, request, jsonify, Response, make_response

app = Flask(__name__)
# Use EXE directory or script directory for persistent config
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent.resolve()
else:
    BASE_DIR = Path(__file__).parent.resolve()

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

# ── HTML UI ──────────────────────────────────────────────────
UI_HTML = r'''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>披星云桌面伴侣</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;background:#f0f2f5;color:#333;min-height:100vh}
.header{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:20px 32px;display:flex;align-items:center;gap:16px}
.header h1{font-size:22px;font-weight:600}
.dot{width:10px;height:10px;border-radius:50%;background:#4caf50;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.main{max-width:960px;margin:24px auto;padding:0 16px;display:grid;grid-template-columns:1fr 1fr;gap:20px}
.card{background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.card h2{font-size:16px;margin-bottom:16px;color:#555;border-bottom:2px solid #667eea;padding-bottom:8px}
.platforms{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pbtn{border:2px solid #e8e8e8;border-radius:10px;padding:20px 12px;text-align:center;cursor:pointer;transition:.2s;background:#fafafa}
.pbtn:hover{border-color:#667eea;background:#f0f0ff;transform:translateY(-2px)}
.pbtn.active{border-color:#667eea;background:#eef0ff;box-shadow:0 0 0 3px rgba(102,126,234,.2)}
.pbtn .icon{font-size:32px;margin-bottom:8px}
.pbtn .name{font-size:14px;font-weight:600}
.pbtn .hint{font-size:11px;color:#999;margin-top:4px}
.scan-area{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center}
.scan-area img.qr{max-width:220px;border-radius:8px;border:2px solid #eee;margin-bottom:16px}
.scan-area .tip{color:#666;font-size:14px;margin-bottom:12px}
.scan-area .waiting{color:#999;font-size:13px}
.scan-area .success{color:#4caf50;font-size:48px;margin-bottom:8px}
.scan-area .error{color:#f44336;font-size:14px;margin-top:8px}
.status-bar{max-width:960px;margin:20px auto;background:#fff;border-radius:12px;padding:16px 24px;box-shadow:0 2px 12px rgba(0,0,0,.08);display:flex;align-items:center;gap:12px}
.status-bar .ind{width:12px;height:12px;border-radius:50%}
.status-bar .ind.on{background:#4caf50}.status-bar .ind.off{background:#f44336}
.spinner{border:3px solid #e8e8e8;border-top:3px solid #667eea;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:16px auto}
@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
.progress{width:100%;height:6px;background:#e8e8e8;border-radius:3px;margin:12px 0;overflow:hidden}
.progress .fill{height:100%;background:#667eea;border-radius:3px;transition:width .5s}
.btn{background:#667eea;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;margin-top:12px}
.btn:hover{background:#5a6fd6}
.step{display:flex;align-items:center;gap:8px;padding:8px 0;color:#666;font-size:13px}
.step .num{width:24px;height:24px;border-radius:50%;background:#667eea;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
</style></head><body>
<div class="header"><div class="dot"></div><h1>披星云桌面伴侣</h1><span style="opacity:.7;font-size:13px" v-if="configured">已连接</span></div>

<!-- Login panel -->
<div class="login-panel" v-if="!configured" style="max-width:480px;margin:24px auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <h2 style="margin-bottom:20px;color:#333">登录披星云</h2>
  <div style="margin-bottom:14px"><label style="display:block;font-size:13px;color:#666;margin-bottom:4px">邮箱</label><input v-model="loginEmail" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px" placeholder="输入邮箱"></div>
  <div style="margin-bottom:8px"><label style="display:block;font-size:13px;color:#666;margin-bottom:4px">密码</label><input v-model="loginPass" type="password" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px" placeholder="输入密码" @keyup.enter="doLogin"></div>
  <div style="margin-bottom:20px"><label style="font-size:13px;color:#666;cursor:pointer;display:flex;align-items:center;gap:6px"><input type="checkbox" v-model="rememberPwd" style="width:16px;height:16px"> 记住密码（自动登录）</label></div>
  <div v-if="loginError" style="color:#f44336;font-size:13px;margin-bottom:12px">{{loginError}}</div>
  <button class="btn" style="width:100%;padding:12px;font-size:15px" @click="doLogin" :disabled="loginLoading">{{loginLoading?'登录中...':'登录'}}</button>
  <div v-if="loginHint" style="text-align:center;margin-top:12px;color:#999;font-size:12px">{{loginHint}}</div>
</div>

<div class="main" v-if="configured">
  <div class="card">
    <h2>选择平台</h2>
    <div class="platforms">
      <div class="pbtn" v-for="p in platforms" :key="p.id" :class="{active:selected===p.id}" @click="selectPlatform(p.id)">
        <div class="icon">{{p.icon}}</div><div class="name">{{p.name}}</div><div class="hint">{{p.hint}}</div>
      </div>
    </div>
  </div>
  <div class="card">
    <h2>{{ selectedPlatform ? selectedPlatform.name + ' - 扫码登录' : (configured ? '选择平台开始扫码绑定' : '请先登录') }}</h2>
    <div class="scan-area">
      <template v-if="status==='idle'">
        <div style="color:#999;font-size:15px;line-height:1.8">
          <div class="step"><span class="num">1</span> 打开 MatrixFlow 网站登录</div>
          <div class="step"><span class="num">2</span> 点击"添加账号"</div>
          <div class="step"><span class="num">3</span> 网站会自动连接桌面伴侣</div>
          <div class="step"><span class="num">4</span> 选择平台 → 弹出 Chrome → 扫码</div>
        </div>
      </template>
      <div v-if="status==='loading'"><div class="spinner"></div><p class="waiting">正在启动浏览器...</p></div>
      <div v-if="status==='browser'"><p style="color:#4caf50;font-size:18px;margin-bottom:8px">浏览器已打开</p><p class="tip">请在 Chrome 窗口中扫码登录</p><p class="waiting" style="margin:4px 0">登录成功后，点击下方按钮</p><button class="btn" style="background:#4caf50;font-size:16px;padding:12px 32px;margin:8px 0" @click="confirmLogin">已完成登录，提取 Cookie</button><br><button class="btn" style="background:#999;margin-top:4px" @click="cancelScan">取消</button></div>
      <div v-if="status==='scan'"><img class="qr" :src="qrUrl" v-if="qrUrl"><p class="tip">用手机扫描上方二维码</p></div>
      <div v-if="status==='uploading'"><div class="spinner"></div><p class="waiting">登录成功！正在上传 Cookie...</p></div>
      <div v-if="status==='done'"><div class="success">&#10003;</div><p style="color:#4caf50;font-size:16px">绑定成功！</p><p style="color:#999;margin:8px 0">刷新 MatrixFlow 网页即可看到新账号</p></div>
      <div v-if="status==='error'"><div class="error">{{ errorMsg }}</div><button class="btn" @click="reset">重试</button></div>
    </div>
  </div>
</div>

<div class="status-bar" v-if="configured" style="flex-direction:column;align-items:stretch;gap:8px">
  <div style="display:flex;align-items:center;gap:12px">
    <div class="ind" :class="siteConnected?'on':'off'"></div>
    <span>{{ siteConnected ? '已连接到网站' : '等待网站连接...' }}</span>
    <button class="btn" style="margin-left:auto;margin-right:8px;padding:4px 12px;font-size:12px;background:#E60012" @click="triggerCollect" :disabled="collecting">{{collecting?'采集中...':'触发采集'}}</button><span style="color:#999;font-size:12px">v2.5</span>
  </div>
  <div v-if="cookieAlerts.length" style="display:flex;flex-direction:column;gap:4px">
    <div v-for="a in cookieAlerts" :key="a.platform" style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:6px;font-size:12px" :style="{background:a.expired?'#fff3f3':'#fff8e6'}">
      <span :style="{color:a.expired?'#f44336':'#e6a23c'}">{{a.expired?'⚠':'⚡'}}</span>
      <span>{{a.name}} Cookie {{a.expired?'已过期('+a.hours+'h)':'即将过期('+a.hours+'h)'}} — 需重新扫码</span>
    </div>
  </div>
  <div v-if="cookieStatus && !cookieAlerts.length" style="font-size:12px;color:#67c23a">所有平台 Cookie 正常 (最新 {{cookieFreshness}} 前)</div>
</div>

<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script>
const {createApp}=Vue
createApp({data(){return{
  platforms:[{id:'douyin',name:'抖音',icon:'🎵',hint:'扫码登录'},{id:'xiaohongshu',name:'小红书',icon:'📕',hint:'扫码登录'},{id:'kuaishou',name:'快手',icon:'🎬',hint:'扫码登录'},{id:'tencent',name:'视频号',icon:'📺',hint:'微信扫码'}],
  selected:'',status:'idle',qrUrl:'',errorMsg:'',siteConnected:false,evtSource:null,progress:0,timer:null,platformFromUrl:'',tokenFromUrl:'',apiFromUrl:'',sessionId:'',
  configured:false,loginEmail:'',loginPass:'',loginLoading:false,loginError:'',rememberPwd:true,loginHint:'',
  cookieStatus:null,cookieAlerts:[],cookieFreshness:'',collecting:false,collecting:false
}},computed:{selectedPlatform(){return this.platforms.find(p=>p.id===this.selected)}},
methods:{
  async triggerCollect(){this.collecting=true;try{await fetch('/api/data-collection/trigger',{method:'POST'});setTimeout(()=>this.collecting=false,3000)}catch(e){this.collecting=false}},
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
  async checkConfig(){
    try{const r=await fetch('/api/config');const j=await r.json();this.configured=j.configured}catch(e){this.configured=false}
  },
  async doLogin(){
    if(!this.loginEmail||!this.loginPass){this.loginError='请输入邮箱和密码';return}
    this.loginLoading=true;this.loginError=''
    try{
      const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:this.loginEmail,password:this.loginPass})})
      const j=await r.json()
      if(j.error){this.loginError=j.error}
      else{this.configured=true;this.loginEmail='';this.loginPass=''}
    }catch(e){this.loginError='登录失败: '+e.message}
    this.loginLoading=false
  },
  async selectPlatform(id){
    if(this.status==='loading'||this.status==='browser'||this.status==='uploading')return
    this.selected=id;this.errorMsg=''
    // Try URL params first (website-initiated), then companion's saved token
    let token=this.tokenFromUrl||this.getParam('token')
    let apiUrl=this.apiFromUrl||this.getParam('api')||'https://ddddkiii.com/api/v1'
    if(!token){
      try{
        const r=await fetch('/api/config');const j=await r.json()
        if(j.token_set){
          // Get the actual token from server-side session
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
    // Use trigger endpoint (no SSE) — more reliable
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
    // Poll for completion
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
  this.loadCookieStatus()
  this.platformFromUrl=this.getParam('platform')
  this.tokenFromUrl=this.getParam('token')
  this.apiFromUrl=this.getParam('api')
  if(this.platformFromUrl&&this.tokenFromUrl){this.selected=this.platformFromUrl}
  setInterval(async()=>{try{const r=await fetch('/health');if(r.ok)this.siteConnected=true}catch{this.siteConnected=false}},3000)
  setInterval(()=>{if(this.configured)this.loadCookieStatus()},60000) // refresh cookie status every minute
}}).mount('body')
</script></body></html>'''


# ══════════════════════════════════════════════════════════════════
# Config persistence (for data collector)
# ══════════════════════════════════════════════════════════════════
CONFIG_FILE = BASE_DIR / 'companion_config.json'


def _load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            cfg = json.loads(CONFIG_FILE.read_text(encoding='utf-8'))
            return cfg
        except Exception:
            pass
    # For EXE: try to copy bundled config on first run
    if getattr(sys, 'frozen', False):
        try:
            bundled = Path(sys._MEIPASS) / 'companion_config.json'
            if bundled.exists():
                cfg = json.loads(bundled.read_text(encoding='utf-8'))
                if cfg.get('token'):
                    _save_config(cfg)
                    return cfg
        except: pass
    return {'api_url': 'https://ddddkiii.com/api/v1', 'token': ''}


def _save_config(cfg: dict):
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2),
                           encoding='utf-8')


_CONFIG_CACHE = _load_config()

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
    },
}

_collector_running = False
_collector_last_run = None
_collector_last_error = None

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
            if token:
                cfg['token'] = token
                cfg['api_url'] = api_url
                if remember:
                    cfg['saved_email'] = email
                    cfg['saved_password'] = password
                _save_config(cfg)
                _CONFIG_CACHE.update(cfg)
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
            if token:
                cfg['token'] = token
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
    safe = {k: v for k, v in _CONFIG_CACHE.items() if k not in ('token', 'saved_password')}
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
    t = threading.Thread(target=_run_collection_once, daemon=True)
    t.start()
    return jsonify({'status': 'started'})


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


async def _scrape_dashboard(page) -> dict:
    text = await page.evaluate('() => document.body.innerText')
    metrics = {}

    # Only search the first 2000 chars (profile section) for followers/following/likes
    # to avoid matching nav items and recommendation cards further down
    profile_section = text[:8000] if len(text) > 8000 else text
    for key in ['followers', 'following', 'likes', 'comments', 'shares']:
        for pat in _METRIC_PATTERNS.get(key, []):
            m = pat.search(profile_section)
            if m:
                metrics[key] = _parse_metric_num(m.group(1))
                break

    # Views: try to click into data center if not in main text
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
            # Try clicking into 数据中心 / Data Center tab
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

    # Extract real nickname — try multiple strategies per platform
    _NAV_NAMES = {'内容管理','互动管理','数据中心','变现中心','创作中心','首页','活动管理','作品管理','合集管理','共创中心','原创保护中心','评论管理','私信消息'}
    try:
        info = await page.evaluate('''() => {
            const result = { nickname: null, avatar: null };
            const text = document.body.innerText;
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

            // Strategy 1: Look for platform account ID label (抖音号/快手号/小红书号)
            for (let i = 0; i < Math.min(lines.length, 50); i++) {
                const line = lines[i];
                if (line.match(/^(抖音号|快手号|小红书号|账号ID)/)) {
                    const id = line.replace(/.*[：:]/, '').trim();
                    if (id) { result.nickname = id; break; }
                }
            }

            // Strategy 2: Try page title (often contains account name)
            if (!result.nickname) {
                const title = document.title || '';
                const clean = title.replace(/[\\-|–—].*$/, '').replace(/创作者中心|创作服务平台|数据平台|抖音|快手|小红书/g, '').trim();
                if (clean.length >= 2 && clean.length <= 30 && !/^\d+$/.test(clean)) {
                    result.nickname = clean;
                }
            }

            // Strategy 3: Look for profile name in header area via DOM selectors
            if (!result.nickname) {
                const selectors = [
                    '[class*="account-name"]', '[class*="nickname"]', '[class*="profile-name"]',
                    '[class*="user-name"]', 'h1', '[class*="creator-name"]',
                ];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        const txt = el.innerText.trim();
                        if (txt.length >= 2 && txt.length <= 30 && !/^\d{5,}$/.test(txt)) {
                            result.nickname = txt; break;
                        }
                    }
                }
            }

            // Strategy 4: First non-numeric line before '抖音号' or 'ID' in top area
            if (!result.nickname) {
                for (let i = 0; i < Math.min(lines.length, 40); i++) {
                    const line = lines[i];
                    if (line.match(/^(抖音号|快手号|小红书号|ID|账号)/)) {
                        // Check the line(s) right above this for the display name
                        for (let j = i-1; j >= Math.max(0, i-5); j--) {
                            const candidate = lines[j];
                            if (candidate.length >= 2 && candidate.length <= 30 &&
                                !/^\d{5,}$/.test(candidate) &&
                                !/^(抖音|快手|小红书|创作者|首页|数据|内容|粉丝|关注|获赞)/.test(candidate)) {
                                result.nickname = candidate; break;
                            }
                        }
                        if (result.nickname) break;
                    }
                }
            }

            // Try avatar
            const imgs = document.querySelectorAll('img');
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
    """Extract analytics from data center page (URL-based navigation, no click needed)"""
    text = await page.evaluate('() => document.body.innerText')
    result = {}

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

    # Also check for tabular data (table-based layout)
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

    return result


async def _scrape_video_list(page, platform: str) -> list:
    """Extract per-video stats from video list page"""
    video_data = await page.evaluate('''() => {
        const videos = [];
        // Try common selectors for video/post list items
        const items = document.querySelectorAll(
            '[class*="post-item"], [class*="video-item"], [class*="list-item"], ' +
            'tr[class*="row"], [class*="card"], [class*="work-item"], ' +
            'table tbody tr, [class*="article-item"], [class*="content-item"]'
        );
        items.forEach(el => {
            const text = (el.innerText || '').trim();
            if (text.length > 20 && text.length < 2000) {
                // Extract numbers from text
                const numbers = text.match(/[\\d,.]+[万wW]?/g) || [];
                const title = text.split('\\n')[0]?.trim()?.substring(0, 60) || '';
                videos.push({
                    title: title,
                    text: text.substring(0, 300),
                    numbers: numbers.slice(0, 6)
                });
            }
        });
        // Limit to 20 items
        return videos.slice(0, 20);
    }''')

    result = []
    for v in video_data:
        nums = [_parse_metric_num(n) for n in v['numbers']]
        nums_sorted = sorted([n for n in nums if n > 0], reverse=True)
        if len(nums_sorted) < 2:
            continue
        stat = {
            'title': v['title'],
            'views': nums_sorted[0] if len(nums_sorted) > 0 else 0,
            'likes': nums_sorted[1] if len(nums_sorted) > 1 else 0,
            'comments': nums_sorted[2] if len(nums_sorted) > 2 else 0,
            'shares': nums_sorted[3] if len(nums_sorted) > 3 else 0,
        }
        # Filter out navbar items and obviously wrong data
        skip_words = ['管理', '设置', '登录', '退出', '首页', '数据中心', '内容', '互动', '平台', '运营', '变现', '服务']
        if any(w in stat['title'] for w in skip_words):
            continue
        if stat['views'] > 0:
            result.append(stat)

    return result[:10]


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
        text = await page.evaluate('() => document.body.innerText')
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


async def _scrape_account_pages(context, platform: str) -> dict:
    """Scan once, grab all pages in a single authenticated session.
    Navigates dashboard → data center → video list → monetization.
    Returns {'metrics': {...}, 'video_stats': [...]}"""
    entry = PLATFORM_DASHBOARDS.get(platform)
    if not entry:
        return {'metrics': {}, 'video_stats': []}

    url = entry['url']
    data_center_url = entry.get('data_center')
    video_list_url = entry.get('video_list')
    monetization_url = entry.get('monetization')

    page = await context.new_page()
    metrics = {}
    video_stats = []

    try:
        # 1. Dashboard
        await page.goto(url, wait_until='domcontentloaded', timeout=30000)
        await page.wait_for_timeout(8000)
        metrics = await _scrape_dashboard(page)

        # 2. Data center
        if data_center_url:
            try:
                await page.goto(data_center_url, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(6000)
                dc = await _scrape_data_center(page, platform)
                for k, v in dc.items():
                    if v is not None and (k not in metrics or metrics.get(k, 0) == 0):
                        metrics[k] = v
            except Exception as e:
                print(f'[DC] data-center error {platform}: {e}')

        # 3. Video list
        if video_list_url:
            try:
                await page.goto(video_list_url, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(8000)
                video_stats = await _scrape_video_list(page, platform)
            except Exception as e:
                print(f'[DC] video-list error {platform}: {e}')

        # 4. Monetization / Revenue — store platforms use dedicated store scraper
        store_platforms = ('DOUDIAN', 'XIAOHONGSHU_SHOP', 'WECHAT_SHOP')
        if monetization_url:
            try:
                await page.goto(monetization_url, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(6000)
                if platform in store_platforms:
                    rev = await _scrape_store_dashboard(page, platform)
                else:
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

    finally:
        await page.close()

    return {'metrics': metrics, 'video_stats': video_stats}


async def _scrape_all(accounts: list) -> list:
    from playwright.async_api import async_playwright

    results = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(**_launch_browser_opts(headless=True))
        for acc in accounts:
            aid = (acc.get('id') or '').strip()
            platform = (acc.get('platform') or '').strip().upper()
            cookies_str = acc.get('cookies') or ''
            if not aid or not platform or not cookies_str:
                continue

            entry = PLATFORM_DASHBOARDS.get(platform)
            if not entry:
                continue

            domain = entry.get('domain') or entry.get('url', '').split('://')[1] if '://' in entry.get('url', '') else entry.get('url', '')

            cookie_list = []
            for pair in cookies_str.split('; '):
                if '=' in pair:
                    n, v = pair.split('=', 1)
                    cookie_list.append({
                        'name': n.strip(),
                        'value': v.strip(),
                        'domain': domain,
                        'path': '/',
                    })

            ctx = await browser.new_context(
                user_agent=(
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                    'AppleWebKit/537.36 (KHTML, like Gecko) '
                    'Chrome/124.0.0.0 Safari/537.36'),
                locale='zh-CN',
            )
            if cookie_list:
                try:
                    await ctx.add_cookies(cookie_list)
                except Exception:
                    pass

            try:
                result = await _scrape_account_pages(ctx, platform)
            except Exception as e:
                print(f'[DC] scrape error {platform}/{aid}: {e}')
                result = {'metrics': {}, 'video_stats': []}

            await ctx.close()
            results.append({'accountId': aid, 'metrics': result['metrics'], 'videoStats': result['video_stats']})

        await browser.close()
    return results


def _run_collection_once():
    global _collector_running, _collector_last_run
    global _collector_last_error, _CONFIG_CACHE

    _collector_running = True
    try:
        cfg = _load_config()
        _CONFIG_CACHE = cfg
        api_url = cfg.get('api_url', '').rstrip('/')
        token = cfg.get('token', '')

        if not api_url or not token:
            _collector_last_error = 'Not configured: api_url or token missing'
            return

        import requests

        print(f'[DC] Fetching accounts from {api_url}/accounts')
        resp = requests.get(
            f'{api_url}/accounts',
            headers={'Authorization': f'Bearer {token}'},
            timeout=30,
        )
        if resp.status_code != 200:
            _collector_last_error = f'GET /accounts returned HTTP {resp.status_code}'
            return

        raw = resp.json()
        if isinstance(raw, dict):
            inner = raw.get('data') or raw
            if isinstance(inner, dict):
                accounts = inner.get('accounts') or inner.get('data') or []
            else:
                accounts = inner if isinstance(inner, list) else []
        else:
            accounts = raw if isinstance(raw, list) else []

        if not accounts:
            _collector_last_run = time.strftime('%Y-%m-%d %H:%M:%S')
            _collector_last_error = None
            return

        # Decrypt encrypted cookies via individual account endpoint
        for acc in accounts:
            c = acc.get('cookies') or ''
            if True:
                aid = acc.get('id')
                try:
                    r = requests.get(
                        f'{api_url}/accounts/{aid}/cookies',
                        headers={'Authorization': f'Bearer {token}'},
                        timeout=15,
                    )
                    if r.status_code == 200:
                        inner = r.json()
                        dec = (inner.get('data') or inner).get('cookies')
                        if dec:
                            acc['cookies'] = dec
                            print(f'[DC] Decrypted cookies for {aid}')
                except Exception as e:
                    print(f'[DC] Decrypt failed for {aid}: {e}')

        print(f'[DC] Scraping {len(accounts)} accounts')
        scraped = asyncio.run(_scrape_all(accounts))

        reported = 0
        for item in scraped:
            if item['metrics'] and any(v for v in item['metrics'].values()):
                payload = {'accountId': item['accountId'],
                           'metrics': item['metrics']}
                try:
                    r = requests.post(
                        f'{api_url}/platforms/report-metrics',
                        json=payload,
                        headers={'Authorization': f'Bearer {token}'},
                        timeout=30,
                    )
                    if r.status_code < 400:
                        reported += 1
                    else:
                        print(
                            f'[DC] Report HTTP {r.status_code} for '
                            f'{item["accountId"]}: {r.text[:200]}')
                except Exception as e:
                    print(f'[DC] Report error {item["accountId"]}: {e}')

        # Report per-video stats
        video_reported = 0
        for item in scraped:
            vstats = item.get('videoStats') or []
            if not vstats:
                continue
            try:
                r = requests.post(
                    f'{api_url}/platforms/report-post-stats',
                    json={'accountId': item['accountId'], 'posts': vstats},
                    headers={'Authorization': f'Bearer {token}'},
                    timeout=30,
                )
                if r.status_code < 400:
                    video_reported += len(vstats)
            except Exception as e:
                print(f'[DC] Video report error {item["accountId"]}: {e}')

        # Sync nicknames and avatars extracted from dashboard
        for item in scraped:
            m = item.get('metrics', {})
            nickname = m.pop('_nickname', None)
            avatar = m.pop('_avatar', None)
            if nickname or avatar:
                update = {}
                if nickname:
                    update['nickname'] = nickname
                if avatar:
                    update['avatar'] = avatar
                try:
                    r = requests.put(
                        f'{api_url}/accounts/{item["accountId"]}',
                        json=update,
                        headers={'Authorization': f'Bearer {token}'},
                        timeout=15,
                    )
                    if r.status_code < 400:
                        print(f'[DC] Synced profile for {item["accountId"]}: {update}')
                except Exception as e:
                    print(f'[DC] Profile sync error {item["accountId"]}: {e}')

        _collector_last_run = time.strftime('%Y-%m-%d %H:%M:%S')
        _collector_last_error = None
        print(f'[DC] Done: {reported}/{len(scraped)} reported')
    except Exception as e:
        _collector_last_error = str(e)
        print(f'[DC] Fatal: {e}')
    finally:
        _collector_running = False


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
    time.sleep(30)
    while True:
        try:
            _run_collection_once()
        except Exception as e:
            print(f'[DC] Loop error: {e}')
        interval = _get_collection_interval()
        print(f'[DC] Next collection in {interval // 60} min (hour={time.localtime().tm_hour})')
        time.sleep(interval)


# Start collector in background
threading.Thread(target=_data_collector_loop, daemon=True).start()


# ══════════════════════════════════════════════════════════════════
# Shared Playwright login worker (scan-bind)
# ══════════════════════════════════════════════════════════════════

def _make_login_worker(platform, info, queue, ctrl_queue, api_url, token, use_sse=False, session_id=None):
    def login_worker():
        async def _run():
            try:
                from playwright.async_api import async_playwright
                async with async_playwright() as pw:
                    browser = await pw.chromium.launch(**_launch_browser_opts(headless=False, extra_args=['--start-maximized']))
                    context = await browser.new_context(
                        viewport={'width':1280,'height':800},
                        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    )
                    page = await context.new_page()

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
                                await browser.close()
                                return
                        except Empty:
                            pass
                    else:
                        if use_sse:
                            queue.put(json.dumps({"type":"error","data":"操作超时（5分钟），请重试"}))
                        await browser.close()
                        return
                    if use_sse:
                        queue.put(json.dumps({'type':'status','data':'正在提取 Cookie...'}))

                    cookies = await context.cookies()
                    page_text = await page.evaluate('() => document.body.innerText')
                    try:
                        with open('C:/Users/EDY/AppData/Local/Temp/pixingyun_page.txt', 'w', encoding='utf-8') as f:
                            f.write(page_text[:5000])
                    except: pass
                    cookie_str = '; '.join(f"{c['name']}={c['value']}" for c in cookies)

                    if not cookie_str:
                        if use_sse:
                            queue.put(json.dumps({'type':'error','data':'未获取到 Cookie，请在 Chrome 窗口中确认已登录'}))
                        await browser.close()
                        return

                    # Scrape real video号 ID and nickname from the logged-in page
                    import re, requests
                    page_text = await page.evaluate('() => document.body.innerText')
                    # Save page text for debugging
                    try:
                        with open(Path(tempfile.gettempdir()) / 'pixingyun_page.txt', 'w', encoding='utf-8') as f:
                            f.write(page_text[:3000])
                    except: pass
                    real_id = ''
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
                    if not nickname and real_id:
                        nickname = real_id
                    if not nickname:
                        nickname = _sanitize_text(info['name'])

                    platform_uid = real_id if real_id else f"vid_{int(time.time())}"

                    # Check if account already exists
                    check_resp = requests.get(
                        f"{api_url.rstrip('/')}/accounts",
                        headers={'Authorization': f'Bearer {token}'},
                        timeout=15,
                    )
                    existing_id = None
                    try:
                        for acc in (check_resp.json().get('data',{}).get('accounts',[]) or []):
                            if acc.get('platformUserId') == platform_uid or acc.get('nickname') == nickname:
                                existing_id = acc.get('id')
                                break
                    except: pass

                    if existing_id:
                        # Update existing account
                        resp = requests.put(
                            f"{api_url.rstrip('/')}/accounts/{existing_id}",
                            json={'nickname': nickname, 'cookies': cookie_str},
                            headers={'Authorization': f'Bearer {token}','Content-Type': 'application/json'},
                            timeout=30,
                        )
                    else:
                        # Create new account
                        resp = requests.post(
                            f"{api_url.rstrip('/')}/accounts",
                            json={
                                'platform': info['key'],
                                'platformUserId': platform_uid,
                                'nickname': nickname,
                                'cookies': cookie_str,
                            },
                            headers={'Authorization': f'Bearer {token}','Content-Type': 'application/json'},
                            timeout=30,
                        )
                    data = resp.json()
                    account_id = (data.get('data') or {}).get('id') or existing_id
                    if not account_id:
                        # Try to find by platformUserId
                        check2 = requests.get(f"{api_url.rstrip('/')}/accounts", headers={'Authorization': f'Bearer {token}'}, timeout=15)
                        for acc in (check2.json().get('data',{}).get('accounts',[]) or []):
                            if acc.get('platformUserId') == platform_uid:
                                account_id = acc.get('id'); break

                    # Immediately scrape metrics while session is alive
                    metrics = {}
                    if account_id and 'login' not in page.url.lower():
                        try:
                            # Parse followers from page
                            m = re.search(r'关注者\s*(\d[\d,.]*)', page_text)
                            if m: metrics['followers'] = _parse_metric_num(m.group(1))

                            # Parse yesterday's data
                            yd_start = page_text.find('昨日数据')
                            if yd_start > 0:
                                yd = page_text[yd_start:yd_start+500]
                                for label, key in [('净增关注','newFollowers'),('新增播放','views'),('新增评论','comments'),('新增','likes')]:
                                    m = re.search(rf'{label}\s*([\d,.]+[万wW]?)', yd)
                                    if m: metrics[key] = _parse_metric_num(m.group(1))

                            # Deep scrape all pages in one pass
                            extra = {}
                            try:
                                extra = await _scrape_account_pages(context, platform)
                            except Exception:
                                pass

                            for k, v in extra.get('metrics', {}).items():
                                if v is not None and (k not in metrics or metrics.get(k, 0) == 0):
                                    metrics[k] = v

                            if metrics:
                                rpt = requests.post(f"{api_url.rstrip('/')}/platforms/report-metrics",
                                    json={'accountId': account_id, 'metrics': metrics},
                                    headers={'Authorization': f'Bearer {token}'}, timeout=30)

                            vstats = extra.get('video_stats') or []
                            if vstats and account_id:
                                try:
                                    requests.post(
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
                        if data.get('code') == 0:
                            queue.put(json.dumps({'type':'success','data':{'platform':platform,'cookies_count':len(cookies),'account_id':account_id}}))
                        else:
                            queue.put(json.dumps({'type':'error','data':f"上传失败: {data.get('message','未知错误')}"}))
                    await browser.close()
                    if session_id:
                        scan_status[session_id] = 'done'
                        if session_id in active_sessions: del active_sessions[session_id]
            except Exception as e:
                import traceback, tempfile
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
    resp = make_response(UI_HTML)
    resp.headers['Content-Type'] = 'text/html; charset=utf-8'
    return resp


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
    platform = request.args.get('platform', 'douyin')
    token = request.args.get('token', '')
    api_url = request.args.get('api_url', '')

    if not token or not api_url:
        return jsonify({'code':400,'msg':'缺少参数'}), 400
    if platform not in PLATFORMS:
        return jsonify({'code':400,'msg':f'不支持的平台: {platform}'}), 400

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
    platform = request.args.get('platform', 'douyin')
    token = request.args.get('token', '')
    api_url = request.args.get('api_url', '')

    if not token or not api_url:
        return jsonify({'code':400,'msg':'缺少参数'}), 400
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
    print('=' * 50)
    print('  披星云桌面伴侣 v3.0')
    print('=' * 50)

    import threading, sys, os

    def start_flask():
        app.run(host='127.0.0.1', port=5409, debug=False)

    flask_thread = threading.Thread(target=start_flask, daemon=True)
    flask_thread.start()

    # Use native window via pywebview (no browser needed)
    try:
        import webview
        import time
        time.sleep(2)  # Wait for Flask to be ready

        # Create native window
        webview.create_window(
            title='披星云桌面伴侣 v3.0',
            url='http://localhost:5409',
            width=1024,
            height=720,
            min_size=(800, 600),
            resizable=True,
            text_select=True,
        )
        webview.start()
    except ImportError:
        # Fallback: open browser
        import webbrowser
        webbrowser.open('http://localhost:5409')
        print('pywebview not installed, using browser fallback')
        # Keep the main thread alive
        try:
            while True:
                import time; time.sleep(1)
        except KeyboardInterrupt:
            pass
