"""
companion_crypto.py — AES-256-GCM encryption helpers for the Desktop Companion.
"""
import os, base64, json
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    _HAS_CRYPTO = True
except ImportError:
    _HAS_CRYPTO = False

import companion_state as state


def _get_encryption_key() -> bytes:
    """Retrieve the AES-256 encryption key (32 bytes) from env or config file."""
    from conf import ENCRYPTION_KEY as CONF_KEY
    key_str = CONF_KEY
    if not key_str:
        for config_path in [
            Path.home() / 'AppData' / 'Local' / 'MatrixFlow' / 'companion_config.json',
            state.BASE_DIR / 'companion_config.json',
        ]:
            try:
                if config_path.exists():
                    cfg = json.loads(config_path.read_text(encoding='utf-8'))
                    key_str = cfg.get('_key', '')
                    if key_str:
                        break
            except Exception as _e:
                print(f'[WARN] {type(_e).__name__}: {_e}')
    if not key_str:
        raise RuntimeError("ENCRYPTION_KEY not set. Ensure launcher.py has been run at least once.")
    return base64.b64decode(key_str)


def _encrypt_password(plaintext: str, key: bytes) -> str:
    """Encrypt password using AES-256-GCM. Returns 'nonce_b64:ciphertext_b64'."""
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)
    return base64.b64encode(nonce).decode('ascii') + ':' + base64.b64encode(ct).decode('ascii')


def _decrypt_password(ciphertext: str, key: bytes) -> str:
    """Decrypt password encrypted with AES-256-GCM. Input format: 'nonce_b64:ciphertext_b64'."""
    nonce_b64, ct_b64 = ciphertext.split(':', 1)
    aesgcm = AESGCM(key)
    pt = aesgcm.decrypt(base64.b64decode(nonce_b64), base64.b64decode(ct_b64), None)
    return pt.decode('utf-8')
