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
