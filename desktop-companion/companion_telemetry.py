"""
companion_telemetry.py — 周期上传运行日志到披星云服务器。

每台设备按 device_id 分目录保存最新日志（latest.log / latest-diag.log），
服务端保留设备注册表，运维可远程排查所有设备的运行状态与报错。
"""
import os
import threading
import time
from pathlib import Path


def _read_tail(path: Path, max_bytes: int) -> str:
    try:
        data = Path(path).read_bytes()
        if len(data) > max_bytes:
            data = data[-max_bytes:]
        return data.decode('utf-8', errors='replace')
    except Exception:
        return ''


def _redact(text: str, secrets) -> str:
    for secret in secrets:
        if secret and len(str(secret)) > 8:
            text = text.replace(str(secret), '[REDACTED]')
    return text


def upload_logs_once(api_url: str, token: str, device_id: str, version: str) -> bool:
    try:
        import requests

        # 打包版（frozen）下 stdout 重定向到 exe 同目录的 companion.log；
        # 源码运行则是模块目录。按两种场景各取一次，优先取非空的那个。
        import sys as _sys
        candidates = []
        if getattr(_sys, 'frozen', False):
            candidates.append(Path(_sys.executable).parent / 'companion.log')
        candidates.append(Path(__file__).resolve().parent / 'companion.log')
        log_text = ''
        for candidate in candidates:
            text = _read_tail(candidate, 600_000)
            if len(text) > len(log_text):
                log_text = text
        appdata = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'MatrixFlow'
        diag_text = _read_tail(appdata / 'webview2-diagnostics.log', 200_000)

        secrets = []
        try:
            from companion_config import _load_config
            cfg = _load_config() or {}
            for key in ('token', 'refreshToken', 'service_token', 'saved_password', '_key'):
                value = str(cfg.get(key) or '').strip()
                if value:
                    secrets.append(value)
        except Exception:
            pass
        log_text = _redact(log_text, secrets)
        diag_text = _redact(diag_text, secrets)

        try:
            import sys as _sys
            install_dir = os.path.dirname(os.path.abspath(_sys.argv[0])) if getattr(_sys, 'frozen', False) else str(Path(__file__).resolve().parent)
        except Exception:
            install_dir = ''
        headers = {'Authorization': f'Bearer {token}'} if token else {}
        # 日志上传与心跳、鉴权使用同一条直连通道，避免系统代理故障把
        # 诊断链路单独打断（历史上这里仍使用 requests.post，生产日志出现过 ProxyError）。
        try:
            from companion_auth import _no_proxy_session
            session = _no_proxy_session()
        except Exception:
            session = requests.Session()
            session.trust_env = False
        response = session.post(
            f"{api_url.rstrip('/')}/platforms/report-logs",
            json={'deviceId': device_id, 'version': version, 'log': log_text, 'diag': diag_text, 'installDir': install_dir},
            headers=headers,
            timeout=30,
        )
        if response.status_code in (200, 201):
            print(f'[Telemetry] log uploaded ({len(log_text)} bytes)')
            return True
        print(f'[Telemetry] log upload HTTP {response.status_code}')
        return False
    except Exception as exc:
        print(f'[Telemetry] log upload failed: {exc}')
        return False


def start_log_upload_daemon() -> None:
    """启动日志上传守护线程：启动 60 秒后上传一次，此后每 30 分钟一次。"""

    def _loop():
        time.sleep(60)
        while True:
            try:
                from companion_config import _load_config, get_device_id
                from companion_state import APP_VERSION

                cfg = _load_config() or {}
                api_url = (cfg.get('api_url') or 'https://ddddkiii.com/api/v1').rstrip('/')
                token = cfg.get('token') or ''
                if token:
                    upload_logs_once(api_url, token, get_device_id(), APP_VERSION)
            except Exception as exc:
                print(f'[Telemetry] daemon tick failed: {exc}')
            time.sleep(1800)

    threading.Thread(target=_loop, daemon=True, name='log-upload-daemon').start()
    print('[Telemetry] log upload daemon started')
