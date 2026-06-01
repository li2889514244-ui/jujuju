"""披星云本地伴侣 v4 — 调度器

定时采集 + 历史快照 + 状态管理。
"""

import time
import threading
import logging
from datetime import datetime, date
from typing import Optional, Callable

from collectors import ChromeManager, COLLECTORS
from models.database import Database

logger = logging.getLogger(__name__)


class Scheduler:
    def __init__(self, db: Database, chrome: ChromeManager, interval_minutes: int = 30):
        self.db = db
        self.chrome = chrome
        self.interval = interval_minutes * 60
        self._thread = None
        self._running = False
        self._last_collect: dict[str, datetime] = {}  # platform → last time
        self._status_callback: Optional[Callable] = None
        self._platforms: list[str] = []

    def set_status_callback(self, cb: Callable):
        """设置状态回调，供 UI 层实时更新"""
        self._status_callback = cb

    def set_platforms(self, platforms: list[str]):
        self._platforms = platforms

    @property
    def status(self) -> dict:
        return {
            "running": self._running,
            "last_collect": {k: v.isoformat() if v else None for k, v in self._last_collect.items()},
            "next_collect": (datetime.now().timestamp() + self.interval) if self._running else None,
        }

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info(f"调度器启动，间隔 {self.interval // 60} 分钟")

    def stop(self):
        self._running = False
        logger.info("调度器停止")

    def collect_once(self, platform: str = None) -> dict:
        """手动触发一次采集"""
        platforms = [platform] if platform else self._platforms
        results = {}

        for p in platforms:
            if p not in COLLECTORS:
                results[p] = {"success": False, "error": f"平台 {p} 不支持"}
                continue

            collector = COLLECTORS[p](self.chrome, self.db)
            try:
                results[p] = collector.collect()
                self._last_collect[p] = datetime.now()

                # 采集完成后自动拍快照
                if results[p].get("success"):
                    self._snapshot(results[p])
            except Exception as e:
                results[p] = {"success": False, "error": str(e)}

        self._notify()
        return results

    def _snapshot(self, result: dict):
        """拍历史快照"""
        account_id = result.get("account_id")
        if not account_id:
            return

        # 粉丝历史快照
        self.db.record_follower_snapshot(account_id)

        # 内容历史快照
        for cid in result.get("content_ids", []):
            self.db.record_content_snapshot(cid)

        logger.info(f"[快照] account={account_id} 已记录")

    def snapshot_all(self):
        """对所有账号拍快照"""
        for acc in self.db.get_all_accounts():
            self.db.record_follower_snapshot(acc["id"])
            for ct in self.db.get_contents(acc["id"], limit=50):
                self.db.record_content_snapshot(ct["id"])
        logger.info("全量快照完成")

    def _loop(self):
        """后台采集循环"""
        # 启动后先跑一次
        self.collect_once()
        self.snapshot_all()

        while self._running:
            # 检查是否需要拍每日快照（凌晨2点）
            now = datetime.now()
            if now.hour == 2 and now.minute < 5:
                self.snapshot_all()

            time.sleep(self.interval)
            if not self._running:
                break
            self.collect_once()

    def _notify(self):
        if self._status_callback:
            try:
                self._status_callback(self.status)
            except Exception:
                pass

    def get_dashboard(self) -> dict:
        """供 UI 调用的仪表盘数据"""
        stats = self.db.get_today_stats()
        accounts = self.db.get_all_accounts()

        # 各平台最近粉丝趋势
        trends = {}
        for acc in accounts:
            history = self.db.get_follower_history(acc["id"], days=7)
            if history:
                trends[acc["platform"]] = {
                    "nickname": acc["nickname"],
                    "current": acc["follower_count"],
                    "history": [{"date": h["date"], "count": h["follower_count"], "change": h["follower_change"]} for h in history],
                }

        return {
            "stats": stats,
            "accounts_count": len(accounts),
            "trends": trends,
            "scheduler": self.status,
        }
