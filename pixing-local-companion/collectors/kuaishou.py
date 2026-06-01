"""快手采集器 — 访问 cp.kuaishou.com 创作者中心"""

import re
import uuid
from .base import BaseCollector, parse_count, safe_extract


class KuaishouCollector(BaseCollector):
    platform = "kuaishou"
    target_url = "https://cp.kuaishou.com"

    def _extract_account(self) -> dict:
        text = self._get_page_text()

        # 昵称
        nickname = self._query_text('.profile-name') or \
                   self._query_text('.nickname') or \
                   self._query_text('.user-name') or \
                   safe_extract(r'^(?:@|快手号[：:]?\s*)?(\S{2,20})', text)

        # UID
        uid = self.chrome.evaluate(self._page_id, """
            (() => {
                const m = location.href.match(/profile\\/([^/?]+)/);
                return m ? m[1] : 'ks_unknown';
            })()
        """) or "ks_unknown"

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

        # 获赞（快手通常不直接显示总赞，显示作品数据里聚合）
        like_count = 0
        m = re.search(r'(?:获赞|总赞)[：:]?\s*([\d,.]+[万wW]?)', text)
        if m:
            like_count = parse_count(m.group(1))

        # 作品数
        video_count = 0
        m = re.search(r'(?:作品|视频)[：:]?\s*([\d,.]+)', text)
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
        """提取作品列表"""
        result = []

        self.chrome.evaluate(self._page_id, """
            (() => {
                const links = [...document.querySelectorAll('a')];
                const workLink = links.find(a => a.innerText.includes('作品') || a.innerText.includes('内容管理'));
                if (workLink) { workLink.click(); return 'clicked'; }
                return 'not_found';
            })()
        """)
        import time
        time.sleep(4)

        raw = self.chrome.evaluate(self._page_id, """
            (() => {
                const items = document.querySelectorAll('.video-item, .work-item, [class*="video"], [class*="work-card"]');
                if (items.length === 0) {
                    const rows = document.querySelectorAll('table tbody tr, .list-item');
                    return JSON.stringify([...rows].slice(0, 30).map(r => r.innerText).join('|||'));
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

            content_data = {
                "content_id": f"ks_{uuid.uuid4().hex[:8]}",
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

            pm = re.search(r'(?:播放|浏览)[：:]?\s*([\d,.]+[万wW]?)', item_text)
            if pm: content_data["play_count"] = parse_count(pm.group(1))

            lm = re.search(r'(?:点赞|赞)[：:]?\s*([\d,.]+[万wW]?)', item_text)
            if lm: content_data["like_count"] = parse_count(lm.group(1))

            cm = re.search(r'(?:评论|回复)[：:]?\s*([\d,.]+[万wW]?)', item_text)
            if cm: content_data["comment_count"] = parse_count(cm.group(1))

            sm = re.search(r'(?:分享|转发)[：:]?\s*([\d,.]+[万wW]?)', item_text)
            if sm: content_data["share_count"] = parse_count(sm.group(1))

            if content_data["play_count"] > 0 or content_data["like_count"] > 0:
                result.append(content_data)

        return result
