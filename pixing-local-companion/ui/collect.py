"""数据采集页面 — 手动触发采集、查看进度、历史记录"""

from datetime import datetime
from nicegui import ui
from collectors import COLLECTORS


class CollectPage:
    def __init__(self, db, chrome, scheduler, update_status):
        self.db = db
        self.chrome = chrome
        self.scheduler = scheduler
        self.update_status = update_status
        self._collecting = False
        self.render()

    def render(self):
        ui.label("📥 数据采集").classes("text-2xl font-bold mb-4")

        # ── 平台选择 ──
        platform_names = {"douyin": "抖音", "kuaishou": "快手", "xiaohongshu": "小红书"}
        selected = ui.state({"platforms": []})

        with ui.row().classes("gap-4 mb-4"):
            ui.label("选择平台:").classes("self-center")
            for key, name in platform_names.items():
                def make_toggle(k):
                    def toggle():
                        if k in selected["platforms"]:
                            selected["platforms"].remove(k)
                        else:
                            selected["platforms"].append(k)
                        selected.update()
                    return toggle
                ui.checkbox(name, on_change=make_toggle(key)).props("color=primary")

        # ── 操作按钮 ──
        with ui.row().classes("gap-4 mb-4"):
            collect_btn = ui.button("▶ 开始采集", on_click=lambda: self._collect(selected["platforms"], collect_btn, log_area))
            ui.button("📸 拍历史快照", on_click=lambda: self._snapshot_all(log_area))
            ui.button("🔄 停止自动采集", on_click=lambda: self._stop_scheduler())

        # ── 采集日志 ──
        log_area = ui.log(max_lines=50).classes("w-full h-80 font-mono text-sm")

        # ── 最近采集记录 ──
        ui.label("📋 最近采集记录").classes("text-lg font-bold mt-4 mb-2")
        accounts = self.db.get_all_accounts()
        if accounts:
            for acc in accounts[:10]:
                name = platform_names.get(acc["platform"], acc["platform"])
                with ui.row().classes("gap-4 text-sm"):
                    ui.label(f"[{name}]").classes("text-gray-500")
                    ui.label(acc["nickname"] or "—").classes("font-bold")
                    ui.label(f"粉丝:{acc['follower_count']:,}").classes("text-gray-500")
                    ui.label(f"最后采集: {acc['last_collected'][:16] if acc.get('last_collected') else '—'}").classes("text-gray-400")
        else:
            ui.label("暂无采集记录").classes("text-gray-400")

    async def _collect(self, platforms: list, btn, log):
        if self._collecting:
            ui.notify("采集进行中，请稍候", type="warning")
            return

        if not platforms:
            ui.notify("请先选择至少一个平台", type="warning")
            return

        self._collecting = True
        btn.props("loading")
        btn.disable()
        self.update_status("⏳ 采集中...", "yellow-400")

        log.push(f"========== {datetime.now():%H:%M:%S} 开始采集 ==========")

        for p in platforms:
            name = {"douyin": "抖音", "kuaishou": "快手", "xiaohongshu": "小红书"}.get(p, p)
            log.push(f"[{name}] 开始采集...")
            ui.run_javascript(f"document.querySelector('.q-scrollarea').scrollTop = 99999")

            result = self.scheduler.collect_once(p)

            if result.get(p, {}).get("success"):
                acc = result[p].get("account", {})
                cnt = result[p].get("contents_collected", 0)
                log.push(f"[{name}] ✅ 成功 | 账号:{acc.get('nickname','?')} | 粉丝:{acc.get('follower_count',0):,} | 作品:{cnt}条")
            else:
                err = result.get(p, {}).get("error", "未知错误")
                log.push(f"[{name}] ❌ 失败: {err}")

        log.push(f"========== {datetime.now():%H:%M:%S} 采集完成 ==========")
        btn.props(remove="loading")
        btn.enable()
        self._collecting = False
        self.update_status("● 运行中", "green-400")
        ui.notify("采集完成", type="positive")

    def _snapshot_all(self, log):
        log.push(f"========== {datetime.now():%H:%M:%S} 拍摄历史快照 ==========")
        self.scheduler.snapshot_all()
        log.push("✅ 快照完成")
        ui.notify("历史快照已保存", type="positive")

    def _stop_scheduler(self):
        self.scheduler.stop()
        self.update_status("⏸ 已停止", "gray-400")
        ui.notify("自动采集已停止", type="info")
