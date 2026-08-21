"""
披星云伴侣 — 系统托盘管理器
提供：
  - 系统托盘图标（状态变色：绿=正常 / 橙=采集中 / 红=异常 / 灰=未登录）
  - 右键菜单：打开主界面 / 全量采集 / 暂停定时采集 / 退出
  - 双击托盘图标打开主界面
  - 气泡通知（采集完成、错误等）
"""
import sys
import time
import threading
import urllib.request
import json
from pathlib import Path

try:
    import pystray
    from PIL import Image, ImageDraw
    _HAS_TRAY = True
except ImportError:
    _HAS_TRAY = False

# ── 常量 ──
APP_NAME = "披星云伴侣"
APP_URL = "http://localhost:5409"
ICON_PATH = Path(__file__).parent / "app_icon.ico"

# 状态枚举
STATUS_IDLE = "idle"          # 正常运行，空闲
STATUS_COLLECTING = "collect"  # 正在采集
STATUS_ERROR = "error"         # 出错
STATUS_OFFLINE = "offline"     # 未登录 / 未配置
STATUS_STOPPING = "stopping"   # 正在退出


def _create_status_icon(status=STATUS_IDLE):
    """根据状态生成托盘图标（带颜色圆点）。优先使用 ico 文件作为底图。"""
    color_map = {
        STATUS_IDLE: "#22c55e",       # 绿
        STATUS_COLLECTING: "#f59e0b",  # 橙
        STATUS_ERROR: "#ef4444",       # 红
        STATUS_OFFLINE: "#9ca3af",     # 灰
        STATUS_STOPPING: "#6366f1",    # 紫
    }
    color = color_map.get(status, "#22c55e")

    # 尝试加载 ico 文件
    if ICON_PATH.exists():
        try:
            img = Image.open(str(ICON_PATH))
            img = img.convert("RGBA")
            # 在右下角画一个状态点
            w, h = img.size
            r = max(4, w // 8)
            draw = ImageDraw.Draw(img)
            cx, cy = w - r - 2, h - r - 2
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color, outline="#ffffff", width=2)
            return img
        except Exception:
            pass

    # 回退：纯绘制图标
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # 外圆（深蓝底）
    draw.ellipse([4, 4, size - 4, size - 4], fill="#1e293b", outline="#334155", width=2)
    # 内圆（状态色）
    margin = 16
    draw.ellipse([margin, margin, size - margin, size - margin], fill=color)
    # 中心字母 P
    try:
        from PIL import ImageFont
        font = ImageFont.truetype("arial.ttf", 22)
    except Exception:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), "P", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1]), "P", fill="#ffffff", font=font)
    return img


class TrayManager:
    """管理系统托盘图标和菜单。"""

    def __init__(self, on_open=None, on_quick_collect=None,
                 on_full_collect=None, on_toggle_pause=None, on_exit=None):
        """
        Args:
            on_open: 打开主界面回调
            on_quick_collect: 兼容旧版本的采集回调（菜单不再展示）
            on_full_collect: 全量采集回调
            on_toggle_pause: 暂停/恢复定时采集回调
            on_exit: 退出回调
        """
        self.on_open = on_open or (lambda: None)
        self.on_quick_collect = on_quick_collect or (lambda: None)
        self.on_full_collect = on_full_collect or (lambda: None)
        self.on_toggle_pause = on_toggle_pause or (lambda: None)
        self.on_exit = on_exit or (lambda: None)

        self._icon = None
        self._status = STATUS_OFFLINE
        self._tooltip = APP_NAME
        self._paused = False
        self._lock = threading.Lock()

    @property
    def status(self):
        return self._status

    @property
    def is_paused(self):
        return self._paused

    def set_status(self, status, tooltip=None):
        """更新托盘图标状态。线程安全。"""
        with self._lock:
            self._status = status
            if tooltip:
                self._tooltip = tooltip
            else:
                tooltips = {
                    STATUS_IDLE: f"{APP_NAME} — 运行中",
                    STATUS_COLLECTING: f"{APP_NAME} — 采集中…",
                    STATUS_ERROR: f"{APP_NAME} — 有异常",
                    STATUS_OFFLINE: f"{APP_NAME} — 未登录",
                    STATUS_STOPPING: f"{APP_NAME} — 正在退出…",
                }
                self._tooltip = tooltips.get(status, APP_NAME)

        if self._icon:
            try:
                self._icon.icon = _create_status_icon(status)
                self._icon.title = self._tooltip
            except Exception:
                pass

    def notify(self, title, message, duration=3):
        """发送气泡通知。"""
        if self._icon:
            try:
                self._icon.notify(message, title)
            except Exception:
                pass

    def _build_menu(self):
        """构建右键菜单。"""
        return pystray.Menu(
            pystray.MenuItem(
                "打开主界面",
                self._on_open_clicked,
                default=True,  # 双击触发
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                "全量采集",
                self._on_full_clicked,
            ),
            pystray.MenuItem(
                lambda _: ("恢复定时采集" if self._paused else "暂停定时采集"),
                self._on_pause_clicked,
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                "退出",
                self._on_exit_clicked,
            ),
        )

    # ── 菜单回调 ──
    def _on_open_clicked(self, icon=None, item=None):
        try:
            self.on_open()
        except Exception:
            pass

    def _on_quick_clicked(self, icon=None, item=None):
        try:
            self.on_quick_collect()
        except Exception:
            pass

    def _on_full_clicked(self, icon=None, item=None):
        try:
            self.on_full_collect()
        except Exception:
            pass

    def _on_pause_clicked(self, icon=None, item=None):
        self._paused = not self._paused
        try:
            self.on_toggle_pause(self._paused)
        except Exception:
            pass
        verb = "已暂停" if self._paused else "已恢复"
        self.notify(APP_NAME, f"定时采集{verb}")

    def _on_exit_clicked(self, icon=None, item=None):
        self.set_status(STATUS_STOPPING)
        try:
            self.on_exit()
        except Exception:
            pass
        if self._icon:
            self._icon.stop()

    # ── 生命周期 ──
    def run(self):
        """在主线程中运行托盘图标。阻塞调用。"""
        if not _HAS_TRAY:
            print("[Tray] pystray 不可用，回退到无托盘模式", file=sys.stderr)
            # 回退：简单等待
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                self.on_exit()
            return

        icon_image = _create_status_icon(self._status)
        self._icon = pystray.Icon(
            "pixingyun-mate",
            icon_image,
            self._tooltip,
            self._build_menu(),
        )
        self._icon.run()

    def stop(self):
        """停止托盘图标。"""
        if self._icon:
            try:
                self._icon.stop()
            except Exception:
                pass


# ── 后台状态轮询线程 ──
def start_status_poller(tray: TrayManager, interval=5):
    """启动后台线程，定期轮询 Flask 健康状态并更新托盘图标。

    Returns:
        threading.Thread: daemon 线程
    """
    def _poll():
        while True:
            try:
                # 1. 检查 Flask 是否在线
                try:
                    resp = urllib.request.urlopen(f"{APP_URL}/health", timeout=2)
                    data = json.loads(resp.read().decode("utf-8"))
                    flask_ok = True
                except Exception:
                    flask_ok = False
                    data = {}

                if not flask_ok:
                    tray.set_status(STATUS_OFFLINE)
                    time.sleep(interval)
                    continue

                # 2. 检查是否已登录
                try:
                    resp2 = urllib.request.urlopen(f"{APP_URL}/api/config", timeout=2)
                    cfg = json.loads(resp2.read().decode("utf-8"))
                    configured = cfg.get("configured", False)
                except Exception:
                    configured = False

                if not configured:
                    tray.set_status(STATUS_OFFLINE)
                    time.sleep(interval)
                    continue

                # 3. 检查采集状态
                try:
                    resp3 = urllib.request.urlopen(f"{APP_URL}/api/data-collection/status", timeout=2)
                    dc = json.loads(resp3.read().decode("utf-8"))
                    if dc.get("running"):
                        progress = dc.get("progress", {})
                        nick = progress.get("nickname", "")
                        cur = progress.get("current", 0)
                        tot = progress.get("total", 0)
                        tray.set_status(STATUS_COLLECTING, f"{APP_NAME} — 采集 {nick} ({cur}/{tot})")
                    else:
                        tray.set_status(STATUS_IDLE)
                except Exception:
                    tray.set_status(STATUS_IDLE)

            except Exception:
                pass
            time.sleep(interval)

    t = threading.Thread(target=_poll, daemon=True, name="TrayStatusPoller")
    t.start()
    return t
