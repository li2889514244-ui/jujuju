"""
CDP v9 - 截屏看实际渲染效果
"""
import json, time, base64
from websocket import create_connection

WS = "ws://localhost:9222/devtools/page/79FA48052E346064E100FF20C0A25E6B"
ws = create_connection(WS, timeout=15)

mid = [0]

def cmd(method, params=None):
    mid[0] += 1
    p = params or dict()
    ws.send(json.dumps({"id": mid[0], "method": method, "params": p}))
    ws.settimeout(15)
    for _ in range(200):
        try:
            data = ws.recv()
            if not data: continue
            msg = json.loads(data)
            if msg.get("id") == mid[0]:
                return msg
        except: break
    return None

def ev(expr):
    r = cmd("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r and "result" in r:
        return r["result"].get("result", {}).get("value")
    return None

# === Screenshot ===
print("=== Taking screenshot ===")
result = cmd("Page.captureScreenshot", {"format": "png"})
if result and "result" in result:
    data = result["result"].get("data", "")
    if data:
        with open("C:/Users/EDY/jujuju/screenshot.png", "wb") as f:
            f.write(base64.b64decode(data))
        print("  Saved to screenshot.png")
    else:
        print("  No data in result")

# === Check console errors ===
print("\n=== Console messages ===")
# Enable console first
cmd("Runtime.enable")
ws.settimeout(3)
for _ in range(50):
    try:
        data = ws.recv()
        if not data: continue
        msg = json.loads(data)
        if msg.get("method") == "Runtime.consoleAPICalled":
            args = msg["params"]["args"]
            txt = " ".join(a.get("value", str(a.get("description",""))) for a in args if a.get("type") == "string")
            print(f"  [LOG] {txt}")
        elif msg.get("method") == "Runtime.exceptionThrown":
            exc = msg["params"]["exceptionDetails"]
            print(f"  [ERR] {exc.get('text', '')} at {exc.get('url','')}:{exc.get('lineNumber','')}")
        elif msg.get("method") == "Log.entryAdded":
            entry = msg["params"]["entry"]
            print(f"  [LOG:{entry.get('level','')}] {entry.get('text','')}")
    except: break

# === Check all visible DOM structure ===
print("\n=== DOM hierarchy ===")
dom = ev("""
(function() {
    function scan(el, depth) {
        if (depth > 4) return null;
        if (!el || el.nodeType !== 1) return null;
        var tag = el.tagName.toLowerCase();
        var id = el.id || '';
        var cls = (el.className || '').toString().substring(0, 60);
        var text = (el.textContent || '').substring(0, 80).replace(/\\s+/g, ' ');
        var kids = [];
        var children = el.children;
        for (var i = 0; i < Math.min(children.length, 10); i++) {
            var c = scan(children[i], depth + 1);
            if (c) kids.push(c);
        }
        return {tag: tag, id: id, cls: cls, text: text, kids: kids, childCount: children.length};
    }
    return JSON.stringify(scan(document.body, 0));
})()
""")
print(f"  {dom}")

# === Try to check if there's a Vue devtools hook ===
print("\n=== Vue/Pinia check ===")
vue = ev("""
(function() {
    var r = {};
    r.hasVueApp = !!document.querySelector('#app');
    r.hasMicroApp = !!document.querySelector('[id*="micro"], [id*="sub"], [id*="qiankun"], [id*="wujie"]');
    r.hasIframe = document.querySelectorAll('iframe').length;
    var d = document.getElementById('app') || document.querySelector('[data-v-app]');
    if (d) {
        r.appHTML = d.innerHTML.substring(0, 300);
        r.appChildren = d.children.length;
    }
    // Check for micro-app containers
    var containers = document.querySelectorAll('[data-name], micro-app, qiankun-container');
    r.microContainers = containers.length;
    return JSON.stringify(r);
})()
""")
print(f"  {vue}")

ws.close()
print("\nDone.")
