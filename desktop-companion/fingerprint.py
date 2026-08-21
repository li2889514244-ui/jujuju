"""
fingerprint.py — 每账号独立浏览器指纹生成。

为每个账号生成确定性但唯一的指纹，避免平台风控检测到
多个账号来自"同一台设备"。
"""

import hashlib
import json
import random
from pathlib import Path

# ── 真实 GPU 配置池（vendor, renderer）──
_GPU_PROFILES = [
    ('Google Inc. (Intel)', 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ('Google Inc. (Intel)', 'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ('Google Inc. (Intel)', 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ('Google Inc. (Intel)', 'ANGLE (Intel, Intel(R) HD Graphics 530 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ('Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ('Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ('Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ('Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ('Google Inc. (AMD)', 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ('Google Inc. (AMD)', 'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ('Google Inc. (AMD)', 'ANGLE (AMD, AMD Radeon RX 7600 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
]

# ── Chrome 版本池（匹配 Playwright Chromium 大版本区间）──
_CHROME_VERSIONS = ['126', '127', '128', '129', '130', '131', '132', '133']

# ── 硬件参数池 ──
_HARDWARE_CONCURRENCY = [4, 6, 8, 12, 16]
_DEVICE_MEMORY = [4, 8, 16]

# ── 屏幕分辨率池 ──
_SCREEN_SIZES = [
    (1920, 1080), (2560, 1440), (1366, 768), (1440, 900), (1536, 864),
    (1680, 1050), (1280, 720),
]

# ── Canvas 噪声种子范围 ──
_CANVAS_NOISE_RANGE = (-3, 3)


def generate_fingerprint(seed_str: str) -> dict:
    """从种子字符串（account_id 或随机 UUID）生成确定性指纹。

    Args:
        seed_str: 账号ID或任意唯一字符串

    Returns:
        指纹字典，包含 WebGL、UA、硬件参数等
    """
    seed = int(hashlib.md5(seed_str.encode('utf-8')).hexdigest(), 16)
    rng = random.Random(seed)

    gpu_vendor, gpu_renderer = rng.choice(_GPU_PROFILES)
    chrome_ver = rng.choice(_CHROME_VERSIONS)
    hw_conc = rng.choice(_HARDWARE_CONCURRENCY)
    dev_mem = rng.choice(_DEVICE_MEMORY)
    screen_w, screen_h = rng.choice(_SCREEN_SIZES)
    canvas_noise = rng.randint(_CANVAS_NOISE_RANGE[0], _CANVAS_NOISE_RANGE[1])

    return {
        'webgl_vendor': gpu_vendor,
        'webgl_renderer': gpu_renderer,
        'chrome_version': chrome_ver,
        'user_agent': (
            f'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            f'AppleWebKit/537.36 (KHTML, like Gecko) '
            f'Chrome/{chrome_ver}.0.0.0 Safari/537.36'
        ),
        'hardware_concurrency': hw_conc,
        'device_memory': dev_mem,
        'screen_width': screen_w,
        'screen_height': screen_h,
        'canvas_noise': canvas_noise,
    }


def save_fingerprint(profile_dir: Path, fingerprint: dict) -> None:
    """保存指纹到 profile 目录。"""
    fp_path = Path(profile_dir) / 'fingerprint.json'
    fp_path.parent.mkdir(parents=True, exist_ok=True)
    fp_path.write_text(json.dumps(fingerprint, ensure_ascii=False), encoding='utf-8')


def load_fingerprint(profile_dir: Path, account_id: str = '') -> dict:
    """从 profile 目录加载指纹，不存在则从 account_id 生成。"""
    fp_path = Path(profile_dir) / 'fingerprint.json'
    if fp_path.exists():
        try:
            return json.loads(fp_path.read_text('utf-8'))
        except Exception:
            pass
    # Fallback: 从 account_id 生成
    if account_id:
        fp = generate_fingerprint(account_id)
        try:
            save_fingerprint(profile_dir, fp)
        except Exception:
            pass
        return fp
    # Last resort: default
    return generate_fingerprint('default_seed_000')
