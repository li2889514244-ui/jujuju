"""披星云本地伴侣 v4 — 主入口

启动 NiceGUI 桌面窗口 + Chrome CDP + 调度器。
双击 启动伴侣.bat 或直接 python main.py
"""

import sys
import os
import logging

# 确保项目根目录在 sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pathlib import Path
from config import load, save, DEFAULTS
from models.database import Database
from collectors.chrome_mgr import ChromeManager
from scheduler import Scheduler
from ui.dashboard import DashboardPage
from ui.accounts import AccountsPage
from ui.collect import CollectPage

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("companion")

# ─── 全局实例 ────────────────────────────────────
cfg = load()
db = Database(cfg["db_path"])
chrome = ChromeManager(port=cfg["chrome_port"], profile_dir=cfg["chrome_profile"])
scheduler = Scheduler(db, chrome, interval_minutes=cfg["collect_interval_minutes"])

# 启用的平台
enabled_platforms = [k for k, v in cfg["platforms"].items() if v.get("enabled")]
scheduler.set_platforms(enabled_platforms)


def main():
    """NiceGUI 主窗口"""
    from nicegui import ui, app

    dark = cfg.get("theme", "dark") == "dark"
    if dark:
        ui.dark_mode().enable()

    # ── 页面状态 ──
    page = {"current": "dashboard"}
    content_ref = None

    # ── 状态栏 ──
    with ui.header(elevated=True).classes("items-center justify-between"):
        ui.label("⚙️ 披星云本地伴侣 v4").classes("text-lg font-bold")
        with ui.row().classes("gap-4"):
            status_label = ui.label("● 就绪").classes("text-green-400 text-sm")
            theme_btn = ui.button("☀️ 亮色" if dark else "🌙 暗色", on_click=lambda: toggle_theme())

    def toggle_theme():
        nonlocal dark
        dark = not dark
        cfg["theme"] = "dark" if dark else "light"
        save(cfg)
        if dark:
            ui.dark_mode().enable()
        else:
            ui.dark_mode().disable()
        theme_btn.set_text("☀️ 亮色" if dark else "🌙 暗色")
        theme_btn.update()

    def update_status(msg: str, color: str = "green-400"):
        status_label.set_text(msg)
        status_label.classes(replace=f"text-{color} text-sm")

    # ── 左侧导航 + 右侧内容 ──
    with ui.left_drawer().classes("bg-primary") as drawer:
        ui.label("导航").classes("text-xs text-gray-500 uppercase px-2 pt-2")

        def nav_to(p: str):
            page["current"] = p
            if content_ref:
                content_ref.refresh()

        ui.button("📊 仪表盘", on_click=lambda: nav_to("dashboard")).props("flat align=left").classes("w-full")
        ui.button("👤 账号管理", on_click=lambda: nav_to("accounts")).props("flat align=left").classes("w-full")
        ui.button("📥 数据采集", on_click=lambda: nav_to("collect")).props("flat align=left").classes("w-full")
        ui.separator()
        ui.label("状态").classes("text-xs text-gray-500 uppercase px-2 pt-2")
        ui.label("● 等待启动").classes("text-xs px-2")

    # ── 页面路由 ──
    with ui.column().classes("w-full p-4"):
        @ui.refreshable
        def content():
            p = page["current"]
            if p == "dashboard":
                DashboardPage(db, scheduler)
            elif p == "accounts":
                AccountsPage(db, chrome)
            elif p == "collect":
                CollectPage(db, chrome, scheduler, update_status)
            else:
                DashboardPage(db, scheduler)

        content_ref = content
        content()

    # ── 启动调度器 ──
    scheduler.start()
    update_status("● 运行中")

    # 启动 NiceGUI
    ui.run(
        title="披星云本地伴侣",
        host="127.0.0.1",
        port=cfg["flask_port"],
        reload=False,
        show=True,
        native=True,  # 原生桌面窗口
    )


if __name__ == "__main__":
    main()
