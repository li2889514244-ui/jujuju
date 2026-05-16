"""
披星云桌面伴侣 v2.4 — 带 UI 界面，一键扫码 + 自动数据采集
用法: python companion_app.py
"""
import asyncio, json, os, re, threading, time, uuid, base64
from pathlib import Path
from queue import Queue, Empty
from flask import Flask, request, jsonify, Response, make_response

app = Flask(__name__)
BASE_DIR = Path(__file__).parent.resolve()

# ── 平台配置 ──────────────────────────────────────────────────
PLATFORMS = {
    'douyin':   {'name':'抖音','url':'https://creator.douyin.com/','key':'DOUYIN'},
    'xiaohongshu': {'name':'小红书','url':'https://creator.xiaohongshu.com/','key':'XIAOHONGSHU'},
    'kuaishou': {'name':'快手','url':'https://cp.kuaishou.com/','key':'KUAISHOU'},
    'tencent':  {'name':'视频号','url':'https://channels.weixin.qq.com/','key':'WECHAT_VIDEO'},
}

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
<div class="header"><div class="dot"></div><h1>披星云桌面伴侣</h1><span style="opacity:.7;font-size:13px" v-if="siteConnected">已连接网站</span></div>

<div class="main">
  <div class="card">
    <h2>选择平台</h2>
    <div class="platforms">
      <div class="pbtn" v-for="p in platforms" :key="p.id" :class="{active:selected===p.id}" @click="selectPlatform(p.id)">
        <div class="icon">{{p.icon}}</div><div class="name">{{p.name}}</div><div class="hint">{{p.hint}}</div>
      </div>
    </div>
  </div>
  <div class="card">
    <h2>{{ selectedPlatform ? selectedPlatform.name + ' - 扫码登录' : '请从 MatrixFlow 网站发起绑定' }}</h2>
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

<div class="status-bar">
  <div class="ind" :class="siteConnected?'on':'off'"></div>
  <span>{{ siteConnected ? '已连接到 MatrixFlow 网站' : '等待网站连接... (在 MatrixFlow 网页中点击"添加账号")' }}</span>
  <span style="margin-left:auto;color:#999;font-size:12px">v2.4</span>
</div>

<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script>
const {createApp}=Vue
createApp({data(){return{
  platforms:[{id:'douyin',name:'抖音',icon:'🎵',hint:'扫码登录'},{id:'xiaohongshu',name:'小红书',icon:'📕',hint:'扫码登录'},{id:'kuaishou',name:'快手',icon:'🎬',hint:'扫码登录'},{id:'tencent',name:'视频号',icon:'📺',hint:'微信扫码'}],
  selected:'',status:'idle',qrUrl:'',errorMsg:'',siteConnected:false,evtSource:null,progress:0,timer:null,platformFromUrl:'',tokenFromUrl:'',apiFromUrl:'',sessionId:''
}},computed:{selectedPlatform(){return this.platforms.find(p=>p.id===this.selected)}},
methods:{
  selectPlatform(id){
    if(this.status==='loading'||this.status==='browser'||this.status==='uploading')return
    this.selected=id;this.errorMsg=''
    const token=this.tokenFromUrl||this.getParam('token')
    const apiUrl=this.apiFromUrl||this.getParam('api')||'https://ddddkiii.com/api/v1'
    if(!token){this.errorMsg='请先从 MatrixFlow 网页的"添加账号"发起绑定（需要登录）';this.status='error';return}
    this.startScan(token,apiUrl)
  },
  getParam(k){return new URLSearchParams(location.search).get(k)},
  startScan(token,apiUrl){
    this.status='loading';this.progress=0
    this.timer=setInterval(()=>{if(this.progress<90)this.progress+=1},400)
    const url=`/api/scan-bind/start?platform=${this.selected}&token=${encodeURIComponent(token)}&api_url=${encodeURIComponent(apiUrl)}`
    this.evtSource=new EventSource(url)
    this.evtSource.onmessage=e=>{
      try{const d=JSON.parse(e.data)
        if(d.type==='session'){this.sessionId=d.data}
        else if(d.type==='qr_code'){this.status='scan';this.qrUrl=d.data}
        else if(d.type==='browser'){this.status='browser';this.progress=50}
        else if(d.type==='status'){if(d.data.includes('上传'))this.status='uploading'}
        else if(d.type==='success'){this.status='done';this.progress=100;clearInterval(this.timer);this.evtSource.close()}
        else if(d.type==='error'){this.status='error';this.errorMsg=d.data;clearInterval(this.timer);this.evtSource.close()}
      }catch(ex){}
    }
    this.evtSource.onerror=()=>{if(this.status!=='done'){this.status='error';this.errorMsg='连接中断，请重试';clearInterval(this.timer)}}
  },
  reset(){this.evtSource?.close();clearInterval(this.timer);this.status='idle';this.qrUrl='';this.errorMsg='';this.selected='';this.progress=0},
confirmLogin(){
  if(!this.sessionId)return
  fetch('/api/confirm-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:this.sessionId})})
},
cancelScan(){
  if(this.sessionId){fetch('/api/cancel-scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:this.sessionId})})}
  this.reset()
}
},
mounted(){
  this.platformFromUrl=this.getParam('platform')
  this.tokenFromUrl=this.getParam('token')
  this.apiFromUrl=this.getParam('api')
  if(this.platformFromUrl&&this.tokenFromUrl){this.selected=this.platformFromUrl}
  setInterval(async()=>{try{const r=await fetch('/health');if(r.ok)this.siteConnected=true}catch{this.siteConnected=false}},3000)
}}).mount('body')
</script></body></html>'''


# ══════════════════════════════════════════════════════════════════
# Config persistence (for data collector)
# ══════════════════════════════════════════════════════════════════
CONFIG_FILE = BASE_DIR / 'companion_config.json'


def _load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding='utf-8'))
        except Exception:
            pass
    return {'api_url': '', 'token': ''}


def _save_config(cfg: dict):
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2),
                           encoding='utf-8')


_CONFIG_CACHE = _load_config()

PLATFORM_DASHBOARDS = {
    'DOUYIN':       ('https://creator.douyin.com',       '.douyin.com'),
    'KUAISHOU':     ('https://cp.kuaishou.com',          '.kuaishou.com'),
    'XIAOHONGSHU':  ('https://creator.xiaohongshu.com',  '.xiaohongshu.com'),
    'BILIBILI':     ('https://member.bilibili.com',      '.bilibili.com'),
    'WEIBO':        ('https://weibo.com',                '.weibo.com'),
    'WECHAT_VIDEO': ('https://channels.weixin.qq.com',   '.weixin.qq.com'),
}

_collector_running = False
_collector_last_run = None
_collector_last_error = None


# ══════════════════════════════════════════════════════════════════
# Scan-bind session store
# ══════════════════════════════════════════════════════════════════
active_sessions = {}  # session_id -> queue


# ══════════════════════════════════════════════════════════════════
# Config endpoints (data collector)
# ══════════════════════════════════════════════════════════════════

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
    safe = {k: v for k, v in _CONFIG_CACHE.items() if k != 'token'}
    if _CONFIG_CACHE.get('token'):
        safe['token_set'] = True
    return jsonify(safe)


@app.route('/api/data-collection/status')
def data_collection_status():
    return jsonify({
        'running': _collector_running,
        'configured': bool(_CONFIG_CACHE.get('api_url')
                           and _CONFIG_CACHE.get('token')),
        'last_run': _collector_last_run,
        'last_error': _collector_last_error,
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
    ],
    'following': [
        # Use MULTILINE to anchor to line start, avoid matching nav/sidebar "关注"
        re.compile(r'(?:^|\n)关注\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
    ],
    'likes': [
        # 获赞 might be on its own line: "获赞\n132" or "获赞：132"
        re.compile(r'(?:^|\n)获赞\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
        re.compile(r'点赞\s*[：:]\s*([\d,.]+[万wW]?)'),
        re.compile(r'总获赞\s*[：:]?\s*([\d,.]+[万wW]?)'),
    ],
    'views': [
        # 可参考播放量 / 播放量 / 播放
        re.compile(r'(?:可参考)?播放量\s*[：:]?\s*([\d,.]+[万wW]?)'),
        re.compile(r'播放\s*[：:]\s*([\d,.]+[万wW]?)'),
    ],
    'comments': [
        re.compile(r'评论\s*[：:]\s*([\d,.]+[万wW]?)'),
    ],
    'shares': [
        re.compile(r'分享\s*[：:]\s*([\d,.]+[万wW]?)'),
    ],
}


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
    for key, patterns in _METRIC_PATTERNS.items():
        for pat in patterns:
            m = pat.search(text)
            if m:
                metrics[key] = _parse_metric_num(m.group(1))
                break
    return metrics


async def _scrape_all(accounts: list) -> list:
    from playwright.async_api import async_playwright

    results = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=['--disable-blink-features=AutomationControlled',
                  '--no-sandbox'],
        )
        for acc in accounts:
            aid = (acc.get('id') or '').strip()
            platform = (acc.get('platform') or '').strip().upper()
            cookies_str = acc.get('cookies') or ''
            if not aid or not platform or not cookies_str:
                continue

            entry = PLATFORM_DASHBOARDS.get(platform)
            if not entry:
                continue

            url, domain = entry

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

            page = await ctx.new_page()
            metrics = {}
            try:
                await page.goto(url, wait_until='domcontentloaded',
                                timeout=30000)
                await page.wait_for_timeout(8000)
                metrics = await _scrape_dashboard(page)
            except Exception as e:
                print(f'[DC] scrape error {platform}/{aid}: {e}')

            await ctx.close()
            results.append({'accountId': aid, 'metrics': metrics})

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

        print(f'[DC] Fetching accounts from {api_url}/platforms/accounts')
        resp = requests.get(
            f'{api_url}/platforms/accounts',
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
            if c and '=' not in c[:200] and c.count(':') >= 2:
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

        _collector_last_run = time.strftime('%Y-%m-%d %H:%M:%S')
        _collector_last_error = None
        print(f'[DC] Done: {reported}/{len(scraped)} reported')
    except Exception as e:
        _collector_last_error = str(e)
        print(f'[DC] Fatal: {e}')
    finally:
        _collector_running = False


def _data_collector_loop():
    time.sleep(30)
    while True:
        try:
            _run_collection_once()
        except Exception as e:
            print(f'[DC] Loop error: {e}')
        time.sleep(30 * 60)


# Start collector in background
threading.Thread(target=_data_collector_loop, daemon=True).start()


# ══════════════════════════════════════════════════════════════════
# Shared Playwright login worker (scan-bind)
# ══════════════════════════════════════════════════════════════════

def _make_login_worker(platform, info, queue, api_url, token, use_sse=False):
    def login_worker():
        async def _run():
            try:
                from playwright.async_api import async_playwright
                async with async_playwright() as pw:
                    browser = await pw.chromium.launch(
                        headless=False,
                        args=['--disable-blink-features=AutomationControlled','--lang=zh-CN','--start-maximized']
                    )
                    context = await browser.new_context(
                        viewport={'width':1280,'height':800},
                        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    )
                    page = await context.new_page()

                    if use_sse:
                        queue.put(json.dumps({'type':'browser','data':'浏览器已打开'}))

                    await page.goto(info['url'], wait_until='domcontentloaded', timeout=30000)
                    await page.wait_for_timeout(5000)

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
                            msg = queue.get_nowait()
                            if msg == 'EXTRACT_COOKIES':
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
                            queue.put(json.dumps({'type':'error','data':'操作超时（5分钟），请重试'}))
                        await browser.close()
                        return

                    if use_sse:
                        queue.put(json.dumps({'type':'status','data':'正在提取 Cookie...'}))

                    cookies = await context.cookies()
                    cookie_str = '; '.join(f"{c['name']}={c['value']}" for c in cookies)

                    if not cookie_str:
                        if use_sse:
                            queue.put(json.dumps({'type':'error','data':'未获取到 Cookie，请在 Chrome 窗口中确认已登录'}))
                        await browser.close()
                        return

                    import requests
                    resp = requests.post(
                        f"{api_url.rstrip('/')}/accounts",
                        json={
                            'platform': info['key'],
                            'platformUserId': f"scan_{int(time.time())}",
                            'nickname': info['name'],
                            'cookies': cookie_str,
                        },
                        headers={'Authorization': f'Bearer {token}','Content-Type': 'application/json'},
                        timeout=30,
                    )
                    data = resp.json()
                    if use_sse:
                        if data.get('code') == 0:
                            queue.put(json.dumps({'type':'success','data':{'platform':platform,'cookies_count':len(cookies)}}))
                        else:
                            queue.put(json.dumps({'type':'error','data':f"上传失败: {data.get('message','未知错误')}"}))

                    await browser.close()
            except Exception as e:
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
    if sid in active_sessions:
        active_sessions[sid].put('EXTRACT_COOKIES')
        return jsonify({'code':0,'msg':'ok'})
    return jsonify({'code':404,'msg':'session not found'}), 404


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

    worker = _make_login_worker(platform, info, queue, api_url, token, use_sse=False)
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
    queue = Queue()
    active_sessions[session_id] = queue

    worker = _make_login_worker(platform, info, queue, api_url, token, use_sse=True)

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
    print('  披星云桌面伴侣 v2.4')
    print('  http://localhost:5409')
    print(f'  平台: {" | ".join(p["name"] for p in PLATFORMS.values())}')
    print('=' * 50)
    app.run(host='127.0.0.1', port=5409, debug=False)
