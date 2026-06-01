"""CDP v13 — 找到 post_list 请求参数 + 切换 tab 重新请求"""
import json, time, urllib.request, websocket

def get_page_ws():
    req = urllib.request.Request("http://127.0.0.1:9222/json")
    with urllib.request.urlopen(req) as resp:
        tabs = json.loads(resp.read().decode("utf-8"))
    for t in tabs:
        if "视频号" in t.get("title", ""):
            return t["webSocketDebuggerUrl"]
    return tabs[0]["webSocketDebuggerUrl"]

WS_URL = get_page_ws()
ws = websocket.create_connection(WS_URL)
mid = [0]

def send(method, params=None):
    mid[0] += 1
    p = params or {}
    ws.send(json.dumps({"id": mid[0], "method": method, "params": p}))

def recv(timeout=10):
    ws.settimeout(timeout)
    while True:
        try:
            r = json.loads(ws.recv())
            if r.get("id") == mid[0]:
                return r.get("result", {})
        except websocket.WebSocketTimeoutException:
            return None
        except:
            return None

def ev(code):
    send("Runtime.evaluate", {"expression": code, "returnByValue": True, "timeout": 5000})
    r = recv()
    if r is None: return None
    rr = r.get("result", {})
    if rr.get("subtype") == "error": return None
    v = rr.get("value")
    if isinstance(v, str) and (v.startswith("{") or v.startswith("[")):
        try: return json.loads(v)
        except: return v
    return v

def click_at(x, y):
    send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
    time.sleep(0.1)
    send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
    time.sleep(0.1)
    send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
    time.sleep(2)

# === Step 1: 从 Performance API 获取 post_list 请求详情 ===
print("=== Step 1: post_list 请求详情 ===")
req_detail = ev("""
(async function() {
    // 找到 post_list 的 performance entry
    var entries = performance.getEntriesByType('resource');
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].name.indexOf('post_list') > -1) {
            var e = entries[i];
            return JSON.stringify({
                name: e.name,
                initiatorType: e.initiatorType,
                duration: e.duration,
                transferSize: e.transferSize,
                decodedBodySize: e.decodedBodySize,
                encodedBodySize: e.encodedBodySize,
                startTime: e.startTime,
                responseEnd: e.responseEnd
            });
        }
    }
    return 'not found';
})()
""")
print(f"  {req_detail}")

# === Step 2: 检查页面上的 Tab 结构 ===
print("\n=== Step 2: 页面 Tab 结构 ===")
tabs = ev("""
(function() {
    // 查找内容区的 tab 元素
    var allEls = document.querySelectorAll('.container-center *');
    var tabs = [];
    var seen = new Set();
    
    for (var i = 0; i < allEls.length; i++) {
        var el = allEls[i];
        var text = el.textContent.trim();
        var cls = (el.className || '').toString();
        var rect = el.getBoundingClientRect();
        
        // Tab 通常会包含这些文本
        if (rect.width > 30 && rect.height > 15 && rect.y > 60 && rect.y < 200 && 
            (text === '已发表' || text === '草稿' || text === '定时发表' || text === '已定时' ||
             cls.indexOf('tab') > -1 || cls.indexOf('Tab') > -1)) {
            var key = text + '_' + Math.round(rect.x);
            if (!seen.has(key)) {
                seen.add(key);
                tabs.push({
                    text: text,
                    cls: cls.substring(0, 60),
                    x: Math.round(rect.x + rect.width/2),
                    y: Math.round(rect.y + rect.height/2),
                    w: Math.round(rect.width),
                    h: Math.round(rect.height)
                });
            }
        }
    }
    
    // 如果没找到，直接扫描所有可点击的小文本元素
    if (tabs.length === 0) {
        for (var j = 0; j < allEls.length; j++) {
            var e2 = allEls[j];
            var t2 = e2.textContent.trim();
            var r2 = e2.getBoundingClientRect();
            if (t2.length > 0 && t2.length < 10 && r2.width > 20 && r2.height > 15 && r2.y > 60 && r2.y < 300) {
                tabs.push({
                    text: t2,
                    cls: (e2.className||'').substring(0, 60),
                    x: Math.round(r2.x + r2.width/2),
                    y: Math.round(r2.y + r2.height/2),
                    w: Math.round(r2.width),
                    h: Math.round(r2.height),
                    tag: e2.tagName
                });
            }
            if (tabs.length >= 20) break;
        }
    }
    
    return JSON.stringify(tabs);
})()
""")
print(f"  Tabs: {json.dumps(tabs, ensure_ascii=False, indent=2) if tabs else 'none'}")

# === Step 3: 直接修改 currentTab 并通过 Vue 组件触发重新获取 ===
print("\n=== Step 3: 修改 currentTab 并重新 fetch ===")
result = ev("""
(async function() {
    var s = window._store;
    if (!s) return 'no store';
    var ps = s.postStore;
    if (!ps) return 'no postStore';
    
    // 当前 tab
    var oldTab = ps.currentTab;
    
    // 尝试修改 tab (1 = 已发表)
    ps.currentTab = 1;
    
    // 尝试通过 store.dispatch 调用 action
    // 先检查 store 结构
    var dispatchInfo = {
        oldTab: oldTab,
        newTab: ps.currentTab,
        storeType: typeof s.dispatch,
        hasDispatch: 'dispatch' in s,
        psActions: []
    };
    
    // 找 postStore 的方法
    for (var key in ps) {
        if (typeof ps[key] === 'function') {
            dispatchInfo.psActions.push(key);
        }
    }
    
    // 如果有 dispatch
    if (s.dispatch) {
        try {
            await s.dispatch('fetchPostList', {offset: 0, limit: 10});
            dispatchInfo.dispatchResult = 'success';
            dispatchInfo.listLen = (ps.list || []).length;
        } catch(e) {
            dispatchInfo.dispatchError = e.message;
        }
    }
    
    return JSON.stringify(dispatchInfo);
})()
""")
print(f"  {json.dumps(result, ensure_ascii=False, indent=2) if result else 'none'}")

# === Step 4: 直接构造完整的 POST 请求（尝试不同参数）===
print("\n=== Step 4: 直接 HTTP POST（不同参数）===")
for tab_id in [0, 1, 2, 3]:
    http_result = ev(f"""
    (async function() {{
        try {{
            var resp = await fetch('/micro/content/cgi-bin/mmfinderassistant-bin/post/post_list', {{
                method: 'POST',
                credentials: 'include',
                headers: {{
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }},
                body: JSON.stringify({{
                    offset: 0,
                    limit: 5,
                    order: 1,
                    currentTab: {tab_id}
                }})
            }});
            var text = await resp.text();
            return JSON.stringify({{tab: {tab_id}, status: resp.status, body: text.substring(0, 500)}});
        }} catch(e) {{
            return JSON.stringify({{tab: {tab_id}, error: e.message}});
        }}
    }})()
    """)
    print(f"  tab={tab_id}: {json.dumps(http_result, ensure_ascii=False) if http_result else 'none'}")
    time.sleep(1)

# === Step 5: 最终截图 ===
print("\n保存截图...")
send("Page.captureScreenshot", {"format": "png"})
r = recv()
if r and "data" in r:
    with open(r"C:\Users\EDY\jujuju\screenshot_v13.png", "wb") as f:
        f.write(__import__("base64").b64decode(r["data"]))
    print("  已保存 screenshot_v13.png")

ws.close()
print("\n=== 完成 ===")
