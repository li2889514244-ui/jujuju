"""
douyin_api_collector.py — 抖音 API 数据采集模块
================================================
基于 Evil0ctal/Douyin_TikTok_Download_API 的 43 个端点定义，
通过 Playwright page.evaluate() 在浏览器上下文中直接调用抖音内部 API，
无需 X-Bogus/A-Bogus 签名（浏览器上下文天然可信）。

数据产出: 兼容现有 companion_app.py 的 metrics + video_stats 格式，
直接对接 _run_collection_once() → local_db → backend 的数据流。

参考: https://github.com/Evil0ctal/Douyin_TikTok_Download_API
"""

import time
import json
import asyncio
import logging
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════
# 抖音内部 API 端点（来自 Evil0ctal）
# ═══════════════════════════════════════════════════════════════

DOUYIN_API_BASE = "https://www.douyin.com"

DOUYIN_ENDPOINTS = {
    # ── 用户相关 ──
    "USER_DETAIL":       "/aweme/v1/web/user/profile/other/",
    "USER_IM_INFO":      "/aweme/v1/web/im/user/info/",
    "USER_FOLLOWING":    "/aweme/v1/web/user/following/list/",
    "USER_FOLLOWER":     "/aweme/v1/web/user/follower/list/",

    # ── 作品相关 ──
    "POST_DETAIL":       "/aweme/v1/web/aweme/detail/",
    "USER_POST":         "/aweme/v1/web/aweme/post/",
    "USER_FAVORITE_A":   "/aweme/v1/web/aweme/favorite/",
    "USER_FAVORITE_B":   "/web/api/v2/aweme/like/",
    "USER_COLLECTION":   "/aweme/v1/web/aweme/listcollection/",
    "COLLECTION_LIST":   "/aweme/v1/web/collects/list/",
    "COLLECTION_VIDEOS": "/aweme/v1/web/collects/video/list/",
    "MIX_AWEME":         "/aweme/v1/web/mix/aweme/",
    "HISTORY_READ":      "/aweme/v1/web/history/read/",
    "LOCATE_POST":       "/aweme/v1/web/locate/post/",
    "MUSIC_COLLECTION":  "/aweme/v1/web/music/listcollection/",
    "RELATED_FEED":      "/aweme/v1/web/aweme/related/",

    # ── Feed / 推荐 ──
    "TAB_FEED":          "/aweme/v1/web/tab/feed/",
    "FAMILIAR_FEED":     "/aweme/v1/web/familiar/feed/",
    "FOLLOW_FEED":       "/aweme/v1/web/follow/feed/",
    "CHANNEL_FEED":      "/aweme/v1/web/channel/feed/",

    # ── 评论 / 弹幕 ──
    "POST_COMMENT":       "/aweme/v1/web/comment/list/",
    "POST_COMMENT_REPLY": "/aweme/v1/web/comment/list/reply/",

    # ── 搜索 ──
    "GENERAL_SEARCH":    "/aweme/v1/web/general/search/single/",
    "VIDEO_SEARCH":      "/aweme/v1/web/search/item/",
    "USER_SEARCH":       "/aweme/v1/web/discover/search/",
    "SUGGEST_WORDS":     "/aweme/v1/web/api/suggest_words/",
    "HOT_SEARCH":        "/aweme/v1/web/hot/search/list/",

    # ── 直播 ──
    "LIVE_INFO":         "/webcast/room/web/enter/",
    "LIVE_INFO_ROOM_ID": "/webcast/room/reflow/info/",
    "LIVE_GIFT_RANK":    "/webcast/ranklist/audience/",
    "LIVE_USER_INFO":    "/webcast/user/me/",
    "LIVE_FOLLOW_FEED":  "/webcast/web/feed/follow/",
    "LIVE_SEARCH":       "/aweme/v1/web/live/search/",
}


# ═══════════════════════════════════════════════════════════════
# 设备指纹（模仿真实浏览器，降低风控）
# ═══════════════════════════════════════════════════════════════

def build_device_fingerprint() -> Dict[str, Any]:
    """返回用于 page.evaluate() 的设备指纹 JSON。"""
    return {
        "aid": 6383,
        "device_platform": "webapp",
        "version_code": "170400",
        "channel": "channel_pc_web",
        "pc_client_type": 1,
        "cookie_enabled": "true",
        "browser_language": "zh-CN",
        "browser_platform": "Win32",
        "browser_online": "true",
    }


# ═══════════════════════════════════════════════════════════════
# 核心 API 调用（page.evaluate → window.fetch）
# ═══════════════════════════════════════════════════════════════

async def _douyin_api_call(
    page,
    endpoint: str,
    params: Dict[str, Any],
    timeout_ms: int = 15000,
    max_retries: int = 3,
) -> Optional[Dict[str, Any]]:
    """
    在浏览器页面上下文中调用抖音内部 API。

    参数:
        page: Playwright Page 对象（必须在 douyin.com 上打开）
        endpoint: API 路径 (如 "/aweme/v1/web/aweme/detail/")
        params: 查询参数字典
        timeout_ms: 超时(毫秒)
        max_retries: 最大重试次数

    返回: 解析后的 JSON dict，失败返回 None
    """
    # 合并设备指纹
    fingerprint = build_device_fingerprint()
    all_params = {**fingerprint, **params}
    param_parts = [f"{k}={v}" for k, v in all_params.items() if v is not None]
    query_string = "&".join(param_parts)
    url = f"{DOUYIN_API_BASE}{endpoint}?{query_string}"

    js_code = f"""
    (async () => {{
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), {timeout_ms});
        try {{
            const response = await window.fetch("{url}", {{
                method: "GET",
                credentials: "include",
                signal: controller.signal,
                headers: {{
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Language": "zh-CN,zh;q=0.9",
                    "Referer": "https://www.douyin.com/",
                }}
            }});
            clearTimeout(timeoutId);
            if (!response.ok) {{
                return {{_error: true, _status: response.status}};
            }}
            const text = await response.text();
            try {{
                return JSON.parse(text);
            }} catch(e) {{
                return {{_error: true, _status: 0, _text: text.slice(0, 500)}};
            }}
        }} catch(e) {{
            clearTimeout(timeoutId);
            return {{_error: true, _status: -1, _message: e.message || String(e)}};
        }}
    }})()
    """

    last_error = None
    for attempt in range(max_retries):
        try:
            result = await page.evaluate(js_code)
        except Exception as e:
            last_error = str(e)
            if attempt < max_retries - 1:
                logger.warning(f"[DouyinAPI] evaluate error (attempt {attempt+1}): {e}")
                await asyncio.sleep(1 + attempt)
            continue

        if isinstance(result, dict) and result.get("_error"):
            http_status = result.get("_status", 0)
            if http_status == 406:
                logger.warning(f"[DouyinAPI] 406 blocked: {endpoint}")
                return None
            if http_status == -1:
                last_error = f"fetch error: {result.get('_message', 'unknown')}"
                if attempt < max_retries - 1:
                    await asyncio.sleep(1 + attempt)
                continue
            if http_status >= 400:
                logger.warning(f"[DouyinAPI] HTTP {http_status}: {endpoint}")
                if http_status in (429, 503):
                    await asyncio.sleep(3 + attempt * 2)
                    continue
                return None

        return result

    logger.error(f"[DouyinAPI] All {max_retries} attempts failed for {endpoint}: {last_error}")
    return None


# ═══════════════════════════════════════════════════════════════
# 数据提取函数
# ═══════════════════════════════════════════════════════════════

async def get_sec_user_id(page) -> Optional[str]:
    """从当前 douyin.com 页面提取 sec_user_id（用于后续 API 调用）。"""
    try:
        result = await page.evaluate("""
        (() => {
            // 尝试从 cookie 或 localStorage 获取
            const cookies = document.cookie;
            // 优先从页面全局变量获取
            if (window.__STORE__ && window.__STORE__.userInfo) {
                return window.__STORE__.userInfo.secUserId || window.__STORE__.userInfo.sec_uid;
            }
            if (window.SS_SEC_USER_ID) return window.SS_SEC_USER_ID;
            // fallback: 从 cookie 提取
            const match = cookies.match(/ss_uid[=]([^;]+)/);
            return match ? match[1] : null;
        })()
        """)
        return result if result else None
    except Exception:
        return None


async def get_user_profile(page, sec_user_id: str) -> Optional[Dict[str, Any]]:
    """获取用户详细信息。"""
    data = await _douyin_api_call(
        page,
        DOUYIN_ENDPOINTS["USER_DETAIL"],
        {"sec_user_id": sec_user_id, "source": "channel_pc_web"},
    )
    if not data:
        return None
    user = data.get("user", {})
    return {
        "nickname": user.get("nickname", ""),
        "avatar_url": user.get("avatar_medium", {}).get("url_list", [""])[0]
                   or user.get("avatar_300x300", {}).get("url_list", [""])[0],
        "bio": user.get("signature", ""),
        "follower_count": user.get("follower_count", 0),
        "following_count": user.get("following_count", 0),
        "video_count": user.get("aweme_count", 0),
        "like_count": user.get("total_favorited", 0),
        "verified": 1 if user.get("custom_verify") or user.get("enterprise_verify_reason") else 0,
        "sec_uid": user.get("sec_uid", sec_user_id),
        "uid": user.get("uid", ""),
    }


async def get_user_posts(
    page, sec_user_id: str, max_cursor: int = 0, count: int = 18
) -> Optional[Dict[str, Any]]:
    """获取用户作品列表（分页）。"""
    data = await _douyin_api_call(
        page,
        DOUYIN_ENDPOINTS["USER_POST"],
        {
            "sec_user_id": sec_user_id,
            "max_cursor": str(max_cursor),
            "count": str(count),
            "cut_version": "1",
        },
    )
    if not data:
        return None
    return {
        "aweme_list": data.get("aweme_list", []),
        "has_more": data.get("has_more", 0),
        "max_cursor": data.get("max_cursor", 0),
    }


async def get_post_detail(page, aweme_id: str) -> Optional[Dict[str, Any]]:
    """获取单条视频/作品详情。"""
    data = await _douyin_api_call(
        page,
        DOUYIN_ENDPOINTS["POST_DETAIL"],
        {"aweme_id": aweme_id},
    )
    if not data:
        return None
    aweme = data.get("aweme_detail") or data.get("aweme", {})
    return aweme


async def get_post_comments(
    page, aweme_id: str, cursor: int = 0, count: int = 20
) -> Optional[Dict[str, Any]]:
    """获取视频评论列表（分页）。"""
    data = await _douyin_api_call(
        page,
        DOUYIN_ENDPOINTS["POST_COMMENT"],
        {"aweme_id": aweme_id, "cursor": str(cursor), "count": str(count)},
    )
    if not data:
        return None
    return {
        "comments": data.get("comments", []),
        "has_more": data.get("has_more", 0),
        "cursor": data.get("cursor", 0),
        "total": data.get("total", 0),
    }


async def get_hot_search(page) -> Optional[List[Dict[str, Any]]]:
    """获取抖音热榜。"""
    data = await _douyin_api_call(
        page,
        DOUYIN_ENDPOINTS["HOT_SEARCH"],
        {},
    )
    if not data:
        return None
    word_list = data.get("data", {}).get("word_list", [])
    hot_items = data.get("data", {}).get("hot_list", [])
    items = word_list or hot_items or []
    return [
        {
            "rank": i + 1,
            "word": item.get("word", ""),
            "hot_value": item.get("hot_value", 0),
            "video_count": item.get("video_count", 0),
        }
        for i, item in enumerate(items[:50])
    ]


async def get_follower_count(page, sec_user_id: str) -> int:
    """快速获取粉丝数（轻量调用）。"""
    profile = await get_user_profile(page, sec_user_id)
    if profile:
        return profile.get("follower_count", 0)
    return 0


# ═══════════════════════════════════════════════════════════════
# 作品数据格式化（转为 companion 兼容格式）
# ═══════════════════════════════════════════════════════════════

def _parse_aweme_stats(aweme: Dict[str, Any]) -> Dict[str, Any]:
    """将抖音 API 返回的单个作品数据转为 companion 的 video_stats 格式。"""
    stats = aweme.get("statistics", {})
    video_info = aweme.get("video", {})
    images = aweme.get("images", [])

    # 提取封面图
    cover_url = ""
    if "cover" in aweme:
        cover_url_list = aweme["cover"].get("url_list", [])
        if cover_url_list:
            cover_url = cover_url_list[0]
    if not cover_url and video_info:
        cover_url_list = video_info.get("cover", {}).get("url_list", [])
        if cover_url_list:
            cover_url = cover_url_list[0]

    # 提取视频时长
    duration = 0
    if video_info:
        duration = int(video_info.get("duration", 0)) // 2000  # 抖音返回毫秒*2

    # 提取图文
    content_type = "video"
    if images:
        content_type = "image"
    if aweme.get("media_type") == 68:  # 图文
        content_type = "image_text"

    return {
        "title": aweme.get("desc", "") or aweme.get("preview_title", ""),
        "contentId": aweme.get("aweme_id", ""),
        "coverUrl": cover_url,
        "contentType": content_type,
        "duration": duration,
        "views": stats.get("play_count", 0),
        "likes": stats.get("digg_count", 0),
        "comments": stats.get("comment_count", 0),
        "shares": stats.get("share_count", 0),
        "saves": stats.get("collect_count", 0),
        "publishedAt": aweme.get("create_time", ""),
        "shareUrl": aweme.get("share_url", ""),
        "musicTitle": aweme.get("music", {}).get("title", ""),
    }


# ═══════════════════════════════════════════════════════════════
# 主采集函数
# ═══════════════════════════════════════════════════════════════

@dataclass
class DouyinCollectionResult:
    """抖音采集结果。"""
    # 兼容 companion 格式的 metrics（账号级指标）
    metrics: Dict[str, Any] = field(default_factory=dict)
    # 兼容 companion 格式的 video_stats（作品列表）
    video_stats: List[Dict[str, Any]] = field(default_factory=list)
    # 额外数据（热榜、评论等）
    extra: Dict[str, Any] = field(default_factory=dict)
    # 是否成功
    success: bool = False
    # 错误信息
    error: str = ""


async def collect_douyin_data(
    page,
    max_posts: int = 200,
    fetch_comments: bool = False,
) -> DouyinCollectionResult:
    """
    抖音全量数据采集主函数。

    参数:
        page: Playwright Page 对象，必须已在 douyin.com 上（已登录）
        max_posts: 最多采集作品数
        fetch_comments: 是否同时采集评论（耗时）

    返回:
        DouyinCollectionResult（包含 metrics 和 video_stats）
    """
    result = DouyinCollectionResult()

    # ── Step 1: 确保在 douyin.com 上 ──
    current_url = page.url
    if "douyin.com" not in current_url:
        try:
            await page.goto("https://www.douyin.com", wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(3)
        except Exception as e:
            result.error = f"Failed to navigate to douyin.com: {e}"
            return result

    # ── Step 2: 获取 sec_user_id ──
    sec_user_id = await get_sec_user_id(page)
    if not sec_user_id:
        # 如果没能从页面获取，尝试从 URL 提取
        logger.warning("[DouyinAPI] Cannot detect sec_user_id, trying alternative methods...")
        # 作为最后的尝试，从个人主页 URL 格式推断
        try:
            await page.goto("https://www.douyin.com/user/self", wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(3)
            sec_user_id = await get_sec_user_id(page)
        except Exception:
            pass

    if not sec_user_id:
        # Fallback: 从当前页面 URL 提取
        import re
        url_match = re.search(r'/user/([A-Za-z0-9_-]+)', current_url)
        if url_match:
            sec_user_id = url_match.group(1)

    if not sec_user_id:
        result.error = "Cannot determine sec_user_id"
        logger.error("[DouyinAPI] Cannot determine sec_user_id — please open douyin.com first or provide manually")
        return result

    logger.info(f"[DouyinAPI] Detected sec_user_id: {sec_user_id[:40]}...")

    # ── Step 3: 采集用户信息 ──
    profile = await get_user_profile(page, sec_user_id)
    if profile:
        result.metrics.update({
            "follower_count": profile["follower_count"],
            "following_count": profile["following_count"],
            "video_count": profile["video_count"],
            "like_count": profile["like_count"],
            "_nickname": profile["nickname"],
            "_avatar": profile["avatar_url"],
            "bio": profile["bio"],
            "verified": profile["verified"],
        })
        logger.info(
            f"[DouyinAPI] Profile: {profile['nickname']}, "
            f"followers={profile['follower_count']}, "
            f"videos={profile['video_count']}"
        )

    # ── Step 4: 采集作品列表（分页循环） ──
    cursor = 0
    all_awemes = []
    page_num = 0

    while len(all_awemes) < max_posts:
        page_num += 1
        posts_data = await get_user_posts(page, sec_user_id, cursor, count=18)
        if not posts_data:
            logger.warning(f"[DouyinAPI] get_user_posts failed at page {page_num}")
            break

        aweme_list = posts_data.get("aweme_list", [])
        if not aweme_list:
            logger.info(f"[DouyinAPI] No more posts at page {page_num}")
            break

        all_awemes.extend(aweme_list)
        has_more = posts_data.get("has_more", 0)
        cursor = posts_data.get("max_cursor", 0)

        logger.info(
            f"[DouyinAPI] Posts page {page_num}: "
            f"fetched {len(aweme_list)}, total={len(all_awemes)}, "
            f"has_more={has_more}"
        )

        if not has_more or cursor == 0:
            break

        # 翻页间隔（避免触发频率限制）
        await asyncio.sleep(1.5)

    # ── Step 5: 格式化作品数据 ──
    result.video_stats = [_parse_aweme_stats(a) for a in all_awemes]

    # 从作品聚合计算总指标
    if all_awemes:
        total_plays = sum(vs.get("views", 0) for vs in result.video_stats)
        total_likes = sum(vs.get("likes", 0) for vs in result.video_stats)
        total_comments = sum(vs.get("comments", 0) for vs in result.video_stats)
        total_shares = sum(vs.get("shares", 0) for vs in result.video_stats)
        result.metrics.update({
            "play_count": total_plays,
            "comment_count": total_comments,
            "share_count": total_shares,
        })

    # ── Step 6 (可选): 采集评论 ──
    if fetch_comments and all_awemes:
        comment_total = 0
        for aweme in all_awemes[:10]:  # 最多采集前 10 个作品的评论
            aweme_id = aweme.get("aweme_id", "")
            if not aweme_id:
                continue
            comments_data = await get_post_comments(page, aweme_id, cursor=0, count=20)
            if comments_data:
                comment_total += comments_data.get("total", 0)
            await asyncio.sleep(1)
        result.extra["comment_total"] = comment_total

    # ── Step 7 (可选): 热榜 ──
    try:
        hot_list = await get_hot_search(page)
        if hot_list:
            result.extra["hot_search"] = hot_list
            logger.info(f"[DouyinAPI] Hot search: {len(hot_list)} items")
    except Exception as e:
        logger.warning(f"[DouyinAPI] Hot search error: {e}")

    result.success = True
    logger.info(
        f"[DouyinAPI] Collection complete: "
        f"profile={profile is not None}, "
        f"posts={len(result.video_stats)}, "
        f"metrics_keys={list(result.metrics.keys())}"
    )
    return result


# ═══════════════════════════════════════════════════════════════
# 便捷函数：采集指定用户（非当前登录用户）
# ═══════════════════════════════════════════════════════════════

async def collect_target_user(
    page,
    target_sec_user_id: str,
    max_posts: int = 100,
) -> DouyinCollectionResult:
    """
    采集任意抖音用户的数据（不需要该用户登录）。

    参数:
        page: Playwright Page（在 douyin.com 上，任意登录用户）
        target_sec_user_id: 目标用户的 sec_user_id
        max_posts: 最多采集作品数

    返回:
        DouyinCollectionResult
    """
    result = DouyinCollectionResult()

    # 用户信息
    profile = await get_user_profile(page, target_sec_user_id)
    if profile:
        result.metrics.update({
            "follower_count": profile["follower_count"],
            "following_count": profile["following_count"],
            "video_count": profile["video_count"],
            "like_count": profile["like_count"],
            "_nickname": profile["nickname"],
            "_avatar": profile["avatar_url"],
            "bio": profile["bio"],
        })

    # 作品列表
    cursor = 0
    all_awemes = []
    while len(all_awemes) < max_posts:
        posts_data = await get_user_posts(page, target_sec_user_id, cursor, count=18)
        if not posts_data:
            break
        aweme_list = posts_data.get("aweme_list", [])
        if not aweme_list:
            break
        all_awemes.extend(aweme_list)
        has_more = posts_data.get("has_more", 0)
        cursor = posts_data.get("max_cursor", 0)
        if not has_more or cursor == 0:
            break
        await asyncio.sleep(1.5)

    result.video_stats = [_parse_aweme_stats(a) for a in all_awemes]
    result.success = True
    return result


# ═══════════════════════════════════════════════════════════════
# 直播数据采集
# ═══════════════════════════════════════════════════════════════

async def get_live_info(page, webcast_id: str = "", room_id: str = "") -> Optional[Dict[str, Any]]:
    """获取直播信息。"""
    if webcast_id:
        data = await _douyin_api_call(
            page,
            DOUYIN_ENDPOINTS["LIVE_INFO"],
            {"web_rid": webcast_id, "room_id_str": ""},
        )
    elif room_id:
        data = await _douyin_api_call(
            page,
            DOUYIN_ENDPOINTS["LIVE_INFO_ROOM_ID"],
            {"room_id": room_id},
        )
    else:
        return None

    if not data:
        return None

    room = data.get("data", {}).get("room", {}) or data.get("data", data)
    return {
        "title": room.get("title", ""),
        "status": room.get("status", 0),
        "user_count": room.get("user_count", 0),
        "like_count": room.get("like_count", 0),
        "owner": room.get("owner", {}).get("nickname", ""),
    }


# ═══════════════════════════════════════════════════════════════
# 搜索
# ═══════════════════════════════════════════════════════════════

async def search_videos(
    page, keyword: str, offset: int = 0, count: int = 20
) -> Optional[List[Dict[str, Any]]]:
    """搜索视频。"""
    data = await _douyin_api_call(
        page,
        DOUYIN_ENDPOINTS["GENERAL_SEARCH"],
        {"keyword": keyword, "offset": str(offset), "count": str(count)},
    )
    if not data:
        return None
    aweme_list = data.get("data", [])
    return [_parse_aweme_stats(a.get("aweme_info", a)) for a in aweme_list]


async def search_users(
    page, keyword: str, offset: int = 0, count: int = 20
) -> Optional[List[Dict[str, Any]]]:
    """搜索用户。"""
    data = await _douyin_api_call(
        page,
        DOUYIN_ENDPOINTS["USER_SEARCH"],
        {"keyword": keyword, "offset": str(offset), "count": str(count)},
    )
    if not data:
        return None
    user_list = data.get("user_list", [])
    return [
        {
            "nickname": u.get("user_info", {}).get("nickname", ""),
            "sec_uid": u.get("user_info", {}).get("sec_uid", ""),
            "follower_count": u.get("user_info", {}).get("follower_count", 0),
            "aweme_count": u.get("user_info", {}).get("aweme_count", 0),
        }
        for u in user_list
    ]
