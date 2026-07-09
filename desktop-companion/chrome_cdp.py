"""
Chrome CDP 进程管理器 v4
用于披星云伴侣 — 启动带远程调试端口的浏览器，
让 Playwright 通过 connect_over_cdp 连接。

v4 变更：
  - 优先使用 Playwright 内置 Chromium（无需用户安装 Chrome）
  - 自动下载 Chromium（首次运行时）
  - 增强 anti-detection 启动参数
  - 支持 --disable-features 更多选项

Chrome 149+ 默认将 --remote-debugging-port 绑定到 IPv6 [::1] 而非 IPv4 127.0.0.1。
本模块自动探测两个地址，使用可用的那个。

用法:
  from chrome_cdp import ChromeCDP

  cdp = ChromeCDP()
  cdp.start(open_url='http://localhost:5409', app_mode=True)
  url = cdp.get_url()            # http://[::1]:9222 或 http://127.0.0.1:9222
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

# Chrome 149+ 可能绑定到 IPv6 [::1]，所以同时探测两个地址
_CDP_HOSTS = ['127.0.0.1', '[::1]']


class ChromeCDP:
    def __init__(self, port=DEFAULT_PORT, chrome_path=None, user_data_dir=None):
        self.port = port
        self.url = None  # 在 start() 后通过探测设置
        self._process = None

        if chrome_path and os.path.exists(chrome_path):
            self._chrome_exe = chrome_path
        else:
            # v4: 优先使用 Playwright 内置 Chromium，其次系统 Chrome
            self._chrome_exe = _find_best_browser()

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
        """Start Chrome. Kill stale instances first, with retry logic."""
        # --- Clean up stale Chrome instances ---
        # 只清理有 CDP 响应的 stale 实例（避免误杀用户的常规 Chrome）
        cleanup_attempts = 0
        while cleanup_attempts < 3:
            stale_url = _probe_cdp(self.port)
            if not stale_url:
                break
            cleanup_attempts += 1
            old_pid = _get_cdp_pid(self.port)
            print(f'[CDP] Stale Chrome detected (PID={old_pid}) at {stale_url}, attempt {cleanup_attempts}/3...')
            _kill_chrome(self.port)
            # Wait for port release
            deadline = time.time() + 15
            while time.time() < deadline:
                if not _probe_cdp(self.port):
                    break
                time.sleep(0.5)

        # --- Clean profile lock files from previous crashed session ---
        _clean_profile_locks(self._user_data_dir)

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
            '--disable-fre',
            '--disable-background-networking',
            '--disable-sync',
            '--metrics-recording-only',
            '--disable-component-update',
            '--safebrowsing-disable-auto-update',
            # ── 防 CGI / 自动化检测（关键） ──
            '--disable-blink-features=AutomationControlled',
            '--disable-features=ChromeWhatsNewUI,AutomationControlled,IsolateOrigins,site-per-process',
            # 伪装语言和区域
            '--lang=zh-CN',
            '--accept-lang=zh-CN,zh,en-US;q=0.9,en;q=0.8',
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

        # Wait for CDP port with health check — probe both IPv4 and IPv6
        deadline = time.time() + 90
        started = False
        while time.time() < deadline:
            working_url = _probe_cdp(self.port)
            if working_url:
                self.url = working_url
                started = True
                break
            # Check if process died
            if self._process and self._process.poll() is not None:
                exit_code = self._process.returncode
                print(f'[CDP] Chrome exited unexpectedly (code={exit_code}), retrying with clean profile...')
                break
            time.sleep(0.5)
        if not started:
            print('[CDP] First launch timed out, cleaning Profile and retrying...')
            if self._process:
                try: self._process.terminate()
                except: pass
                try: self._process.wait(timeout=5)
                except: self._process.kill()
            _rmtree(self._user_data_dir)
            self._user_data_dir.mkdir(parents=True, exist_ok=True)
            (self._user_data_dir / 'First Run').touch()
            (self._user_data_dir / 'Local State').write_text('{}', encoding='utf-8')
            _clean_profile_locks(self._user_data_dir)
            self._process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            deadline = time.time() + 90
            while time.time() < deadline:
                working_url = _probe_cdp(self.port)
                if working_url:
                    self.url = working_url
                    started = True
                    break
                if self._process and self._process.poll() is not None:
                    exit_code = self._process.returncode
                    print(f'[CDP] Chrome exited on retry (code={exit_code})')
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



def _clean_profile_locks(profile_dir):
    """Remove stale lock files that prevent Chrome from starting."""
    for name in ['lockfile', 'SingletonLock', 'SingletonSocket', 'SingletonCookie']:
        p = profile_dir / name
        if p.exists():
            try:
                p.unlink()
                print(f'[CDP] Cleaned stale lock: {name}')
            except Exception:
                pass


def _probe_cdp(port):
    """尝试 IPv4 和 IPv6 两个地址，返回可用的 CDP base URL（如 'http://[::1]:9222'）。

    Chrome 149+ 默认将 --remote-debugging-port 绑定到 IPv6 [::1]。
    如果用户的常规 Chrome 恰好占用了 IPv4 127.0.0.1:9222（返回 404），
    本函数会跳过它并找到 IPv6 上的 CDP 端点。

    Returns:
        str: 可用的 CDP base URL，或 None（如果两个地址都不可用）
    """
    for host in _CDP_HOSTS:
        base_url = f'http://{host}:{port}'
        try:
            resp = urllib.request.urlopen(f'{base_url}/json/version', timeout=2)
            data = resp.read()
            if data.startswith(b'{'):
                json.loads(data.decode('utf-8'))
                return base_url
            # 非 JSON 但 200 OK（Chrome --app 模式可能返回 HTML）
            return base_url
        except Exception:
            pass
    # Fallback: try /json/list
    for host in _CDP_HOSTS:
        base_url = f'http://{host}:{port}'
        try:
            urllib.request.urlopen(f'{base_url}/json/list', timeout=2)
            return base_url
        except Exception:
            pass
    return None


def _check_port(port):
    """Check if CDP port is alive on either IPv4 or IPv6."""
    return _probe_cdp(port) is not None


def _get_cdp_pid(port):
    """通过 CDP 获取浏览器进程 PID（尝试 IPv4 和 IPv6）"""
    for host in _CDP_HOSTS:
        try:
            resp = urllib.request.urlopen(f'http://{host}:{port}/json/version', timeout=2)
            data = json.loads(resp.read())
            pid = data.get('Browser-Pid') or data.get('pid')
            if pid:
                return int(pid)
        except Exception:
            pass
    return 'unknown'


def _kill_chrome(port):
    """终止占用指定 CDP 端口的 Chrome 进程（尝试 IPv4 和 IPv6）"""
    # 先通过 CDP API 获取 PID（两个地址都试）
    killed_pids = set()
    for host in _CDP_HOSTS:
        try:
            resp = urllib.request.urlopen(f'http://{host}:{port}/json/version', timeout=2)
            data = json.loads(resp.read())
            pid = data.get('Browser-Pid') or data.get('pid')
            if pid:
                pid = int(pid)
                if pid not in killed_pids:
                    subprocess.run(['taskkill', '/F', '/PID', str(pid)],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   timeout=10)
                    killed_pids.add(pid)
                    print(f'[CDP] 已终止 Chrome (PID={pid})')
        except Exception:
            pass
    if killed_pids:
        return

    # 兜底：查端口占用进程（netstat 会同时列出 IPv4 和 IPv6）
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
                if pid_str == '0':
                    continue
                if pid_str not in killed_pids:
                    subprocess.run(['taskkill', '/F', '/PID', pid_str],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   timeout=10)
                    killed_pids.add(pid_str)
                    print(f'[CDP] 已终止端口 {port} 占用进程 (PID={pid_str})')
    except Exception as e:
        print(f'[CDP] 端口占用清理失败: {e}')


def _find_chrome(preferred=None):
    """查找 Chrome/Edge 可执行文件（旧接口，向后兼容）"""
    if preferred and os.path.exists(preferred):
        return preferred
    for p in DEFAULT_CHROME_PATHS:
        if os.path.exists(p):
            return p
    return None


def _find_best_browser():
    """v4: 优先使用 Playwright 内置 Chromium，其次系统 Chrome。
    
    优先级：
      1. Playwright Chromium（内置，反检测可控，无需用户安装 Chrome）
      2. 本地独立 Chromium
      3. 系统 Chrome / Edge
      4. 自动安装 Playwright Chromium
    """
    try:
        from browser_manager import find_best_browser
        exe, channel = find_best_browser()
        if exe:
            return exe
        # channel 非空时返回 None（让 Playwright 自己找），但 CDP 模式需要实际路径
        # 所以如果找不到，返回 None 并由调用方报错
        return None
    except ImportError:
        # browser_manager 不可用时回退到旧逻辑
        return _find_chrome()


def _rmtree(path):
    """安全递归删除目录（忽略权限错误）"""
    def _on_error(func, p, exc_info):
        pass
    shutil.rmtree(str(path), onerror=_on_error)
