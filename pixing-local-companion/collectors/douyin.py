"""抖音采集器 — 访问 creator.douyin.com 创作者服务平台"""

import re
import uuid
from .base import BaseCollector, parse_count, safe_extract


class DouyinCollector(BaseCollector):
    platform = "douyin"
    target_url = "https://creator.douyin.com"

    def _extract_account(self) -> dict:
        text = self._get_page_text()

        # 昵称
        nickname = self._query_text('[data-e2e="creator-name"]') or \
                   safe_extract(r'@(\S+)', text) or \
                   self._query_text('.creator-name') or \
                   self._query_text('.account-name')

        # 平台UID — 从页面 URL 或 Cookie
        uid = self.chrome.evaluate(self._page_id, """
            (() => {
                const m = location.href.match(/creator\\.douyin\\.com\\/creator-micro\\/home\\?enter_from=[^&]*&event_type=[^&]*&user_id=([^&]+)/);
                if (m) return m[1];
                const m2 = document.cookie.match(/passport_csrf_token=([^;]+)/);
                return m2 ? 'dy_' + m2[1].slice(0, 12) : 'unknown';
            })()
        """) or "unknown"

        # 粉丝
        follower_count = 0
        for sel in ['[data-e2e="fans-count"]', '.fans-count', '.follower-num', '.follower-count']:
            v = self._query_text(sel)
            if v:
                follower_count = parse_count(v)
                break
        if not follower_count:
            m = re.search(r'粉丝[：:]?\s*([\d,.]+[万wW亿]?)', text)
            if m:
                follower_count = parse_count(m.group(1))

        # 关注
        following_count = 0
        m = re.search(r'关注[：:]?\s*([\d,.]+)', text)
        if m:
            following_count = parse_count(m.group(1))

        # 获赞
        like_count = 0
        m = re.search(r'(?:获赞|点赞)[：:]?\s*([\d,.]+[万wW亿]?)', text)
        if m:
            like_count = parse_count(m.group(1))

        # 作品数
        video_count = 0
        m = re.search(r'(?:作品|视频)[：:]?\s*([\d,.]+)', text)
        if m:
            video_count = parse_count(m.group(1))

        # 认证
        verified = 1 if ("认证" in text and ("企业" in text or "个人" in text or "机构" in text)) else 0
        verified_type = ""
        if verified:
            vm = re.search(r'(企业|个人|机构)认证', text)
            if vm:
                verified_type = vm.group(1)

        # 简介
        bio = safe_extract(r'简介[：:]\s*(.+?)(?:\n|$)', text) or ""

        # 头像
        avatar_url = self.chrome.evaluate(self._page_id, """
            (() => {
                const el = document.querySelector('[data-e2e="creator-avatar"] img, .avatar img, .creator-avatar img');
                return el ? el.src : '';
            })()
        """) or ""

        return {
            "platform_uid": str(uid),
            "nickname": nickname,
            "avatar_url": str(avatar_url),
            "bio": bio,
            "follower_count": follower_count,
            "following_count": following_count,
            "like_count": like_count,
            "video_count": video_count,
            "verified": verified,
            "verified_type": verified_type,
        }

    def _extract_contents(self) -> list:
        """提取作品列表 — 从创作者后台作品管理页"""
        result = []

        # 跳到作品管理页
        self.chrome.evaluate(self._page_id, """
            (() => {
                const links = [...document.querySelectorAll('a')];
                const workLink = links.find(a => a.innerText.includes('作品') || a.innerText.includes('内容') || a.href.includes('work') || a.href.includes('content'));
                if (workLink) { workLink.click(); return 'clicked'; }
                // 尝试直接导航
                const m = location.href.match(/(https:\\/\\/creator\\.douyin\\.com[^"]+)/);
                if (m) { location.href = m[1].replace(/\\/home.*/, '/work-manage'); return 'navigated'; }
                return 'not_found';
            })()
        """)
        import time
        time.sleep(4)

        # 提取作品数据
        raw = self.chrome.evaluate(self._page_id, """
            (() => {
                const items = document.querySelectorAll('[data-e2e="work-item"], .work-item, .video-item, [class*="work"], [class*="video-card"]');
                if (items.length === 0) {
                    // 尝试表格行
                    const rows = document.querySelectorAll('table tbody tr');
                    return JSON.stringify({type: 'table', count: rows.length,
                        html: [...rows].slice(0, 30).map(r => r.innerText).join('|||')});
                }
                return JSON.stringify({type: 'cards', count: items.length,
                    html: [...items].slice(0, 30).map(el => el.innerText).join('|||')});
            })()
        """)

        import json
        try:
            data = json.loads(str(raw))
            items_text = data.get("html", "").split("|||")

            for i, item_text in enumerate(items_text):
                if not item_text.strip():
                    continue

                content_data = {
                    "content_id": f"{self.platform}_{uuid.uuid4().hex[:8]}",
                    "title": safe_extract(r'^(.+?)(?:\d|播放|赞)', item_text),
                    "cover_url": "",
                    "content_url": "",
                    "content_type": "video",
                    "published_at": safe_extract(r'(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})', item_text),
                    "play_count": 0,
                    "like_count": 0,
                    "comment_count": 0,
                    "share_count": 0,
                    "collect_count": 0,
                }

                # 播放量
                pm = re.search(r'(?:播放|浏览量?)[：:]?\s*([\d,.]+[万wW亿]?)', item_text)
                if pm:
                    content_data["play_count"] = parse_count(pm.group(1))

                # 点赞
                lm = re.search(r'(?:点赞|赞)[：:]?\s*([\d,.]+[万wW亿]?)', item_text)
                if lm:
                    content_data["like_count"] = parse_count(lm.group(1))

                # 评论
                cm = re.search(r'(?:评论|回复)[：:]?\s*([\d,.]+[万wW亿]?)', item_text)
                if cm:
                    content_data["comment_count"] = parse_count(cm.group(1))

                # 分享
                sm = re.search(r'(?:分享|转发)[：:]?\s*([\d,.]+[万wW亿]?)', item_text)
                if sm:
                    content_data["share_count"] = parse_count(sm.group(1))

                if content_data["play_count"] > 0 or content_data["like_count"] > 0:
                    result.append(content_data)

        except json.JSONDecodeError:
            pass

        return result
