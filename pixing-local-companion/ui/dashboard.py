"""仪表盘页面 — 数据看板"""

from nicegui import ui


class DashboardPage:
    def __init__(self, db, scheduler):
        self.db = db
        self.scheduler = scheduler
        self.render()

    def render(self):
        data = self.scheduler.get_dashboard()
        stats = data["stats"]
        trends = data["trends"]

        ui.label("📊 数据看板").classes("text-2xl font-bold mb-4")

        # ── 总览卡片 ──
        with ui.row().classes("gap-4 w-full mb-6"):
            with ui.card().classes("flex-1"):
                ui.label("总粉丝").classes("text-sm text-gray-500")
                ui.label(f"{stats['total_followers']:,}").classes("text-3xl font-bold")
            with ui.card().classes("flex-1"):
                ui.label("今日播放").classes("text-sm text-gray-500")
                ui.label(f"{stats['total_plays']:,}").classes("text-3xl font-bold")
            with ui.card().classes("flex-1"):
                ui.label("今日互动").classes("text-sm text-gray-500")
                ui.label(f"{stats['total_likes']:,}").classes("text-3xl font-bold")
            with ui.card().classes("flex-1"):
                ui.label("账号数").classes("text-sm text-gray-500")
                ui.label(f"{data['accounts_count']}").classes("text-3xl font-bold")

        # ── 各平台概览 ──
        if stats["platforms"]:
            ui.label("各平台概览").classes("text-lg font-bold mb-2")
            with ui.row().classes("gap-4 w-full flex-wrap"):
                for platform, pdata in stats["platforms"].items():
                    name = {"douyin": "抖音", "kuaishou": "快手", "xiaohongshu": "小红书"}.get(platform, platform)
                    with ui.card().classes("min-w-[200px]"):
                        ui.label(name).classes("text-sm font-bold")
                        ui.label(f"账号: {pdata['accounts']} | 粉丝: {pdata['followers']:,} | 作品: {pdata['videos']}")
        else:
            ui.label("暂无数据，请先进行账号绑定和数据采集").classes("text-gray-400 mt-4")

        # ── 粉丝趋势 ──
        if trends:
            ui.label("粉丝趋势（近7天）").classes("text-lg font-bold mt-4 mb-2")
            for platform, t in trends.items():
                name = {"douyin": "抖音", "kuaishou": "快手", "xiaohongshu": "小红书"}.get(platform, platform)
                with ui.expansion(f"{name} · {t['nickname']} · {t['current']:,} 粉丝", icon="trending_up").classes("w-full"):
                    for h in t["history"][:7]:
                        change_text = f"+{h['change']:,}" if h['change'] >= 0 else f"{h['change']:,}"
                        color = "text-green-500" if h['change'] >= 0 else "text-red-500"
                        ui.label(f"{h['date']}  {h['count']:,}  ({change_text})").classes(f"text-sm {color}")
        else:
            ui.label("暂无粉丝趋势数据").classes("text-gray-400 mt-2")
