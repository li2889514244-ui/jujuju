"""
微信视频号数据采集器 v1.3
JS 代码放在同目录 .js 文件里，Python 读取后传入 page.evaluate()，
彻底避免 Python 字符串转义问题。

用法:
    from weixin_channels_collector import collect_wechat_channels
    result = asyncio.run(collect_wechat_channels(cdp_url="http://127.0.0.1:9222"))
"""
import asyncio
import json
import os
import threading
from pathlib import Path

BASE_URL  = "https://channels.weixin.qq.com/platform"
PAGES    = {
    "home":     f"{BASE_URL}/home",
    "follower": f"{BASE_URL}/statistic/follower",
    "post":      f"{BASE_URL}/statistic/post",
}

# JS 文件目录（与本文件同目录）
_JS_DIR = Path(__file__).parent


def _load_js(name: str) -> str:
    """读取 weixin_*.js 文件内容"""
    path = _JS_DIR / f"weixin_{name}.js"
    if not path.exists():
        raise FileNotFoundError(f"JS 文件不存在: {path}")
    return path.read_text(encoding="utf-8")


# ── 采集：关注者数据 ─────────────────────────────────────
async def collect_follower_data(page) -> dict:
    print("[WeChat] 导航到关注者数据...")
    await page.goto(PAGES["follower"], wait_until="domcontentloaded", timeout=30000)
    await asyncio.sleep(3)

    # 等待 wujie shadow DOM 渲染
    try:
        await page.wait_for_function("""
            () => {
                const w = document.querySelector('wujie-app');
                return (w && w.shadowRoot && w.shadowRoot.querySelectorAll('*').length > 10);
            }
        """, timeout=15000)
    except Exception:
        await asyncio.sleep(2)

    growth_js = _load_js("extract_follower_growth")
    print(f"[WeChat] growth_js 长度: {len(growth_js)}")
    growth = await page.evaluate(growth_js)
    print(f"[WeChat] 关注者增长: {json.dumps(growth, ensure_ascii=False)}")

    # 切换到「关注者画像」tab
    await _click_sidebar(page, "关注者画像")
    await asyncio.sleep(2)
    profile_js = _load_js("extract_follower_profile")
    profile = await page.evaluate(profile_js)
    print(f"[WeChat] 关注者画像: 地域 {len(profile.get('regions', []))} 条")

    return {
        "follower_count": growth.get("follower_count", 0),
        "new_followers":  growth.get("latest", {}).get("net_growth", 0),
        "profile":         profile,
        "raw_growth":     growth,
    }


# ── 采集：视频数据 ─────────────────────────────────────
async def collect_video_data(page) -> dict:
    print("[WeChat] 导航到视频数据...")
    await page.goto(PAGES["post"], wait_until="domcontentloaded", timeout=30000)
    await asyncio.sleep(3)

    try:
        await page.wait_for_function("""
            () => {
                const w = document.querySelector('wujie-app');
                return (w && w.shadowRoot && w.shadowRoot.querySelectorAll('*').length > 10);
            }
        """, timeout=15000)
    except Exception:
        await asyncio.sleep(2)

    metrics_js = _load_js("extract_video_metrics")
    metrics = await page.evaluate(metrics_js)
    print(f"[WeChat] 视频指标: {json.dumps(metrics, ensure_ascii=False)}")

    video_table_js = _load_js("extract_video_table")
    videos = await page.evaluate(video_table_js)
    print(f"[WeChat] 视频列表: {len(videos)} 条")

    # 切换到「单篇视频」tab
    await _click_sidebar(page, "单篇视频")
    await asyncio.sleep(2)
    single_js = _load_js("extract_single_videos")
    single = await page.evaluate(single_js)
    print(f"[WeChat] 单篇视频: {len(single)} 条")

    return {
        "metrics":        metrics,
        "videos":         videos,
        "single_videos":  single,
    }


# ── 辅助函数 ─────────────────────────────────────────────
async def _click_sidebar(page, text: str):
    """点击侧边栏菜单项（在 shadow DOM 内）"""
    js = _load_js("click_sidebar")
    result = await page.evaluate(js, text)
    await asyncio.sleep(2)
    return result


async def _ensure_wechat_page(page):
    """确保浏览器在视频号页面，如不在则导航"""
    if 'channels.weixin.qq.com' not in page.url():
        print("[WeChat] 导航到视频号助手首页...")
        await page.goto(PAGES["home"], wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(3)


# ── 主入口 ─────────────────────────────────────────────
async def collect_wechat_channels(cdp_url: str = "http://127.0.0.1:9222",
                                     account_id: str = "wechat_default") -> dict:
    from playwright.async_api import async_playwright
    from local_db import update_metrics, save_contents, update_collection_time, get_account

    acc = get_account(account_id)
    if not acc:
        print(f"[WeChat] 警告: account_id={account_id} 不存在")

    result = {"follower": None, "video": None, "saved": False}

    async with async_playwright() as pw:
        print(f"[WeChat] 连接 CDP: {cdp_url}")
        browser = await pw.chromium.connect_over_cdp(cdp_url)

        # 找已打开的视频号助手标签页
        page = None
        for ctx in browser.contexts:
            for p in ctx.pages:
                if 'channels.weixin.qq.com' in p.url():
                    page = p
                    print(f"[WeChat] 复用现有标签页: {p.url()}")
                    break
            if page:
                break

        if not page:
            ctx = browser.contexts[0] if browser.contexts else await browser.new_context(locale="zh-CN")
            page = await ctx.new_page()
            print("[WeChat] 新建标签页")

        await _ensure_wechat_page(page)

        # ── 采集关注者数据 ──
        try:
            follower_data = await collect_follower_data(page)
            result["follower"] = follower_data
            update_metrics(account_id, {
                "follower_count": follower_data.get("follower_count", 0),
                "new_followers":  follower_data.get("new_followers", 0),
            })
            print("[WeChat] ✓ 关注者数据已写入 DB")
        except Exception as e:
            print(f"[WeChat] ✗ 关注者数据采集失败: {e}")

        # ── 采集视频数据 ──
        try:
            video_data = await collect_video_data(page)
            result["video"] = video_data
            m = video_data.get("metrics", {})
            update_metrics(account_id, {
                "play_count":   m.get("play", 0),
                "comment_count": m.get("comments", 0),
                "share_count":  m.get("shares", 0),
            })
            if video_data.get("videos"):
                save_contents(account_id, video_data["videos"])
                print(f"[WeChat] ✓ 视频数据已写入 DB ({len(video_data['videos'])} 条)")
            else:
                print("[WeChat] ✓ 视频指标已写入 DB")
        except Exception as e:
            print(f"[WeChat] ✗ 视频数据采集失败: {e}")

        # 更新采集时间
        try:
            update_collection_time(account_id)
            result["saved"] = True
        except Exception as e:
            print(f"[WeChat] 更新采集时间失败: {e}")

        await browser.close()

    return result


# ── Flask 路由注册 ──────────────────────────────────────────
def register_wechat_routes(app):
    """
    注入视频号采集路由到 companion_app.py 的 Flask app。
    在 companion_app.py 末尾加:
        from weixin_channels_collector import register_wechat_routes
        register_wechat_routes(app)
    """
    @app.route('/api/wechat-collect', methods=['POST'])
    def wechat_collect():
        data      = request.get_json(silent=True) or {}
        cdp_url    = data.get('cdp_url', 'http://127.0.0.1:9222')
        account_id = data.get('account_id', 'wechat_default')

        def _run():
            result = asyncio.run(collect_wechat_channels(cdp_url, account_id))
            print(f"[WeChat] 采集完成: saved={result.get('saved')}")

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        return jsonify({"status": "started", "message": "视频号采集任务已启动"})

    @app.route('/api/wechat-collect/status')
    def wechat_collect_status():
        return jsonify({"supported": True, "note": "CDP 模式，需先启动 Chrome 远程调试"})

    print("[WeChat] 路由已注册: /api/wechat-collect")
