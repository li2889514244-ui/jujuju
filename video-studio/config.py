"""
config.py — 配置加载模块
从 config.toml 读取配置，如果不存在则从 config.example.toml 复制
"""
import os
import sys
from pathlib import Path

try:
    import tomllib  # Python 3.11+
except ImportError:
    import tomli as tomllib

BASE_DIR = Path(__file__).parent.resolve()
CONFIG_FILE = BASE_DIR / "config.toml"
EXAMPLE_FILE = BASE_DIR / "config.example.toml"

_config = None


def _copy_example():
    """首次运行时从 example 复制配置"""
    if EXAMPLE_FILE.exists() and not CONFIG_FILE.exists():
        import shutil
        shutil.copy2(EXAMPLE_FILE, CONFIG_FILE)
        print(f"[config] 已从 config.example.toml 复制创建 config.toml，请编辑填入 API key")


def load_config() -> dict:
    global _config
    if _config is not None:
        return _config

    _copy_example()

    if not CONFIG_FILE.exists():
        raise FileNotFoundError(
            f"配置文件不存在: {CONFIG_FILE}\n"
            f"请复制 config.example.toml 为 config.toml 并填写配置"
        )

    with open(CONFIG_FILE, "rb") as f:
        _config = tomllib.load(f)

    return _config


def get(section: str, key: str = None, default=None):
    cfg = load_config()
    sec = cfg.get(section, {})
    if key is None:
        return sec
    return sec.get(key, default)


def get_ffmpeg_binary() -> str:
    """返回 FFmpeg 可执行文件路径"""
    cfg_path = get("ffmpeg", "path", "")
    if cfg_path and os.path.isfile(cfg_path):
        return cfg_path
    # 使用 imageio-ffmpeg 自带的
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        raise RuntimeError(
            "FFmpeg 未找到。请安装 imageio-ffmpeg: pip install imageio-ffmpeg\n"
            "或在 config.toml [ffmpeg] path 中指定 FFmpeg 路径"
        )


def ensure_dirs():
    """确保所有需要的目录都存在"""
    cfg = load_config()
    dirs = [
        BASE_DIR / cfg.get("material", {}).get("download_dir", "storage/materials"),
        BASE_DIR / cfg.get("material", {}).get("local_dir", "storage/local_materials"),
        BASE_DIR / cfg.get("bgm", {}).get("music_dir", "storage/music"),
        BASE_DIR / cfg.get("output", {}).get("dir", "storage/output"),
        BASE_DIR / cfg.get("output", {}).get("intermediate_dir", "storage/intermediate"),
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
