"""
bgm.py — 背景音乐管理

功能:
  1. 列出本地音乐库中的可用音乐
  2. 上传新音乐到本地库
  3. 选择音乐用于视频渲染
"""
import os
from pathlib import Path
from typing import List
from loguru import logger
import config

BASE_DIR = Path(__file__).parent.resolve()

SUPPORTED_EXTENSIONS = (".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus", ".wma")


def get_music_dir() -> Path:
    """获取音乐目录路径"""
    music_dir = config.get("bgm", "music_dir", "storage/music")
    path = BASE_DIR / music_dir if not os.path.isabs(music_dir) else Path(music_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def list_music() -> List[dict]:
    """列出所有可用的背景音乐"""
    music_dir = get_music_dir()
    files = []
    for f in sorted(music_dir.iterdir(), key=lambda x: x.name.lower()):
        if f.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        files.append({
            "name": f.name,
            "path": str(f),
            "size_mb": round(f.stat().st_size / 1024 / 1024, 2),
        })
    logger.info(f"找到 {len(files)} 首背景音乐")
    return files


def save_uploaded_music(filename: str, data: bytes) -> str:
    """保存上传的音乐文件"""
    safe_name = Path(filename).name  # 防路径穿越
    if Path(safe_name).suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"不支持的音乐格式: {Path(safe_name).suffix}")

    music_dir = get_music_dir()
    filepath = music_dir / safe_name
    with open(filepath, "wb") as f:
        f.write(data)

    logger.info(f"音乐上传成功: {filepath.name} ({len(data) / 1024 / 1024:.1f} MB)")
    return str(filepath)


def resolve_music_path(name: str) -> str:
    """根据文件名查找音乐文件完整路径"""
    music_dir = get_music_dir()
    filepath = music_dir / name
    if filepath.exists():
        return str(filepath)
    raise FileNotFoundError(f"音乐文件不存在: {name}")
