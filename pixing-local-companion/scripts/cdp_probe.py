"""CDP 探针 — 连接用户 Chrome 并探测页面 DOM 结构"""
import subprocess
import json
import urllib.request
import time
import os
import sys

CDP_URL = "http://localhost:9222"
USER_DATA = os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

def kill_chrome():
    """关闭所有 Chrome"""
    print("🔴 关闭所有 Chrome...")
    subprocess.run(["taskkill", "/F", "/IM", "chrome.exe"],
                   capture_output=True, timeout=10)
    time.sleep(2)

def start_chrome():
    """启动 Chrome CDP 模式，复用用户 Profile"""
    print(f"🟢 启动 Chrome CDP (profile: {USER_DATA})...")
    subprocess.Popen([
        CHROME,
        f"--remote-debugging-port=9222",
        f"--user-data-dir={USER_DATA}",
        "--no-first-run",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-extensions",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 等待 CDP 就绪
    for _ in range(20):
        try:
            urllib.request.urlopen(f"{CDP_URL}/json/version", timeout=2)
            print("✅ CDP 已就绪")
            return True
        except Exception:
            time.sleep(1)
    print("❌ CDP 启动超时")
    return False

def cdp_request(endpoint: str, method: str = "GET", body: dict = None):
    """发送 CDP HTTP 请求"""
    url = f"{CDP_URL}{endpoint}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, timeout=10)
    return json.loads(resp.read().decode())

def eval_js(page_id: str, expression: str, timeout_ms: int = 10000):
    """在页面执行 JS 并返回结果"""
    # 通过 WebSocket endpoint 发送 CDP Runtime.evaluate
    # 改用简化的 HTTP 方式 — 拼接 endpoint
    pages = cdp_request("/json")
    ws_url = None
    for p in pages:
        if p["id"] == page_id:
            ws_url = p["webSocketDebuggerUrl"]
            break
    if not ws_url:
        print(f"❌ 页面 {page_id} 未找到")
        return None

    cdp_ep = ws_url.replace("ws://", "http://")
    payload = {
        "id": int(time.time() * 1000),
        "method": "Runtime.evaluate",
        "params": {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True,
            "timeout": timeout_ms,
        }
    }
    req = urllib.request.Request(cdp_ep, data=json.dumps(payload).encode(),
                                  headers={"Content-Type": "application/json"})
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=30).read())
        if "result" in resp and "result" in resp["result"]:
            return resp["result"]["result"].get("value")
        if "error" in resp:
            print(f"⚠️  JS 错误: {resp['error'].get('message', resp['error'])}")
        return None
    except Exception as e:
        print(f"⚠️  CDP 错误: {e}")
        return None

def find_page_by_url(pattern: str):
    """按 URL 查找页面"""
    pages = cdp_request("/json")
    for p in pages:
        if pattern in p.get("url", ""):
            return p
    return None

def probe_page(page_id: str):
    """探测页面关键 DOM 元素"""
    print("\n" + "=" * 60)
    print("🔍 探测页面结构...")
    print("=" * 60)

    # 获取页面标题
    title = eval_js(page_id, "document.title")
    print(f"📄 页面标题: {title}")

    # 获取所有可能的 key 容器
    scripts = {
        "页面文本前 2000 字符": """
            document.body ? document.body.innerText.slice(0, 2000) : 'no body'
        """,
        "类名包含 'name' 的元素": """
            JSON.stringify([...document.querySelectorAll('[class*="name"], [class*="nickname"], [class*="title"]')]
                .slice(0, 10)
                .map(el => ({tag: el.tagName, class: el.className, text: el.innerText?.slice(0, 50)})))
        """,
        "类名包含 'follower'/'fans'/'count' 的元素": """
            JSON.stringify([...document.querySelectorAll('[class*="follower"], [class*="fans"], [class*="count"], [class*="num"], [class*="stat"]')]
                .slice(0, 20)
                .map(el => ({tag: el.tagName, class: el.className, text: el.innerText?.slice(0, 50)})))
        """,
        "类名包含 'video'/'content'/'work'/'article' 的元素": """
            JSON.stringify([...document.querySelectorAll('[class*="video"], [class*="content"], [class*="work"], [class*="article"], [class*="post"]')]
                .slice(0, 20)
                .map(el => ({tag: el.tagName, class: el.className, text: el.innerText?.slice(0, 50)})))
        """,
        "所有 data-* 属性（前 10 个）": """
            JSON.stringify([...document.querySelectorAll('[data-e2e], [data-testid], [data-id], [data-type]')]
                .slice(0, 10)
                .map(el => ({tag: el.tagName, attrs: [...el.attributes].filter(a=>a.name.startsWith('data-')).map(a=>a.name+'='+a.value), text: el.innerText?.slice(0, 50)})))
        """,
        "导航菜单项": """
            JSON.stringify([...document.querySelectorAll('nav a, [role="navigation"] a, .sidebar a, .menu a')]
                .slice(0, 20)
                .map(el => ({text: el.innerText?.trim(), href: el.getAttribute('href')?.slice(0, 80)})))
        """,
        "所有 h1-h3": """
            JSON.stringify([...document.querySelectorAll('h1,h2,h3')]
                .slice(0, 10)
                .map(el => ({tag: el.tagName, text: el.innerText?.slice(0, 80)})))
        """,
    }

    for label, script in scripts.items():
        result = eval_js(page_id, script)
        print(f"\n--- {label} ---")
        if result:
            if isinstance(result, str) and len(result) > 500:
                print(result[:500] + "...")
            else:
                print(result)
        else:
            print("(无结果)")

def main():
    if len(sys.argv) < 2:
        print("用法: python cdp_probe.py <URL关键字>")
        print("示例: python cdp_probe.py channels.weixin")
        sys.exit(1)

    pattern = sys.argv[1]

    # 检测现有 CDP
    try:
        urllib.request.urlopen(f"{CDP_URL}/json/version", timeout=2)
        print("✅ 已有 Chrome CDP 运行中")
    except Exception:
        kill_chrome()
        if not start_chrome():
            sys.exit(1)

    # 找目标页面
    page = find_page_by_url(pattern)
    if not page:
        print(f"\n⚠️  未找到包含 '{pattern}' 的页面")
        pages = cdp_request("/json")
        print(f"当前打开的页面 ({len(pages)}):")
        for p in pages:
            print(f"  - {p.get('title', 'N/A')} | {p.get('url', 'N/A')[:100]}")
        print(f"\n请在 Chrome 中打开目标页面后再次运行此脚本")
        sys.exit(1)

    print(f"✅ 找到页面: {page['title']}")
    print(f"   URL: {page['url']}")
    probe_page(page["id"])

    print("\n" + "=" * 60)
    print("✅ 探测完成。根据以上 DOM 结构编写采集器选择器。")
    print("=" * 60)

if __name__ == "__main__":
    main()
