"""小红书采集器 — 访问 creator.xiaohongshu.com 创作者中心"""

import re
import uuid
from .base import BaseCollector, parse_count, safe_extract


class XiaohongshuCollector(BaseCollector):
    platform = "xiaohongshu"
    target_url = "https://creator.xiaohongshu.com"

    def _extract_account(self) -> dict:
        text = self._get_page_text()

        # 昵称
        nickname = self._query_text('.creator-name') or \
                   self._query_text('.nickname') or \
                   self._query_text('[class*="name"]') or \
                   safe_extract(r'^(?:小红书号[：:]?\s*)?(\S{2,20})', text)

        # UID
        uid = self.chrome.evaluate(self._page_id, """
            (() => {
                const m = location.href.match(/creator\\.xiaohongshu\\.com\\/publish\\/publish/);
                if (m) return 'xhs_unknown';
                const m2 = document.cookie.match(/a1=([^;]+)/);
                return m2 ? 'xhs_' + m2[1].slice(0, 16) : 'xhs_unknown';
            })()
        """) or "xhs_unknown"

        # 粉丝
        follower_count = 0
        m = re.search(r'粉丝[：:]?\s*([\d,.]+[万wW]?)', text)
        if m:
            follower_count = parse_count(m.group(1))

        # 关注
        following_count = 0
        m = re.search(r'关注[：:]?\s*([\d,.]+)', text)
        if m:
            following_count = parse_count(m.group(1))

        # 获赞与收藏（小红书特性）
        like_count = 0
        m = re.search(r'(?:获赞|赞)[：:]?\s*([\d,.]+[万wW]?)', text)
        if m:
            like_count = parse_count(m.group(1))

        collect_count = 0
        m = re.search(r'(?:收藏|获藏)[：:]?\s*([\d,.]+[万wW]?)', text)
        if m:
            collect_count = parse_count(m.group(1))

        # 笔记数
        video_count = 0
        m = re.search(r'(?:笔记|作品|内容)[：:]?\s*([\d,.]+)', text)
        if m:
            video_count = parse_count(m.group(1))

        return {
            "platform_uid": str(uid),
            "nickname": nickname,
            "avatar_url": "",
            "bio": safe_extract(r'(?:简介|描述)[：:]\s*(.+?)(?:\n|$)', text) or "",
            "follower_count": follower_count,
            "following_count": following_count,
            "like_count": like_count,
            "video_count": video_count,
            "verified": 1 if "认证" in text else 0,
            "verified_type": "",
        }

    def _extract_contents(self) -> list:
        """提取笔记列表"""
        result = []

        self.chrome.evaluate(self._page_id, """
            (() => {
                const links = [...document.querySelectorAll('a')];
                const noteLink = links.find(a => a.innerText.includes('笔记') || a.innerText.includes('内容') || a.href.includes('note') || a.href.includes('content'));
                if (noteLink) { noteLink.click(); return 'clicked'; }
                return 'not_found';
            })()
        """)
        import time
        time.sleep(4)

        raw = self.chrome.evaluate(self._page_id, """
            (() => {
                const items = document.querySelectorAll('.note-item, .content-item, [class*="note"], [class*="content-card"]');
                if (items.length === 0) {
                    const all = document.querySelectorAll('[class*="item"], [class*="card"], [class*="list"] > *');
                    return JSON.stringify([...all].slice(0, 30).map(el => el.innerText).join('|||'));
                }
                return JSON.stringify([...items].slice(0, 30).map(el => el.innerText).join('|||'));
            })()
        """)

        import json
        try:
            items_text = json.loads(str(raw)).split("|||")
        except json.JSONDecodeError:
            return result

        for i, item_text in enumerate(items_text):
            if not item_text.strip():
                continue

            # 判断类型：视频 vs 图文
            ctype = "image" if ("图文" in item_text or "图片" in item_text) else "video"

            content_data = {
                "content_id": f"xhs_{uuid.uuid4().hex[:8]}",
                "title": safe_extract(r'^(.+?)(?:\d|阅读|赞|收藏)', item_text),
                "cover_url": "",
                "content_url": "",
                "content_type": ctype,
                "published_at": safe_extract(r'(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})', item_text),
                "play_count": 0,
                "like_count": 0,
                "comment_count": 0,
                "share_count": 0,
                "collect_count": 0,
            }

            # 阅读/播放
            rm = re.search(r'(?:阅读|浏览|播放)[：:]?\s*([\d,.]+[万wW]?)', item_text)
            if rm: content_data["play_count"] = parse_count(rm.group(1))

            # 点赞
            lm = re.search(r'(?:点赞|赞)[：:]?\s*([\d,.]+[万wW]?)', item_text)
            if lm: content_data["like_count"] = parse_count(lm.group(1))

            # 评论
            cm = re.search(r'(?:评论|回复)[：:]?\s*([\d,.]+[万wW]?)', item_text)
            if cm: content_data["comment_count"] = parse_count(cm.group(1))

            # 收藏
            scm = re.search(r'(?:收藏|获藏)[：:]?\s*([\d,.]+[万wW]?)', item_text)
            if scm: content_data["collect_count"] = parse_count(scm.group(1))

            # 分享
            sm = re.search(r'(?:分享|转发)[：:]?\s*([\d,.]+[万wW]?)', item_text)
            if sm: content_data["share_count"] = parse_count(sm.group(1))

            if content_data["play_count"] > 0 or content_data["like_count"] > 0:
                result.append(content_data)

        return result
