"""账号管理页面 — 查看绑定账号、扫码登录"""

from nicegui import ui


class AccountsPage:
    def __init__(self, db, chrome):
        self.db = db
        self.chrome = chrome
        self.render()

    def render(self):
        ui.label("👤 账号管理").classes("text-2xl font-bold mb-4")

        accounts = self.db.get_all_accounts()

        if not accounts:
            with ui.card().classes("w-full"):
                ui.label("暂无账号").classes("text-lg")
                ui.label("请先在各平台登录后，通过数据采集页面自动识别账号").classes("text-gray-400")
            return

        # ── 平台分组 ──
        by_platform = {}
        for acc in accounts:
            by_platform.setdefault(acc["platform"], []).append(acc)

        platform_names = {"douyin": "抖音", "kuaishou": "快手", "xiaohongshu": "小红书"}

        for platform, accs in by_platform.items():
            name = platform_names.get(platform, platform)
            ui.label(f"🏷️ {name} ({len(accs)} 个账号)").classes("text-lg font-bold mt-4 mb-2")

            for acc in accs:
                with ui.card().classes("w-full mb-2"):
                    with ui.row().classes("items-center gap-4"):
                        # 头像
                        if acc.get("avatar_url"):
                            ui.image(acc["avatar_url"]).classes("w-12 h-12 rounded-full")
                        else:
                            ui.icon("person").classes("text-3xl")

                        with ui.column().classes("flex-1"):
                            ui.label(acc["nickname"] or "未知").classes("text-lg font-bold")
                            ui.label(f"粉丝: {acc['follower_count']:,}  |  作品: {acc['video_count']}  |  获赞: {acc['like_count']:,}").classes("text-sm text-gray-500")
                            if acc.get("bio"):
                                ui.label(acc["bio"]).classes("text-xs text-gray-400 line-clamp-2")

                        if acc["verified"]:
                            ui.badge("已认证", color="blue")

                        ui.label(f"最后采集: {acc['last_collected'][:16] if acc.get('last_collected') else '未采集'}").classes("text-xs text-gray-500")

        # ── 添加账号引导 ──
        ui.separator()
        with ui.card().classes("w-full mt-4"):
            ui.label("➕ 添加新账号").classes("text-lg font-bold")
            ui.label("1. 打开对应平台的创作者后台").classes("text-sm")
            ui.label("2. 在已登录的浏览器中扫码完成登录").classes("text-sm")
            ui.label("3. 回到数据采集页面，选中平台后点击「开始采集」").classes("text-sm")
            ui.label("系统将自动识别并保存您的账号信息").classes("text-xs text-gray-400 mt-2")
