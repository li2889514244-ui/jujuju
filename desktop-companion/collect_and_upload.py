"""
⚠ 已废弃 (DEPRECATED) — 请勿直接运行此脚本！
================================================

此脚本已被 companion_app.py 的 _run_collection_once() 完全替代。
companion_app.py 提供了多账号支持、定时调度、Token 自动刷新等能力。

已知问题（如果你仍然要运行）：
  - API_BASE 原硬编码为 IP:Port，无 HTTPS（已修正为域名）
  - CDP_URL 端口原与 companion_app.py 不一致 (2058 vs 9222)（已修正）
  - ACCOUNT_ID / ACCOUNT_NAME 硬编码为单个账号
  - 无 Token 认证

如需采集数据，请通过桌面伴侣 UI 的「一键采集」按钮触发，
或调用 POST http://localhost:5409/api/data-collection/trigger

原功能说明：视频号全量数据采集 + 本地存储 + 云端上传
"""
import asyncio, json, re, sys, time, os
from datetime import datetime
from playwright.async_api import async_playwright

# ═══════════════════════════════════════════════════════
# 配置 — 已废弃，请勿修改后使用
# 如需采集数据请使用 companion_app.py
# ═══════════════════════════════════════════════════════
print('⚠ 警告: collect_and_upload.py 已废弃，请通过桌面伴侣 UI 采集数据。', file=sys.stderr)
print('  如需程序化触发，请调用: POST http://localhost:5409/api/data-collection/trigger', file=sys.stderr)

API_BASE = "https://ddddkiii.com/api/v1"  # 修正: 使用 HTTPS 域名
CDP_URL = "http://localhost:9222"          # 修正: 与 companion_app.py 一致（localhost 兼容 IPv4/IPv6）
ACCOUNT_ID = "sphi9lmniWArf5T"              # 注意: 硬编码账号，仅用于历史参考
ACCOUNT_NAME = "听卢慧说"                    # 注意: 硬编码账号名
PLATFORM = "WECHAT_VIDEO"

URLS = {
    "home": "https://channels.weixin.qq.com/platform/home",
    "video": "https://channels.weixin.qq.com/platform/statistic/post",
    "cargo": "https://channels.weixin.qq.com/platform/statistic/cargo/transcation",
    "follower": "https://channels.weixin.qq.com/platform/statistic/follower",
}


def num(s):
    """Clean number string: remove commas, ¥, 万, %, spaces"""
    if not s:
        return 0
    s = str(s).replace(",", "").replace("¥", "").replace("%", "").strip()
    s = re.sub(r"[万wW]", "", s)
    try:
        return float(s)
    except ValueError:
        return 0


def intv(s):
    return int(num(s))


def floatv(s):
    return num(s)


async def get_shadow_text(page):
    """穿透 wujie shadow DOM 获取文本"""
    return await page.evaluate("""() => {
        var w = document.querySelector('wujie-app');
        if (w && w.shadowRoot) {
            var b = w.shadowRoot.querySelector('body');
            return b ? b.innerText : w.shadowRoot.textContent || '';
        }
        return document.body.innerText;
    }""")


async def goto_and_wait(page, url, timeout=6):
    """导航并等待 shadow DOM 有内容"""
    await page.goto(url, wait_until="domcontentloaded")
    for _ in range(timeout * 2):
        await asyncio.sleep(0.5)
        t = await get_shadow_text(page)
        if len(t) > 500:
            return t
    return await get_shadow_text(page)


async def goto_home_and_wait(page, timeout=6):
    """主页没有 wujie，直接读 body"""
    await page.goto(URLS["home"], wait_until="domcontentloaded")
    for _ in range(timeout * 2):
        await asyncio.sleep(0.5)
        t = await page.evaluate("() => document.body.innerText")
        if len(t) > 500:
            return t
    return await page.evaluate("() => document.body.innerText")


async def intercept_auth_data(page):
    """在导航前注册响应拦截，捕获 auth_data API 响应。
    
    原理：页面加载时浏览器自动调用 auth_data API（带有效 cookie），
    我们拦截这个响应来获取头像、昵称、粉丝数等。
    比手动 fetch 可靠得多 — 不依赖 session 手动构造。
    支持多账号：每个 profile 各自有有效 session，拦截自然生效。
    
    捕获后自动移除监听器，避免内存泄漏和重复检查开销。
    """
    captured = {}

    async def _on_response(response):
        if "auth" not in captured and "auth_data" in response.url and response.status == 200:
            try:
                ct = response.headers.get("content-type", "")
                if "json" in ct or "text" in ct:
                    text = await response.text()
                    if text.startswith("{"):
                        data = json.loads(text)
                        if data.get("errCode") == 0:
                            captured["auth"] = data.get("data", {})
                            # 捕获成功，移除监听器
                            page.remove_listener("response", _on_response)
            except Exception:
                pass

    page.on("response", _on_response)
    return captured


async def collect_all():
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(CDP_URL)
        page = None
        for ctx in browser.contexts:
            for p in ctx.pages:
                if "channels.weixin.qq.com" in p.url:
                    page = p
                    break
            if page:
                break
        if not page:
            page = await browser.contexts[0].new_page()

        result = {
            "platform": PLATFORM,
            "account_id": ACCOUNT_ID,
            "nickname": ACCOUNT_NAME,
            "collected_at": datetime.now().isoformat(),
        }

        # ── 响应拦截：在导航前注册，捕获页面自动加载的 auth_data API ──
        captured = await intercept_auth_data(page)

        # === 1. 主页 ===
        print("[1/4] 主页数据...")
        text = await goto_home_and_wait(page)
        await asyncio.sleep(3)  # 给 API 响应一点时间到达
        flat = text.replace("\n", " ").replace("\t", " ")

        result["follower_count"] = intv(re.search(r"关注者(\d[\d,]*)", flat).group(1)) if re.search(r"关注者(\d[\d,]*)", flat) else 0
        result["video_count"] = intv(re.search(r"视频(\d[\d,]*)", flat).group(1)) if re.search(r"视频(\d[\d,]*)", flat) else 0

        # 从拦截到的 auth_data 响应中提取头像和补充数据
        auth = captured.get("auth", {})
        fu = auth.get("finderUser", {})
        if fu.get("headImgUrl"):
            result["avatar"] = fu["headImgUrl"]
            print(f"  头像(API拦截): {result['avatar'][:80]}")
        if fu.get("nickname"):
            result["nickname_api"] = fu["nickname"]
        if fu.get("fansCount"):
            result["follower_count_api"] = fu["fansCount"]
        if not fu:
            print("  ⚠ auth_data 未拦截到，头像/昵称可能缺失")

        # 昨日数据块
        yd = flat.split("昨日数据")[1].split("关于腾讯")[0] if "昨日数据" in flat else ""
        result["daily_new_followers"] = intv(re.search(r"净增关注\s+(\d+)", yd).group(1)) if re.search(r"净增关注\s+(\d+)", yd) else 0
        result["play_count"] = intv(re.search(r"新增播放\s+(\d[\d,]*)", yd).group(1)) if re.search(r"新增播放\s+(\d[\d,]*)", yd) else 0
        print(f"  粉丝: {result['follower_count']}, 视频: {result['video_count']}, 播放: {result['play_count']}")

        # === 2. 视频数据 ===
        print("[2/4] 视频数据...")
        text = await goto_and_wait(page, URLS["video"])
        flat = text.replace("\n", " ").replace("\t", " ")

        # 关键指标块 - 截断到「商品数据」，避免匹配后面「数据类型」标签
        ki = flat.split("关键指标")[1].split("商品数据")[0] if "关键指标" in flat else flat
        result["play_count_daily"] = intv(re.search(r"播放\s+(\d[\d,]*)", ki).group(1)) if re.search(r"播放\s+(\d[\d,]*)", ki) else 0
        result["comment_count"] = intv(re.search(r"评论\s+(\d+)", ki).group(1)) if re.search(r"评论\s+(\d+)", ki) else 0
        result["share_count"] = intv(re.search(r"分享\s+(\d+)", ki).group(1)) if re.search(r"分享\s+(\d+)", ki) else 0
        result["follow_growth"] = intv(re.search(r"关注\s+(\d+)", ki).group(1)) if re.search(r"关注\s+(\d+)", ki) else 0
        print(f"  播放: {result.get('play_count_daily')}, 分享: {result.get('share_count')}, 评论: {result.get('comment_count')}")

        # 数据详情表
        table = flat.split("数据详情")[1].split("关于腾讯")[0] if "数据详情" in flat else ""
        videos = []
        date_re = re.compile(r"(\d{4}/\d{2}/\d{2})")
        for m in date_re.finditer(table):
            idx = m.end()
            nums = re.findall(r"\d[\d,]*", table[idx:idx+120])
            if len(nums) >= 6:
                videos.append({
                    "date": m.group(1),
                    "play": int(nums[0].replace(",", "")),
                    "like": int(nums[1].replace(",", "")),
                    "heat": int(nums[2].replace(",", "")),
                    "unknown": int(nums[3].replace(",", "")),
                    "share": int(nums[4].replace(",", "")),
                    "follow": int(nums[5].replace(",", "")),
                })
        result["videos"] = videos[:30]
        result["video_total"] = len(videos)
        print(f"  视频列表: {len(videos)} 条")

        # === 3. 带货数据 ===
        print("[3/4] 带货数据...")
        await page.goto(URLS["cargo"], wait_until="domcontentloaded")
        text = ""
        for _ in range(20):  # 最多等 10 秒
            await asyncio.sleep(0.5)
            text = await get_shadow_text(page)
            if "￥" in text and len(text) > 1000:
                break
        flat = text.replace("\n", " ").replace("\t", " ")

        # 成交数据块
        cd = flat.split("成交数据")[1].split("场景构成")[0] if "成交数据" in flat else flat
        for label, key, converter in [
            ("成交金额", "revenue", floatv),
            ("成交订单数", "order_count", intv),
            ("成交人数", "buyer_count", intv),
            ("客单价", "avg_order_value", floatv),
            ("退款订单数", "refund_orders", intv),
            ("下单金额", "order_amount", floatv),
            ("成交退款金额", "refund_amount", floatv),
            ("下单订单数", "order_total", intv),
            ("下单人数", "order_people", intv),
        ]:
            m = re.search(rf"{label}\s+\D*?(\d[\d,.]*)", cd)
            if m:
                result[key] = converter(m.group(1))

        # 商品数据
        gd = flat.split("商品数据")[1].split("数据趋势")[0] if "商品数据" in flat else ""
        m = re.search(r"商品曝光次数\s+(\d+)", gd)
        if m:
            result["product_exposure"] = intv(m.group(1))
        m = re.search(r"商品点击次数\s+(\d+)", gd)
        if m:
            result["product_clicks"] = intv(m.group(1))
        m = re.search(r"商品成交金额\s+¥?\s*(\d[\d,.]*)", gd)
        if m:
            result["product_revenue"] = floatv(m.group(1))

        print(f"  成交金额: ¥{result.get('revenue')}, 订单: {result.get('order_count')}, 客单价: ¥{result.get('avg_order_value')}")

        # === 4. 关注者数据 ===
        print("[4/4] 关注者数据...")
        text = await goto_and_wait(page, URLS["follower"])
        flat = text.replace("\n", " ").replace("\t", " ")

        m = re.search(r"关注者总数\s+(\d+)", flat)
        if m:
            result["follower_total"] = intv(m.group(1))
        m = re.search(r"净增关注\s+(\d+)", flat)
        if m:
            result["net_followers"] = intv(m.group(1))
        m = re.search(r"新增关注\s+(\d+)", flat)
        if m:
            result["new_followers"] = intv(m.group(1))
        m = re.search(r"取消关注\s+(\d+)", flat)
        if m:
            result["unfollow_count"] = intv(m.group(1))

        print(f"  关注者总数: {result.get('follower_total')}, 净增: {result.get('net_followers')}")

        await browser.close()
        return result


def save_to_local_db(data):
    """写入本地 SQLite"""
    db_path = os.path.join(os.environ.get("LOCALAPPDATA", ""), "MatrixFlow", "browser-profiles", "accounts.db")
    import sqlite3
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # 获取表结构
    cols_row = conn.execute("PRAGMA table_info(accounts)").fetchall()
    col_names = [r["name"] for r in cols_row]
    print(f"  accounts 列: {col_names}")

    now = datetime.now().isoformat()

    # 根据实际列名构建映射
    field_map = {}
    if "follower_count" in col_names:
        field_map["follower_count"] = int(data.get("follower_count", 0) or 0)
    if "followers" in col_names:
        field_map["followers"] = int(data.get("follower_count", 0) or 0)
    if "video_count" in col_names:
        field_map["video_count"] = int(data.get("video_count", 0) or 0)
    if "videos" in col_names:
        field_map["videos"] = int(data.get("video_count", 0) or 0)
    if "like_count" in col_names:
        field_map["like_count"] = int(data.get("play_count", 0) or data.get("play_count_daily", 0) or 0)
    if "play_count" in col_names:
        field_map["play_count"] = int(data.get("play_count", 0) or data.get("play_count_daily", 0) or 0)
    if "comment_count" in col_names:
        field_map["comment_count"] = int(data.get("comment_count", 0) or 0)
    if "share_count" in col_names:
        field_map["share_count"] = int(data.get("share_count", 0) or 0)
    if "avatar_url" in col_names:
        field_map["avatar_url"] = data.get("avatar", "") or ""
    if "avatar" in col_names:
        field_map["avatar"] = data.get("avatar", "") or ""
    if "new_followers" in col_names:
        field_map["new_followers"] = int(data.get("daily_new_followers", 0) or 0)
    if "new_views" in col_names:
        field_map["new_views"] = int(data.get("play_count", 0) or data.get("play_count_daily", 0) or 0)
    if "new_likes" in col_names:
        field_map["new_likes"] = 0
    if "new_comments" in col_names:
        field_map["new_comments"] = int(data.get("comment_count", 0) or 0)
    if "new_shares" in col_names:
        field_map["new_shares"] = int(data.get("share_count", 0) or 0)
    if "gmv" in col_names:
        field_map["gmv"] = float(data.get("revenue", 0) or 0)
    if "orders" in col_names:
        field_map["orders"] = int(data.get("order_count", 0) or 0)
    if "total_revenue" in col_names:
        field_map["total_revenue"] = float(data.get("revenue", 0) or 0)
    if "product_count" in col_names:
        field_map["product_count"] = int(data.get("product_exposure", 0) or data.get("order_total", 0) or 0)
    if "commission" in col_names:
        field_map["commission"] = 0
    if "last_collected_at" in col_names:
        field_map["last_collected_at"] = now

    # 查找现有账号（用 platform + nickname 或 id）
    # 列名映射
    if "account_id" in col_names:
        pk_col_name = "account_id"
    elif "platform_uid" in col_names:
        pk_col_name = "platform_uid"
    else:
        pk_col_name = "id"

    where = f"{pk_col_name}=?"
    where_vals = (ACCOUNT_ID,)

    existing = conn.execute(f"SELECT * FROM accounts WHERE {where} LIMIT 1", where_vals).fetchone()

    if existing:
        sets = ", ".join(f"{k}=?" for k in field_map if k in col_names)
        vals = [field_map[k] for k in field_map if k in col_names] + list(where_vals)
        conn.execute(f"UPDATE accounts SET {sets} WHERE {where}", vals)
        print(f"  accounts UPDATED")
    else:
        keys = ["platform", "nickname", "platform_uid", "profile_dir", "status"]
        vals_data = [PLATFORM, ACCOUNT_NAME, ACCOUNT_ID, f"profiles/{PLATFORM}/{ACCOUNT_ID}", "active"]
        for k, v in field_map.items():
            if k in col_names:
                keys.append(k)
                vals_data.append(v)
        qs = ", ".join("?" * len(keys))
        conn.execute(f"INSERT INTO accounts ({', '.join(keys)}) VALUES ({qs})", vals_data)
        print(f"  accounts INSERTED")

    # 作品列表
    if data.get("videos") and "contents" in [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]:
        cnt = 0
        for v in data["videos"]:
            try:
                conn.execute("""
                    INSERT OR REPLACE INTO contents (platform, video_id, title,
                        play_count, like_count, comment_count, share_count, publish_time, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    PLATFORM, v.get("date", ""), f"视频-{v.get('date','')}",
                    v.get("play", 0), v.get("like", 0),
                    v.get("comment", 0) or 0, v.get("share", 0),
                    v.get("date", ""), now
                ))
                cnt += 1
            except:
                pass
        print(f"  contents: {cnt} 条")

    conn.commit()
    conn.close()
    print(f"  本地 DB: {db_path}")


async def upload_to_server(data):
    """推送到后端 API"""
    import aiohttp

    payload = {
        "platform": PLATFORM,
        "accountId": ACCOUNT_ID,
        "nickname": ACCOUNT_NAME,
        "metrics": {
            "_avatar": data.get("avatar", ""),
            "followerCount": int(data.get("follower_count", 0) or 0),
            "videoCount": int(data.get("video_count", 0) or 0),
            "likeCount": int(data.get("play_count", 0) or data.get("play_count_daily", 0) or 0),
            "playCount": int(data.get("play_count", 0) or data.get("play_count_daily", 0) or 0),
            "shareCount": int(data.get("share_count", 0) or 0),
            "commentCount": int(data.get("comment_count", 0) or 0),
            "dailyNewFollowers": int(data.get("daily_new_followers", 0) or 0),
            "revenue": float(data.get("revenue", 0) or 0),
            "gmv": float(data.get("revenue", 0) or 0),
            "orderCount": int(data.get("order_count", 0) or 0),
            "orders": int(data.get("order_count", 0) or 0),
            "buyerCount": int(data.get("buyer_count", 0) or 0),
            "avgOrderValue": float(data.get("avg_order_value", 0) or 0),
            "productCount": int(data.get("product_exposure", 0) or data.get("order_total", 0) or 0),
            "commission": 0,
        },
        "collectedAt": data.get("collected_at", ""),
    }

    for url in [f"{API_BASE}/platforms/report-metrics"]:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    body = await resp.text()
                    print(f"  POST {url} -> HTTP {resp.status}")
                    if resp.status in (200, 201):
                        print(f"  ✅ 上传成功")
                        return True
                    print(f"  Body: {body[:300]}")
        except Exception as e:
            print(f"  ❌ {url}: {e}")
    return False


async def main():
    print("=" * 55)
    print("视频号全量采集 + 本地存储 + 云端上传")
    print("=" * 55)

    data = await collect_all()

    # 保存 JSON
    out = "C:/Users/EDY/Pictures/weixin_full_collect.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)
    print(f"\n✅ JSON: {out}")

    # 写入本地 DB
    print("\n--- 本地 DB ---")
    save_to_local_db(data)

    # 上传后端
    print("\n--- 上传后端 ---")
    ok = await upload_to_server(data)

    print("\n" + "=" * 55)
    print("📊 采集结果:")
    keys = {
        "follower_count": "粉丝数",
        "video_count": "视频数",
        "play_count": "播放量",
        "share_count": "分享",
        "comment_count": "评论",
        "daily_new_followers": "每日新增关注",
        "revenue": "成交金额",
        "order_count": "成交订单",
        "buyer_count": "成交人数",
        "avg_order_value": "客单价",
        "refund_orders": "退款订单",
        "order_amount": "下单金额",
        "refund_amount": "退款金额",
        "order_total": "下单订单",
        "order_people": "下单人数",
        "product_exposure": "商品曝光",
        "product_clicks": "商品点击",
        "product_revenue": "商品成交金额",
    }
    for k, label in keys.items():
        v = data.get(k)
        if v is not None and v != 0:
            if "金额" in label or "客单价" in label:
                print(f"  {label}: ¥{v:,.0f}" if isinstance(v, (int,float)) and v==int(v) else f"  {label}: ¥{v}")
            else:
                print(f"  {label}: {int(v):,}" if isinstance(v, (int,float)) and v==int(v) else f"  {label}: {v}")

    if ok:
        print("\n✅ 全部完成")
    else:
        print("\n⚠️ 本地保存成功，云端上传失败，需检查后端")

    return data


if __name__ == "__main__":
    asyncio.run(main())
