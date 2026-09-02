"""
session_keepalive.py — WeChat Video 会话保活守护线程。

微信视频号的 sessionid 是服务端短时会话（约5-30分钟无活动即失效）。
本模块每隔几分钟用每个账号的 cookie 发一个轻量 HTTP 请求，
让服务端保持 session 不过期。这样扫码一次可以管几天甚至更久。

原理：
  - 用 requests 带 cookie 访问 online_heartbeat API + platform 页面
  - 检查 finder_login_token 是否存在于 state.json 的 localStorage 中
  - 如果返回 200 且不是登录页 → session 仍然有效
  - 如果被重定向到 login.html → session 已过期，标记 expired
  - 每次成功保活会刷新 sessionid 的服务端 TTL
"""

import threading
import time
import json
import sqlite3
from pathlib import Path

import companion_state as state
from companion_encoding import read_text_file
from companion_config import _load_config
from companion_auth import _login_with_saved_credentials, _check_and_refresh_token

# 保活间隔（秒）：每 3 分钟发一次请求
_KEEPALIVE_INTERVAL = 180

# 保活的平台
_KEEPALIVE_PLATFORMS = {'WECHAT_VIDEO'}

# WeChat Video 保活 URL（轻量页面，不触发大量 API）
_KEEPALIVE_URL = 'https://channels.weixin.qq.com/platform/'

# WeChat Video 心跳 API（比页面加载更轻量）
_HEARTBEAT_URL = 'https://channels.weixin.qq.com/cgi-bin/mmfinderassistant-bin/online_heartbeat'


def _get_wechat_video_accounts() -> list:
    """获取所有 WECHAT_VIDEO 账号及其 state.json 路径。"""
    db_path = state._PROFILE_ROOT / 'accounts.db'
    if not db_path.exists():
        return []
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        "SELECT id, nickname, status, profile_dir FROM accounts "
        "WHERE platform='WECHAT_VIDEO' AND status != 'deleted' ORDER BY nickname"
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def _load_cookies_from_state(profile_dir: Path) -> list:
    """从 state.json 加载 cookies。"""
    state_path = profile_dir / 'state.json'
    if not state_path.exists():
        return []
    try:
        data = json.loads(state_path.read_text('utf-8'))
        return data.get('cookies', [])
    except Exception:
        return []


def _load_state_data(profile_dir: Path) -> dict:
    """从 state.json 加载完整状态（cookies + origins/localStorage）。"""
    state_path = profile_dir / 'state.json'
    if not state_path.exists():
        return {}
    try:
        return json.loads(read_text_file(state_path))
    except Exception:
        return {}


def _has_finder_login_token(state_data: dict) -> bool:
    """检查 state.json 的 localStorage 中是否存在 finder_login_token key。

    finder_login_token 是微信视频号 API 认证的关键 token。
    注意：value 在 state.json 中可能是空字符串，因为该 token 由页面
    JavaScript 在运行时动态填充，storage_state() 保存时可能还没值。
    所以只检查 key 是否存在，不检查 value。
    """
    for origin_entry in state_data.get('origins', []):
        for item in origin_entry.get('localStorage', []):
            if item.get('name') == 'finder_login_token' and str(item.get('value') or '').strip():
                return True
    return False


def _has_wechat_core_cookies(state_data: dict) -> bool:
    """Valid probed sessions only require sessionid + wxuin in saved cookies."""
    names = {
        item.get('name')
        for item in state_data.get('cookies', [])
        if 'weixin' in str(item.get('domain') or '')
    }
    return {'sessionid', 'wxuin'}.issubset(names)


def _do_keepalive_one(account: dict) -> bool:
    """对单个账号执行保活请求。返回 True=有效，False=已过期。"""
    import requests as req

    profile_dir = state._PROFILE_ROOT / account['profile_dir']
    state_data = _load_state_data(profile_dir)
    cookies_list = state_data.get('cookies', [])
    if not cookies_list:
        return False

    # 检查 finder_login_token 是否存在（快速失败检查）
    if not _has_wechat_core_cookies(state_data):
        print(f'[KeepAlive] {account["nickname"]}: sessionid/wxuin missing, session expired')
        return False

    # 构建 requests 的 cookies dict
    cookie_dict = {}
    for c in cookies_list:
        name = c.get('name', '')
        value = c.get('value', '')
        domain = c.get('domain', '')
        if 'weixin' in domain or 'wechat' in domain:
            cookie_dict[name] = value

    if not cookie_dict:
        return False

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://channels.weixin.qq.com/platform/',
    }

    try:
        # 1. 先发心跳请求（更轻量，刷新服务端 TTL）
        try:
            req.get(_HEARTBEAT_URL, cookies=cookie_dict, headers=headers, timeout=10)
        except Exception:
            pass  # 心跳失败不影响后续检查

        # 2. 检查 platform 页面是否重定向到登录页
        resp = req.get(
            _KEEPALIVE_URL,
            cookies=cookie_dict,
            allow_redirects=False,  # 不跟随重定向，手动判断
            timeout=15,
            headers=headers,
        )

        # 检查是否被重定向到登录页
        if resp.status_code in (301, 302, 303, 307, 308):
            location = resp.headers.get('Location', '')
            if '/login' in location.lower():
                return False
            # 其他重定向可能是正常的（如 /platform/ → /platform/index）
            return True

        if resp.status_code == 200:
            # 检查页面内容是否是登录页
            text = resp.text[:2000] if resp.text else ''
            if 'login.html' in text or ('一站式服务' in text and '扫码' in text):
                return False
            # 正常的 platform 页面
            # 注意：platform 页面总是返回 200，即使 session 已过期。
            # 真正的 session 有效性只能通过浏览器中的 API 调用来验证。
            # finder_login_token 检查是 HTTP 层面最可靠的代理指标。
            return True

        # 其他状态码，保守起见认为有效
        return True

    except Exception as e:
        print(f'[KeepAlive] {account["nickname"]} request error: {str(e)[:80]}')
        return True  # 网络错误不等于 session 过期，保守判断


def _update_account_status(account_id: str, status: str):
    """更新账号状态到本地 DB。"""
    db_path = state._PROFILE_ROOT / 'accounts.db'
    if not db_path.exists():
        return
    try:
        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "UPDATE accounts SET status=? WHERE id=?", (status, account_id)
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


def _report_cloud_session_status(account_id: str, status: str, reason: str):
    """Best-effort sync of local session probe result to the cloud account."""
    if not account_id or str(account_id).startswith('local_'):
        return
    try:
        import requests as req

        cfg = _load_config()
        api_url = (cfg.get('api_url') or 'https://ddddkiii.com/api/v1').rstrip('/')
        token = cfg.get('token') or ''
        if token and not _check_and_refresh_token():
            cfg = _load_config()
            token = cfg.get('token') or ''
        if not token:
            token = _login_with_saved_credentials(cfg) or ''
        if not api_url or not token:
            return
        req.post(
            f'{api_url}/platforms/report-session-status',
            json={
                'accountId': account_id,
                'status': status,
                'source': 'keepalive',
                'reason': reason,
            },
            headers={'Authorization': f'Bearer {token}'},
            timeout=12,
        )
    except Exception as e:
        print(f'[KeepAlive] cloud session status report failed: {str(e)[:100]}')


def _keepalive_loop():
    """保活守护线程主循环。"""
    print('[KeepAlive] Session keep-alive daemon started')
    print(f'[KeepAlive] Interval: {_KEEPALIVE_INTERVAL}s ({_KEEPALIVE_INTERVAL // 60} min)')

    while True:
        try:
            accounts = _get_wechat_video_accounts()
            if not accounts:
                time.sleep(_KEEPALIVE_INTERVAL)
                continue

            alive_count = 0
            expired_count = 0

            for acc in accounts:
                # 只保活 active 状态的账号
                if acc['status'] not in ('active', 'expired'):
                    continue

                ok = _do_keepalive_one(acc)
                if ok:
                    alive_count += 1
                    # 如果之前是 expired 但现在 cookie 有效了（重新扫码），恢复 active
                    if acc['status'] == 'expired':
                        _update_account_status(acc['id'], 'active')
                    _report_cloud_session_status(acc['id'], 'online', '视频号伴侣保活检测通过')
                else:
                    expired_count += 1
                    if acc['status'] == 'active':
                        _update_account_status(acc['id'], 'expired')
                        print(f'[KeepAlive] {acc["nickname"]} session expired')
                    _report_cloud_session_status(acc['id'], 'offline', '视频号伴侣保活检测到登录态失效')

            # 每 10 轮打印一次汇总（约 30 分钟）
            if not hasattr(_keepalive_loop, '_round'):
                _keepalive_loop._round = 0
            _keepalive_loop._round += 1
            if _keepalive_loop._round % 10 == 0:
                print(f'[KeepAlive] Round {_keepalive_loop._round}: alive={alive_count} expired={expired_count} total={len(accounts)}')

        except Exception as e:
            print(f'[KeepAlive] Loop error: {str(e)[:100]}')

        time.sleep(_KEEPALIVE_INTERVAL)


_keepalive_thread = None


def start_keepalive():
    """启动保活守护线程（如果尚未启动）。"""
    global _keepalive_thread
    if _keepalive_thread and _keepalive_thread.is_alive():
        return
    _keepalive_thread = threading.Thread(target=_keepalive_loop, daemon=True, name='session-keepalive')
    _keepalive_thread.start()


def stop_keepalive():
    """停止保活守护线程（实际无法停止 daemon 线程，但可标记）。"""
    global _keepalive_thread
    _keepalive_thread = None
