"""
material.py — B-roll 素材搜索与下载

支持三个素材源:
  1. pixabay  — 国内可访问，免费，无需翻墙
  2. pexels   — 国际主流，素材质量高
  3. local    — 本地素材库，用户自己放文件

素材下载后保存在本地，避免重复下载。
"""
import os
import hashlib
import requests
from pathlib import Path
from typing import List, Optional
from loguru import logger
from urllib.parse import urlencode
import config

BASE_DIR = Path(__file__).parent.resolve()


class MaterialClip:
    """一个 B-roll 素材片段"""
    def __init__(self):
        self.url: str = ""           # 下载 URL
        self.local_path: str = ""    # 本地保存路径
        self.duration: int = 0       # 时长（秒）
        self.provider: str = ""      # 来源
        self.search_term: str = ""   # 搜索关键词
        self.width: int = 0
        self.height: int = 0
        self.source_page: str = ""   # 素材页面链接

    def to_dict(self):
        return {
            "url": self.url,
            "local_path": self.local_path,
            "duration": self.duration,
            "provider": self.provider,
            "search_term": self.search_term,
            "width": self.width,
            "height": self.height,
            "source_page": self.source_page,
        }


# ═══════════════════════════════════════════════════════
# Pixabay 搜索（国内可访问）
# ═══════════════════════════════════════════════════════

def search_pixabay(search_term: str, min_duration: int = 5, count: int = 10) -> List[MaterialClip]:
    """在 Pixabay 搜索视频素材"""
    api_key = config.get("material", "pixabay_api_key", "")
    if not api_key:
        logger.error("Pixabay API Key 未配置，请在 config.toml [material] pixabay_api_key 中填写")
        logger.error("免费注册: https://pixabay.com/api/docs/")
        return []

    params = {
        "q": search_term,
        "video_type": "all",
        "per_page": min(count * 2, 50),  # 多取一些，过滤后可能变少
        "key": api_key,
    }
    url = f"https://pixabay.com/api/videos/?{urlencode(params)}"
    logger.info(f"[Pixabay] 搜索: {search_term!r}")

    try:
        resp = requests.get(url, timeout=(30, 60))
        if resp.status_code == 429:
            logger.error("[Pixabay] API 调用频率超限")
            return []
        if resp.status_code >= 400:
            logger.error(f"[Pixabay] 请求失败: HTTP {resp.status_code}")
            return []

        data = resp.json()
        hits = data.get("hits", [])
        logger.info(f"[Pixabay] 返回 {len(hits)} 条结果")

    except Exception as e:
        logger.error(f"[Pixabay] 搜索失败: {type(e).__name__}: {e}")
        return []

    clips = []
    for hit in hits[:count]:
        duration = int(hit.get("duration", 0))
        if duration < min_duration:
            continue

        # 取中等质量版本（large > medium > small > tiny）
        videos = hit.get("videos", {})
        for quality in ("large", "medium", "small", "tiny"):
            v = videos.get(quality, {})
            if v:
                clip = MaterialClip()
                clip.url = v.get("url", "")
                clip.duration = duration
                clip.provider = "pixabay"
                clip.search_term = search_term
                clip.width = int(v.get("width", 0))
                clip.height = int(v.get("height", 0))
                clip.source_page = hit.get("pageURL", "")
                if clip.url:
                    clips.append(clip)
                    break

    logger.info(f"[Pixabay] 有效素材: {len(clips)} 条")
    return clips


# ═══════════════════════════════════════════════════════
# Pexels 搜索
# ═══════════════════════════════════════════════════════

def search_pexels(search_term: str, min_duration: int = 5, count: int = 10) -> List[MaterialClip]:
    """在 Pexels 搜索视频素材"""
    api_key = config.get("material", "pexels_api_key", "")
    if not api_key:
        logger.error("Pexels API Key 未配置")
        return []

    headers = {"Authorization": api_key}
    params = {"query": search_term, "per_page": count}
    url = f"https://api.pexels.com/videos/search?{urlencode(params)}"
    logger.info(f"[Pexels] 搜索: {search_term!r}")

    try:
        resp = requests.get(url, headers=headers, timeout=(30, 60))
        if resp.status_code != 200:
            logger.error(f"[Pexels] 请求失败: HTTP {resp.status_code}")
            return []

        data = resp.json()
        videos = data.get("videos", [])
        logger.info(f"[Pexels] 返回 {len(videos)} 条结果")

    except Exception as e:
        logger.error(f"[Pexels] 搜索失败: {type(e).__name__}: {e}")
        return []

    clips = []
    for v in videos[:count]:
        duration = int(v.get("duration", 0))
        if duration < min_duration:
            continue

        # 取 HD 版本
        video_files = v.get("video_files", [])
        best = None
        for vf in video_files:
            if vf.get("quality") == "hd":
                best = vf
                break
        if not best and video_files:
            best = video_files[0]

        if best:
            clip = MaterialClip()
            clip.url = best.get("link", "")
            clip.duration = duration
            clip.provider = "pexels"
            clip.search_term = search_term
            clip.width = int(best.get("width", 0))
            clip.height = int(best.get("height", 0))
            clip.source_page = v.get("url", "")
            clips.append(clip)

    logger.info(f"[Pexels] 有效素材: {len(clips)} 条")
    return clips


# ═══════════════════════════════════════════════════════
# 本地素材库
# ═══════════════════════════════════════════════════════

def search_local(search_term: str = "", count: int = 10) -> List[MaterialClip]:
    """从本地素材目录读取素材文件"""
    local_dir = config.get("material", "local_dir", "storage/local_materials")
    local_path = BASE_DIR / local_dir if not os.path.isabs(local_dir) else Path(local_dir)

    if not local_path.exists():
        logger.warning(f"本地素材目录不存在: {local_path}")
        return []

    video_exts = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
    clips = []
    for f in sorted(local_path.iterdir()):
        if f.suffix.lower() not in video_exts:
            continue
        clip = MaterialClip()
        clip.local_path = str(f)
        clip.provider = "local"
        clip.search_term = search_term or f.stem
        clip.url = f"file://{f}"
        clips.append(clip)
        if len(clips) >= count:
            break

    logger.info(f"[Local] 找到 {len(clips)} 个本地素材")
    return clips


# ═══════════════════════════════════════════════════════
# 统一搜索入口
# ═══════════════════════════════════════════════════════

def search_materials(
    search_term: str,
    min_duration: int = None,
    count: int = None,
) -> List[MaterialClip]:
    """
    搜索 B-roll 素材
    
    参数:
        search_term: 搜索关键词
        min_duration: 最小时长（秒），None 则用配置默认值
        count: 结果数量，None 则用配置默认值
    
    返回:
        MaterialClip 列表
    """
    if min_duration is None:
        min_duration = config.get("material", "min_duration", 5)
    if count is None:
        count = config.get("material", "results_count", 10)

    source = config.get("material", "source", "pixabay")

    if source == "pixabay":
        return search_pixabay(search_term, min_duration, count)
    elif source == "pexels":
        return search_pexels(search_term, min_duration, count)
    elif source == "local":
        return search_local(search_term, count)
    else:
        logger.error(f"未知素材源: {source}")
        return []


# ═══════════════════════════════════════════════════════
# 下载素材
# ═══════════════════════════════════════════════════════

def download_material(clip: MaterialClip, save_dir: str = None) -> str:
    """
    下载素材到本地
    
    返回: 本地文件路径
    """
    if clip.local_path and os.path.isfile(clip.local_path):
        return clip.local_path  # 本地素材不需要下载

    if not clip.url:
        return ""

    if save_dir is None:
        save_dir = config.get("material", "download_dir", "storage/materials")
    save_path = BASE_DIR / save_dir if not os.path.isabs(save_dir) else Path(save_dir)
    save_path.mkdir(parents=True, exist_ok=True)

    # 文件名: provider_searchterm_hash.mp4
    # 用 md5 确保跨重启确定性（Python 内置 hash() 有随机化）
    safe_term = "".join(c if c.isalnum() or c in "-_" else "_" for c in clip.search_term)[:30]
    url_hash = hashlib.md5(clip.url.encode()).hexdigest()[:8]
    filename = f"{clip.provider}_{safe_term}_{url_hash}.mp4"
    filepath = save_path / filename

    if filepath.exists():
        logger.info(f"素材已存在，跳过下载: {filepath.name}")
        clip.local_path = str(filepath)
        return str(filepath)

    logger.info(f"下载素材: {clip.url[:80]}... → {filepath.name}")
    try:
        resp = requests.get(clip.url, stream=True, timeout=(30, 120))
        if resp.status_code != 200:
            logger.error(f"下载失败: HTTP {resp.status_code}")
            return ""

        with open(filepath, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):  # 1MB
                f.write(chunk)

        clip.local_path = str(filepath)
        logger.info(f"下载完成: {filepath.name} ({filepath.stat().st_size / 1024 / 1024:.1f} MB)")
        return str(filepath)

    except Exception as e:
        logger.error(f"下载失败: {type(e).__name__}: {e}")
        return ""
