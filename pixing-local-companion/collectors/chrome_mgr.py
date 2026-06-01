"""披星云本地伴侣 v4 — Chrome CDP 进程管理器

精准管理 Chrome 进程：启动/停止/保活，PID 级别控制，不误杀其他 Chrome。
"""

import subprocess
import time
import json
import urllib.request
import urllib.error
import os
import signal
from pathlib import Path

try:
    import websocket
    _HAS_WEBSOCKET = True
except ImportError:
    _HAS_WEBSOCKET = False


class ChromeManager:
    def __init__(self, port: int = 9222, profile_dir: str = None):
        self.port = port
        self.profile_dir = profile_dir or str(Path(__file__).parent.parent / "chrome_profile")
        self._process = None
        self._pid = None
        self._cdp_url = f"http://localhost:{port}"

    def _find_chrome(self) -> str:
        """查找系统 Chrome 路径"""
        candidates = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        ]
        for p in candidates:
            if os.path.exists(p):
                return p
        raise FileNotFoundError("未找到 Chrome，请安装 Google Chrome")

    def start(self, headless: bool = False) -> bool:
        """启动 Chrome CDP 调试模式"""
        if self.is_running():
            return True

        chrome = self._find_chrome()
        Path(self.profile_dir).mkdir(parents=True, exist_ok=True)

        args = [
            chrome,
            f"--remote-debugging-port={self.port}",
            f"--user-data-dir={self.profile_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-networking",
            "--disable-sync",
            "--disable-features=TranslateUI",
            "--disable-extensions",
            "--disable-component-extensions-with-background-pages",
        ]
        if headless:
            args.append("--headless=new")

        try:
            self._process = subprocess.Popen(
                args,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            self._pid = self._process.pid

            # 等待 CDP 就绪
            deadline = time.time() + 15
            while time.time() < deadline:
                try:
                    resp = urllib.request.urlopen(f"{self._cdp_url}/json/version", timeout=2)
                    data = json.loads(resp.read().decode())
                    self._pid = int(data.get("Browser", "").split("/")[-1]) or self._pid
                    return True
                except Exception:
                    time.sleep(0.5)

            return False
        except Exception:
            return False

    def is_running(self) -> bool:
        """检测 Chrome 是否在运行"""
        try:
            urllib.request.urlopen(f"{self._cdp_url}/json/version", timeout=2)
            return True
        except Exception:
            return False

    def stop(self):
        """精准停止 Chrome 进程"""
        if self._pid:
            try:
                # 尝试通过 CDP 获取准确 PID
                resp = urllib.request.urlopen(f"{self._cdp_url}/json/version", timeout=2)
                data = json.loads(resp.read().decode())
                pid = int(data.get("Browser", "").split("/")[-1])
            except Exception:
                pid = self._pid

            try:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                                   capture_output=True, timeout=5)
                else:
                    os.kill(pid, signal.SIGTERM)
            except Exception:
                pass

        if self._process:
            try:
                self._process.terminate()
                self._process.wait(timeout=5)
            except Exception:
                try:
                    self._process.kill()
                except Exception:
                    pass

        self._process = None
        self._pid = None

    def new_page(self) -> dict:
        """通过 CDP 创建新页面"""
        req = urllib.request.Request(
            f"{self._cdp_url}/json/new",
            data=b"{}",
            headers={"Content-Type": "application/json"},
        )
        resp = urllib.request.urlopen(req, timeout=5)
        return json.loads(resp.read().decode())

    def get_pages(self) -> list:
        """获取所有页面"""
        resp = urllib.request.urlopen(f"{self._cdp_url}/json/list", timeout=5)
        return json.loads(resp.read().decode())

    def close_page(self, page_id: str):
        """关闭指定页面"""
        req = urllib.request.Request(
            f"{self._cdp_url}/json/close/{page_id}",
            data=b"{}",
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=5)

    def evaluate(self, page_id: str, expression: str, timeout: int = 10) -> str:
        """在指定页面执行 JS 并返回结果（通过 CDP WebSocket）"""
        if not _HAS_WEBSOCKET:
            raise ImportError("websocket-client is required. Install: pip install websocket-client")

        ws_url = None
        for page in self.get_pages():
            if page["id"] == page_id:
                ws_url = page["webSocketDebuggerUrl"]
                break
        if not ws_url:
            raise RuntimeError(f"Page {page_id} not found")

        ws = websocket.create_connection(ws_url, timeout=timeout)
        try:
            msg = json.dumps({
                "id": 1,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": expression,
                    "returnByValue": True,
                    "awaitPromise": True,
                }
            })
            ws.send(msg)
            result = ws.recv()
            data = json.loads(result)
            if "result" in data and "result" in data["result"]:
                return str(data["result"]["result"].get("value", ""))
            if "error" in data:
                raise RuntimeError(data["error"].get("message", str(data)))
            return ""
        finally:
            ws.close()
