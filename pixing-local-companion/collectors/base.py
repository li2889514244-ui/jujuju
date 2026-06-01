"""披星云本地伴侣 v4 — 采集器基类

通用采集逻辑：
1. 启动/复用 Chrome CDP
2. 创建新页面，导航到目标 URL
3. 等待页面加载，执行 JS 提取数据
4. 解析数据，写入数据库
"""

import re
import time
import logging
from abc import ABC, abstractmethod
from .chrome_mgr import ChromeManager
from models.database import Database

logger = logging.getLogger(__name__)


def parse_count(text: str) -> int:
    """解析中文数字: "12.3w" → 123000, "1.2亿" → 120000000, "9999" → 9999"""
    if not text:
        return 0
    text = str(text).strip().replace(",", "").replace("，", "").replace(" ", "")
    try:
        if "亿" in text:
            return int(float(text.replace("亿", "")) * 100_000_000)
        if "w" in text.lower() or "万" in text:
            return int(float(text.lower().replace("w", "").replace("万", "")) * 10_000)
        return int(float(text))
    except (ValueError, TypeError):
        return 0


def safe_extract(pattern: str, text: str, group: int = 1) -> str:
    m = re.search(pattern, text)
    return m.group(group).strip() if m else ""


class BaseCollector(ABC):
    """平台采集器基类"""

    def __init__(self, chrome: ChromeManager, db: Database):
        self.chrome = chrome
        self.db = db
        self._page_id = None

    @property
    @abstractmethod
    def platform(self) -> str:
        """平台标识: douyin/kuaishou/xiaohongshu"""
        ...

    @property
    @abstractmethod
    def target_url(self) -> str:
        """创作者后台主页 URL"""
        ...

    def collect(self) -> dict:
        """执行采集：账号数据 + 作品列表 → 写入数据库 → 返回结果"""
        logger.info(f"[{self.platform}] 开始采集...")

        if not self.chrome.is_running():
            self.chrome.start()

        page = self.chrome.new_page()
        self._page_id = page["id"]

        try:
            # 导航到目标页面
            self.chrome.evaluate(self._page_id, f"window.location.href = '{self.target_url}'")
            time.sleep(3)  # 等待页面跳转

            # 等待关键元素出现
            self._wait_for_page()

            # 提取账号数据
            account_data = self._extract_account()
            logger.info(f"[{self.platform}] 账号: {account_data.get('nickname')} | 粉丝: {account_data.get('follower_count')}")

            # 提取作品列表
            contents = self._extract_contents()
            logger.info(f"[{self.platform}] 作品: {len(contents)} 条")

            # 写入数据库
            account_id = self.db.upsert_account(
                self.platform,
                account_data.get("platform_uid", ""),
                account_data,
            )

            content_ids = []
            for c in contents:
                cid = self.db.upsert_content(self.platform, c["content_id"], account_id, c)
                content_ids.append(cid)

            return {
                "success": True,
                "platform": self.platform,
                "account": account_data,
                "account_id": account_id,
                "contents_collected": len(contents),
                "content_ids": content_ids,
            }

        except Exception as e:
            logger.error(f"[{self.platform}] 采集失败: {e}")
            return {"success": False, "platform": self.platform, "error": str(e)}
        finally:
            if self._page_id:
                try:
                    self.chrome.close_page(self._page_id)
                except Exception:
                    pass
            self._page_id = None

    def _wait_for_page(self):
        """等待页面就绪 — 子类可覆写"""
        self.chrome.evaluate(self._page_id, """
            new Promise(resolve => {
                const check = () => {
                    if (document.body && document.body.innerText.length > 500) {
                        resolve(true);
                    } else {
                        setTimeout(check, 500);
                    }
                };
                check();
            });
        """)
        time.sleep(2)

    @abstractmethod
    def _extract_account(self) -> dict:
        """提取账号数据，返回字典"""
        ...

    @abstractmethod
    def _extract_contents(self) -> list:
        """提取作品列表，返回 [{content_id, title, ...}, ...]"""
        ...

    def _get_page_text(self) -> str:
        """获取页面全文"""
        return str(self.chrome.evaluate(self._page_id, "document.body.innerText") or "")

    def _query_text(self, selector: str) -> str:
        """获取单个元素文字"""
        return str(self.chrome.evaluate(
            self._page_id,
            f"(() => {{ const el = document.querySelector('{selector}'); return el ? el.innerText : ''; }})()"
        ) or "")
