"""
披星云伴侣启动器
- 自动检测环境
- 后台启动 Flask
- 自动打开浏览器
- 出错弹窗提示
"""
import subprocess
import sys
import os
import time
import urllib.request
import threading
import json
import base64
import secrets

# ── 配置 ──
COMPANION_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)))
COMPANION_APP = os.path.join(COMPANION_DIR, "companion_app.py")
PYTHON_EXE = os.path.join(COMPANION_DIR, "..", "..", ".workbuddy", "binaries", "python", "versions", "3.13.12", "python.exe")
# 如果 managed python 不存在，用系统 python
if not os.path.isfile(PYTHON_EXE):
    PYTHON_EXE = sys.executable
URL = "http://localhost:5409"
MAX_WAIT = 15  # 秒


def show_error(msg):
    """弹窗显示错误"""
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, msg, "披星云伴侣 - 启动失败", 0x10)
    except Exception:
        print(f"[ERROR] {msg}", file=sys.stderr)


def open_browser():
    """打开默认浏览器"""
    try:
        os.startfile(URL)
    except Exception:
        subprocess.Popen(["cmd", "/c", "start", URL], shell=False)


def wait_for_server():
    """等待 Flask 服务器就绪"""
    for i in range(MAX_WAIT):
        try:
            urllib.request.urlopen(URL, timeout=1)
            return True
        except Exception:
            time.sleep(1)
    return False


def init_encryption_key():
    """Initialize COMPANION_KEY on first run.
    
    Checks if COMPANION_KEY env var exists. If not, generates a random 
    32-byte key, stores it in companion_config.json._key, and sets the 
    environment variable for the current session.
    """
    companion_key = os.environ.get('COMPANION_KEY', '').strip()
    if companion_key:
        return companion_key

    config_path = os.path.join(COMPANION_DIR, 'companion_config.json')

    # Try reading existing key from config file
    try:
        if os.path.isfile(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
            existing_key = cfg.get('_key', '')
            if existing_key:
                os.environ['COMPANION_KEY'] = existing_key
                return existing_key
    except Exception:
        pass

    # Generate new key (32 bytes → 44 char base64)
    raw_key = secrets.token_bytes(32)
    key_b64 = base64.b64encode(raw_key).decode('ascii')

    # Store in companion_config.json
    try:
        cfg = {}
        if os.path.isfile(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
        cfg['_key'] = key_b64
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[启动器] 警告: 无法保存加密密钥到配置文件: {e}", file=sys.stderr)

    os.environ['COMPANION_KEY'] = key_b64
    print("[启动器] ⚠️  首次运行：已生成加密密钥并保存到 companion_config.json")
    return key_b64


def main():
    # 0. 初始化加密密钥
    init_encryption_key()

    # 1. 检查文件
    if not os.path.isfile(COMPANION_APP):
        show_error(f"找不到伴侣程序:\n{COMPANION_APP}")
        return 1

    if not os.path.isfile(PYTHON_EXE):
        show_error(f"找不到 Python:\n{PYTHON_EXE}\n\n请安装 Python 3.10+")
        return 1

    # 2. 检查端口是否已被占用（说明已启动）
    try:
        urllib.request.urlopen(URL, timeout=1)
        print("[启动器] 伴侣已在运行，直接打开浏览器")
        open_browser()
        return 0
    except Exception:
        pass

    # 3. 启动伴侣进程
    print(f"[启动器] Python: {PYTHON_EXE}")
    print(f"[启动器] 脚本: {COMPANION_APP}")
    try:
        proc = subprocess.Popen(
            [PYTHON_EXE, COMPANION_APP],
            cwd=COMPANION_DIR,
            creationflags=0x00000008,  # DETACHED_PROCESS - 完全脱离，无窗口
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print(f"[启动器] 伴侣进程 PID: {proc.pid}")
    except Exception as e:
        show_error(f"启动失败:\n{e}")
        return 1

    # 4. 等待就绪
    print(f"[启动器] 等待服务器就绪（最多 {MAX_WAIT} 秒）...")
    if not wait_for_server():
        show_error(
            f"伴侣启动超时（{MAX_WAIT}秒内未响应）\n\n"
            f"可能是端口 5409 被占用或依赖缺失。\n"
            f"请尝试手动运行:\n"
            f'cmd → cd {COMPANION_DIR}\n'
            f'→ {PYTHON_EXE} companion_app.py --no-cdp'
        )
        return 1

    # 5. 打开浏览器
    print("[启动器] 服务器就绪，打开浏览器")
    open_browser()

    # 6. 启动器自身退出（伴侣进程已 detached）
    print("[启动器] 完成，启动器退出")
    return 0


if __name__ == "__main__":
    sys.exit(main())
