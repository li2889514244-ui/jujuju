"""
companion_config.py — Config persistence (load/save) and migration.

Stores config in AppData so it survives app updates.
"""
import json, sys, shutil
from pathlib import Path

import companion_state as state
from companion_crypto import (
    _get_encryption_key, _encrypt_password, _decrypt_password, _HAS_CRYPTO,
)

APP_VERSION = state.APP_VERSION
DEFAULT_UPDATE_MANIFEST_URL = state.DEFAULT_UPDATE_MANIFEST_URL

CONFIG_FILE = state._APPDATA_DIR / 'companion_config.json'

# Migrate config from old locations if AppData config doesn't exist yet
if not CONFIG_FILE.exists():
    _old_candidates = []
    if getattr(sys, 'frozen', False):
        _exe_dir = Path(sys.executable).parent
        _old_candidates.append(_exe_dir / 'companion_config.json')
        _old_candidates.append(_exe_dir.parent / 'companion_config.json')
    else:
        _old_candidates.append(state.BASE_DIR / 'companion_config.json')
    for _old in _old_candidates:
        if _old.exists():
            try:
                shutil.copy2(str(_old), str(CONFIG_FILE))
                print(f'[Config] Migrated config from {_old} -> {CONFIG_FILE}')
                break
            except Exception as e:
                print(f'[Config] Migration failed from {_old}: {e}')


def _load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            cfg = json.loads(CONFIG_FILE.read_text(encoding='utf-8-sig'))
            # Decrypt saved_password if encrypted (format: nonce:ciphertext)
            if cfg.get('saved_password') and ':' in cfg['saved_password'] and _HAS_CRYPTO:
                try:
                    key = _get_encryption_key()
                    cfg['saved_password'] = _decrypt_password(cfg['saved_password'], key)
                except Exception as _e:
                    print(f'[WARN] {type(_e).__name__}: {_e}')
            return cfg
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')
    # First launch: generate default config
    default = {
        'api_url': 'https://ddddkiii.com/api/v1',
        'token': '',
        'update_manifest_url': DEFAULT_UPDATE_MANIFEST_URL,
    }
    if not CONFIG_FILE.exists():
        _save_config(default)
    return default


def _save_config(cfg: dict):
    # Encrypt sensitive fields before writing to disk
    safe_cfg = dict(cfg)
    if safe_cfg.get('saved_password') and ':' not in safe_cfg['saved_password'] and _HAS_CRYPTO:
        try:
            key = _get_encryption_key()
            safe_cfg['saved_password'] = _encrypt_password(safe_cfg['saved_password'], key)
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')
    CONFIG_FILE.write_text(json.dumps(safe_cfg, ensure_ascii=False, indent=2),
                           encoding='utf-8')


# Initialize config cache in shared state
state._CONFIG_CACHE = _load_config()


def _get_config_cache() -> dict:
    """Return the current config cache from shared state."""
    return state._CONFIG_CACHE


def _update_config_cache(cfg: dict):
    """Update the shared config cache."""
    state._CONFIG_CACHE.update(cfg)


def get_device_id() -> str:
    """返回稳定设备标识：首次生成后持久化到 config，随机器唯一、跨升级不变。"""
    cfg = _get_config_cache()
    existing = str(cfg.get('device_id') or '').strip()
    if existing:
        return existing
    import hashlib
    import platform
    import uuid

    raw = f"{platform.node()}|{uuid.getnode()}|{platform.machine()}|{platform.system()}"
    device_id = hashlib.sha1(raw.encode('utf-8')).hexdigest()[:16]
    cfg['device_id'] = device_id
    try:
        _save_config(cfg)
    except Exception as _e:
        print(f'[WARN] device_id save failed: {_e}')
    return device_id


def install_companion_request_headers() -> None:
    """给所有发往披星云服务器的出站请求统一注入版本号 + 设备标识请求头。

    在启动早期调用一次即可；通过猴子补丁 requests.Session.request 覆盖所有
    requests 调用路径（账号/抖店/微信上传、保活、鉴权等），且只对本站域名生效。
    """
    try:
        import requests
        from urllib.parse import urlparse

        from companion_state import APP_VERSION

        device_id = get_device_id()
        api_host = 'ddddkiii.com'
        try:
            api_host = (urlparse(str(_get_config_cache().get('api_url') or '')).hostname) or api_host
        except Exception:
            pass
        api_host = (api_host or '').lower()

        original_request = requests.sessions.Session.request

        def _patched_request(self, method, url, **kwargs):
            is_own = False
            try:
                host = (urlparse(url).hostname or '').lower()
                is_own = bool(host and (host == api_host or host.endswith('.' + api_host)))
                if is_own:
                    headers = kwargs.get('headers')
                    if headers is None:
                        headers = {}
                    if not hasattr(headers, 'setdefault'):
                        headers = dict(headers)
                    headers.setdefault('X-Companion-Version', APP_VERSION)
                    headers.setdefault('X-Companion-Device-Id', device_id)
                    kwargs['headers'] = headers
            except Exception:
                is_own = False
            resp = original_request(self, method, url, **kwargs)
            # 监控中心：统计本站 403/404/500 响应次数（心跳周期内增量）
            if is_own:
                try:
                    code = getattr(resp, 'status_code', None)
                    if code in (403, 404, 500):
                        from companion_heartbeat import note_http_error
                        note_http_error(int(code))
                except Exception:
                    pass
            return resp

        requests.sessions.Session.request = _patched_request
        print(f'[Headers] companion request headers installed (device={device_id})')
    except Exception as _e:
        print(f'[WARN] companion request header install failed: {_e}')
