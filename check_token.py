"""从 CDP Chrome 获取 ddddkiii.com 的 JWT token"""
import json, websocket

ws = websocket.create_connection("ws://127.0.0.1:9333/devtools/page/89FDD4F0EB3E5405C914C4D16C34497E")
mid = [200]

def send(method, params=None):
    ws.send(json.dumps({"id": mid[0], "method": method, "params": params or {}}))
    mid[0] += 1

def recv():
    return json.loads(ws.recv())

# 检查当前页面
send("Runtime.evaluate", {"expression": "JSON.stringify({url:location.href, title:document.title})", "returnByValue": True})
r = recv()
print("当前页面:", r.get("result", {}).get("value", ""))

# 检查 localStorage 中的 token
send("Runtime.evaluate", {"expression": """
(function(){
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var v = localStorage.getItem(k);
        keys.push({key: k, len: v ? v.length : 0, preview: (v||'').substring(0, 80)});
    }
    return JSON.stringify(keys);
})()
""", "returnByValue": True})
r2 = recv()
ls_data = r2.get("result", {}).get("value", "")
print("\nlocalStorage:")
if isinstance(ls_data, str):
    try:
        items = json.loads(ls_data)
        for item in items:
            print(f"  {item['key']}: len={item['len']}, preview={item['preview']}")
    except:
        print(ls_data[:500])

ws.close()
