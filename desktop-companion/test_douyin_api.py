"""
test_douyin_api.py — 测试抖音 API 采集模块

用法：
    cd desktop-companion
    python test_douyin_api.py

前置条件：
    - Chrome 已打开且登录了抖音 (companion CDP 模式)
    - 或者手动指定 Chrome 路径
"""
import asyncio
import sys
import json
from pathlib import Path

# Add current dir to path
sys.path.insert(0, str(Path(__file__).parent))

from douyin_api_collector import (
    collect_douyin_data,
    collect_target_user,
    get_user_profile,
    get_user_posts,
    get_post_comments,
    get_hot_search,
    search_videos,
    DouyinCollectionResult,
)


async def test_with_cdp():
    """通过 Chrome CDP 连接测试（需要 companion 的 Chrome 已启动在 9222 端口）。"""
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        try:
            browser = await pw.chromium.connect_over_cdp("http://127.0.0.1:9222")
            print("[Test] Connected to Chrome CDP")
        except Exception as e:
            print(f"[Test] Cannot connect to Chrome CDP: {e}")
            print("[Test] Make sure Chrome is running with --remote-debugging-port=9222")
            return

        # Use existing context or create new page
        if browser.contexts:
            ctx = browser.contexts[0]
            page = await ctx.new_page()
        else:
            ctx = await browser.new_context()
            page = await ctx.new_page()

        try:
            print("\n" + "=" * 60)
            print("[Test 1] Navigate to douyin.com...")
            await page.goto("https://www.douyin.com", wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(3000)

            current_url = page.url
            print(f"[Test 1] Current URL: {current_url[:100]}")
            if "login" in current_url.lower() or "passport" in current_url.lower():
                print("[Test 1] ⚠️  Not logged in — please login first")
                return

            print("\n" + "=" * 60)
            print("[Test 2] Full collection (collect_douyin_data)...")
            result = await collect_douyin_data(page, max_posts=50, fetch_comments=False)
            if result.success:
                print(f"[Test 2] ✅ SUCCESS")
                print(f"  Nickname: {result.metrics.get('_nickname', 'N/A')}")
                print(f"  Followers: {result.metrics.get('followers', 0)}")
                print(f"  Videos: {result.metrics.get('posts_count', 0)}")
                print(f"  Collected posts: {len(result.video_stats)}")
                if result.video_stats:
                    first = result.video_stats[0]
                    print(f"  First post: {first.get('title', '')[:60]}")
                    print(f"    Views: {first.get('views', 0)}, Likes: {first.get('likes', 0)}")
                if result.extra.get("hot_search"):
                    print(f"  Hot search items: {len(result.extra['hot_search'])}")
                    if result.extra["hot_search"]:
                        hs = result.extra["hot_search"]
                        print(f"    Top 3: {', '.join([h['word'] for h in hs[:3]])}")
            else:
                print(f"[Test 2] ❌ FAILED: {result.error}")

        finally:
            await page.close()

    print("\n[Test] All tests done!")


async def test_module_structure():
    """验证模块结构和类型定义（不需要浏览器）。"""
    print("=" * 60)
    print("[Smoke Test] Module structure check...")

    # Check result type
    r = DouyinCollectionResult()
    assert hasattr(r, "metrics")
    assert hasattr(r, "video_stats")
    assert hasattr(r, "success")
    assert hasattr(r, "error")
    print("[Smoke Test] ✅ DouyinCollectionResult OK")

    # Check endpoints
    from douyin_api_collector import DOUYIN_ENDPOINTS, DOUYIN_API_BASE
    assert len(DOUYIN_ENDPOINTS) >= 30, f"Expected >=30 endpoints, got {len(DOUYIN_ENDPOINTS)}"
    print(f"[Smoke Test] ✅ {len(DOUYIN_ENDPOINTS)} endpoints defined")

    # Check fingerprint
    from douyin_api_collector import build_device_fingerprint
    fp = build_device_fingerprint()
    assert "aid" in fp
    assert fp["aid"] == 6383
    print(f"[Smoke Test] ✅ Device fingerprint OK, {len(fp)} fields")

    # Check functions are callable
    assert callable(collect_douyin_data)
    assert callable(collect_target_user)
    assert callable(get_user_profile)
    assert callable(get_user_posts)
    assert callable(get_post_comments)
    assert callable(get_hot_search)
    assert callable(search_videos)
    print("[Smoke Test] ✅ All functions callable")

    print("\n[Smoke Test] All checks passed! Module is well-structured.")


if __name__ == "__main__":
    if "--smoke" in sys.argv:
        asyncio.run(test_module_structure())
    else:
        print("Testing Douyin API Collector Module")
        print("=" * 60)
        # Smoke test first
        asyncio.run(test_module_structure())
        print()

        # Then try browser test if not skipped
        if "--no-browser" not in sys.argv:
            print("Trying browser test...")
            asyncio.run(test_with_cdp())
        else:
            print("[Test] Skipping browser test (--no-browser flag)")
