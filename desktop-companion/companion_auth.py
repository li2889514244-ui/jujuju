"""
companion_auth.py — Authentication: login with saved credentials and token refresh.
"""
import time, threading, json, base64

import companion_state as state
from companion_crypto import _get_encryption_key, _decrypt_password, _encrypt_password, _HAS_CRYPTO
from companion_config import _load_config, _save_config

_TOKEN_REFRESH_INTERVAL = state._TOKEN_REFRESH_INTERVAL
_TOKEN_REFRESH_MARGIN = state._TOKEN_REFRESH_MARGIN

# Convenience accessor for config cache
def _CONFIG_CACHE():
    return state._CONFIG_CACHE

def _saved_identifier(cfg: dict) -> str:
    return (cfg.get('saved_identifier') or cfg.get('saved_email') or '').strip()

def _login_payload(identifier: str, password: str) -> dict:
    return {'identifier': identifier.strip(), 'password': password}

def _no_proxy_session():
    """出站 HTTP 会话：显式禁用系统代理（Clash/VPN 等）。

    伴侣到披星云服务器必须直连；系统代理节点故障时，
    登录/刷新会被 TCP RST 打断，导致数据上传整链路失败。
    """
    import requests as req
    session = req.Session()
    session.trust_env = False
    return session


def _login_with_saved_credentials(cfg: dict) -> str:
    """Return a fresh access token using saved credentials or refresh token."""
    import requests as req

    api_url = cfg.get('api_url', 'https://ddddkiii.com/api/v1').rstrip('/')
    if not api_url:
        return ''

    # ---- Path 1: identifier + password login ----
    identifier = _saved_identifier(cfg)
    password = cfg.get('saved_password', '')
    if identifier and password:
        if _HAS_CRYPTO and ':' in password:
            try:
                key = _get_encryption_key()
                password = _decrypt_password(password, key)
            except Exception as _e:
                print(f'[WARN] {type(_e).__name__}: {_e}')
        try:
            with _no_proxy_session() as _s:
                r = _s.post(f'{api_url}/auth/login', json=_login_payload(identifier, password), timeout=15)
            if r.status_code in (200, 201):
                body = r.json()
                inner = body.get('data') or body
                token = inner.get('accessToken') or inner.get('access_token') or ''
                refresh_token = inner.get('refreshToken') or inner.get('refresh_token') or ''
                if token:
                    cfg['token'] = token
                    if refresh_token: cfg['refreshToken'] = refresh_token
                    _save_config(cfg); state._CONFIG_CACHE.update(cfg)
                    return token
            print(f'[Auth] Login failed: HTTP {r.status_code}')
        except Exception as e:
            print(f'[Auth] Login error: {str(e)[:120]}')

    # ---- Path 2: _from_token (static companion token) ----
    from_token = cfg.get('_from_token') or cfg.get('from_token')
    if from_token:
        return from_token

    # ---- Path 3: refresh token -> /auth/refresh ----
    refresh_token = cfg.get('refreshToken') or cfg.get('refresh_token')
    if refresh_token:
        try:
            with _no_proxy_session() as _s:
                r = _s.post(f'{api_url}/auth/refresh', json={'refreshToken': refresh_token}, timeout=15)
            if r.status_code in (200, 201):
                body = r.json()
                inner = body.get('data') or body
                new_token = inner.get('accessToken') or inner.get('access_token') or ''
                new_refresh = inner.get('refreshToken') or inner.get('refresh_token') or ''
                if new_token:
                    cfg['token'] = new_token
                    if new_refresh: cfg['refreshToken'] = new_refresh
                    _save_config(cfg); state._CONFIG_CACHE.update(cfg)
                    print(f'[Auth] Token refreshed via refreshToken')
                    return new_token
            print(f'[Auth] Refresh failed: HTTP {r.status_code}')
        except Exception as e:
            print(f'[Auth] Refresh error: {str(e)[:120]}')

    # ---- Path 4: _pw (encrypted password) last resort ----
    pw = cfg.get('_pw')
    if pw and _HAS_CRYPTO and ':' in pw and identifier:
        try:
            key = _get_encryption_key()
            password = _decrypt_password(pw, key)
            with _no_proxy_session() as _s:
                r = _s.post(f'{api_url}/auth/login', json=_login_payload(identifier, password), timeout=15)
            if r.status_code in (200, 201):
                body = r.json()
                inner = body.get('data') or body
                token = inner.get('accessToken') or inner.get('access_token') or ''
                rt = inner.get('refreshToken') or inner.get('refresh_token') or ''
                if token:
                    cfg['token'] = token
                    if rt: cfg['refreshToken'] = rt
                    _save_config(cfg); state._CONFIG_CACHE.update(cfg)
                    return token
        except Exception as e:
            print(f'[Auth] _pw login error: {str(e)[:120]}')

    return ''


def _decode_jwt_exp(token: str) -> int:
    """Decode JWT exp without depending on PyJWT."""
    if not token or token.count('.') < 2:
        return 0
    payload = token.split('.')[1]
    payload += '=' * (-len(payload) % 4)
    data = json.loads(base64.urlsafe_b64decode(payload.encode()).decode('utf-8'))
    return int(data.get('exp') or 0)


# ══════════════════════════════════════════════════════════════════
# 主动 Token 刷新 — 不等 401 才刷新
# ══════════════════════════════════════════════════════════════════
# Use values from companion_state so they can be tuned in one place.

def _check_and_refresh_token() -> bool:
    """
    主动检查 JWT Token 是否即将过期，如果是则提前刷新。

    返回 True 表示 Token 有效或已成功刷新；
    返回 False 表示 Token 无效且无法刷新。
    """
    cfg = _load_config()
    token = cfg.get('token', '')

    if not token:
        # 没有 Token，尝试用保存的凭据登录
        new_token = _login_with_saved_credentials(cfg)
        if new_token:
            print('[TokenRefresh] 首次登录成功')
            return True
        print('[TokenRefresh] 无 Token 且无法自动登录')
        return False

    # 尝试解码 JWT 检查过期时间
    try:
        exp = _decode_jwt_exp(token)
        remaining = exp - time.time()

        if remaining > _TOKEN_REFRESH_MARGIN:
            # Token 还有效，不需要刷新
            return True

        print(f'[TokenRefresh] Token 将在 {int(remaining)}s 后过期，提前刷新...')
    except Exception:
        # 无法解码，可能格式错误，尝试刷新
        print('[TokenRefresh] Token 无法解码，尝试刷新...')

    # 刷新 Token
    new_token = _login_with_saved_credentials(cfg)
    if new_token:
        print('[TokenRefresh] Token 刷新成功')
        return True
    print('[TokenRefresh] ⚠ Token 刷新失败！数据上传将无法工作，请重新登录。')
    return False


def _token_refresh_loop():
    """后台线程：定期检查并刷新 Token。"""
    print(f'[TokenRefresh] 守护线程启动，每 {_TOKEN_REFRESH_INTERVAL}s 检查一次')
    while True:
        try:
            time.sleep(_TOKEN_REFRESH_INTERVAL)
            _check_and_refresh_token()
        except Exception as e:
            print(f'[TokenRefresh] 异常: {str(e)[:120]}')
            time.sleep(60)  # 出错后等 1 分钟再重试


def _start_token_refresh_daemon():
    """启动 Token 刷新守护线程。"""
    # 启动时立即检查一次
    _check_and_refresh_token()
    # 然后启动后台定期检查
    t = threading.Thread(target=_token_refresh_loop, daemon=True, name='TokenRefresh')
    t.start()
    print('[TokenRefresh] 守护线程已启动')
