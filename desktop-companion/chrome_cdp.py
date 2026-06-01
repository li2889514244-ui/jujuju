"""
Chrome CDP 进程管理器 v2
用于披星云伴侣 — 启动带远程调试端口的用户真实 Chrome，
让 Playwright 通过 connect_over_cdp 连接，获取真实浏览器指纹。

用法:
  from chrome_cdp import ChromeCDP

  cdp = ChromeCDP()
  cdp.start(open_url='http://localhost:5409', app_mode=True)
  url = cdp.get_url()            # http://localhost:9222
  cdp.stop()                     # 关闭 Chrome
"""

import os
import shutil
import subprocess
import sys
import time
import urllib.request
import json
from pathlib import Path

DEFAULT_PORT = 9222
_SYSDRIVE = os.environ.get('SystemDrive', 'C:')
DEFAULT_CHROME_PATHS = [
    f'{_SYSDRIVE}/Program Files/Google/Chrome/Application/chrome.exe',
    f'{_SYSDRIVE}/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
    f'{_SYSDRIVE}/Program Files/Microsoft/Edge/Application/msedge.exe',
    f'{_SYSDRIVE}/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]


class ChromeCDP:
    def __init__(self, port=DEFAULT_PORT, chrome_path=None, user_data_dir=None):
        self.port = port
        self.url = f'http://127.0.0.1:{port}'
        self._process = None

        if chrome_path and os.path.exists(chrome_path):
            self._chrome_exe = chrome_path
        else:
            self._chrome_exe = _find_chrome(chrome_path)

        if user_data_dir:
            self._user_data_dir = Path(user_data_dir)
        else:
            # 便携模式：profile 放在 app 同目录，不依赖 %LOCALAPPDATA%
            self._user_data_dir = Path(os.path.dirname(os.path.abspath(sys.argv[0]))) / 'chrome_profile'

    @property
    def is_running(self):
        """Chrome 是否在运行（检测子进程或 CDP 端口）"""
        if self._process is not None and self._process.poll() is None:
            return True
        return _check_port(self.port)

    def start(self, open_url=None, app_mode=False):
        """启动 Chrome。如果旧实例残留（上次未正常退出），先 kill 再启动"""
        # ── 先干掉旧 Chrome 残留 ──
        if _check_port(self.port):
            old_pid = _get_cdp_pid(self.port)
            print(f'[CDP] 检测到旧 Chrome 残留 (PID={old_pid})，清理中...')
            _kill_chrome(self.port)
            # 等待端口释放
            deadline = time.time() + 10
            while time.time() < deadline:
                if not _check_port(self.port):
                    break
                time.sleep(0.5)
            if _check_port(self.port):
                raise RuntimeError(f'无法释放端口 {self.port}，请手动关闭 Chrome 后重试')

        if self._chrome_exe is None:
            raise RuntimeError('未找到 Chrome/Edge 浏览器')

        self._user_data_dir.mkdir(parents=True, exist_ok=True)

        # 预创建 First Run 标记，禁用 Chrome 首次引导/欢迎页
        first_run = self._user_data_dir / 'First Run'
        if not first_run.exists():
            first_run.touch()
        local_state = self._user_data_dir / 'Local State'
        if not local_state.exists():
            local_state.write_text('{}', encoding='utf-8')

        args = [
            str(self._chrome_exe),
            f'--remote-debugging-port={self.port}',
            f'--user-data-dir={str(self._user_data_dir)}',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-extensions',
            '--disable-features=ChromeWhatsNewUI',
            '--disable-fre',
            '--disable-background-networking',
            '--disable-sync',
            '--metrics-recording-only',
            '--disable-component-update',
            '--safebrowsing-disable-auto-update',
        ]
        if app_mode and open_url:
            args.append(f'--app={open_url}')
            args.append('--window-size=1100,700')
        else:
            args.append(open_url or 'about:blank')

        print(f'[CDP] 启动 Chrome: {self._chrome_exe}')
        print(f'[CDP] Profile: {self._user_data_dir}')

        self._process = subprocess.Popen(
            args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        # 等待 CDP 端口就绪
        deadline = time.time() + 90
        started = False
        while time.time() < deadline:
            if _check_port(self.port):
                started = True
                break
            time.sleep(0.5)
        if not started:
            print('[CDP] 首次启动超时，清理 Profile 重试...')
            self._process.terminate()
            try: self._process.wait(timeout=5)
            except: self._process.kill()
            _rmtree(self._user_data_dir)
            self._user_data_dir.mkdir(parents=True, exist_ok=True)
            (self._user_data_dir / 'First Run').touch()
            (self._user_data_dir / 'Local State').write_text('{}', encoding='utf-8')
            self._process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            deadline = time.time() + 90
            while time.time() < deadline:
                if _check_port(self.port):
                    started = True
                    break
                time.sleep(0.5)
        if started:
            print(f'[CDP] Chrome 就绪: {self.url}')
            return
        raise RuntimeError(f'Chrome 启动超时，端口 {self.port} 未就绪。请关闭所有 Chrome 窗口后重试')

    def stop(self):
        """关闭 Chrome 进程"""
        # 优先用子进程句柄
        if self._process and self._process.poll() is None:
            print('[CDP] 关闭 Chrome...')
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
            print('[CDP] Chrome 已关闭')
            return
        # 兜底：用 CDP API 关闭
        if _check_port(self.port):
            print('[CDP] 通过 CDP 关闭 Chrome...')
            _kill_chrome(self.port)

    def get_url(self):
        return self.url


def _check_port(port):
    """检查 CDP 端口是否已就绪"""
    try:
        resp = urllib.request.urlopen(f'http://127.0.0.1:{port}/json/version', timeout=2)
        json.loads(resp.read())
        return True
    except Exception:
        return False


def _get_cdp_pid(port):
    """通过 CDP 获取浏览器进程 PID"""
    try:
        resp = urllib.request.urlopen(f'http://127.0.0.1:{port}/json/version', timeout=2)
        data = json.loads(resp.read())
        # Chrome 的 Browser process PID 在某些版本可能不可用
        # 回退：从 webSocketDebuggerUrl 解析
        pid = data.get('Browser-Pid') or data.get('pid')
        if pid:
            return int(pid)
    except Exception:
        pass
    return 'unknown'


def _kill_chrome(port):
    """仅终止占用指定 CDP 端口的 Chrome 进程（不影响其他 Chrome 窗口）"""
    try:
        # 先通过 CDP 获取浏览器 PID
        resp = urllib.request.urlopen(f'http://127.0.0.1:{port}/json/version', timeout=2)
        data = json.loads(resp.read())
        pid = data.get('Browser-Pid') or data.get('pid')
        if pid:
            pid = int(pid)
            subprocess.run(['taskkill', '/F', '/PID', str(pid)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           timeout=10)
            print(f'[CDP] 已终止 Chrome (PID={pid})')
            return
    except Exception:
        pass

    # 兜底：查端口占用进程
    try:
        result = subprocess.run(
            ['netstat', '-ano'],
            capture_output=True, timeout=10
        )
        stdout_text = result.stdout.decode('gbk', errors='ignore') if result.stdout else ''
        if not stdout_text:
            return
        for line in stdout_text.splitlines():
            if f':{port}' in line and 'LISTENING' in line:
                parts = line.strip().split()
                pid_str = parts[-1]
                subprocess.run(['taskkill', '/F', '/PID', pid_str],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               timeout=10)
                print(f'[CDP] 已终止端口 {port} 占用进程 (PID={pid_str})')
                return
    except Exception as e:
        print(f'[CDP] 端口占用清理失败: {e}')


def _find_chrome(preferred=None):
    """查找 Chrome/Edge 可执行文件"""
    if preferred and os.path.exists(preferred):
        return preferred
    for p in DEFAULT_CHROME_PATHS:
        if os.path.exists(p):
            return p
    return None


def _rmtree(path):
    """安全递归删除目录（忽略权限错误）"""
    def _on_error(func, p, exc_info):
        pass
    shutil.rmtree(str(path), onerror=_on_error)
