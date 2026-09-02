from __future__ import annotations

import os

VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def scan_materials(folder: str | None) -> list[dict]:
    if not folder or not os.path.isdir(folder):
        return []
    items = []
    for root, _, files in os.walk(folder):
        for name in files:
            ext = os.path.splitext(name)[1].lower()
            if ext not in VIDEO_EXTS | IMAGE_EXTS:
                continue
            path = os.path.join(root, name)
            rel = os.path.relpath(path, folder)
            keywords = [part.lower() for part in os.path.splitext(rel)[0].replace("_", " ").replace("-", " ").split() if part]
            items.append({"path": path, "category": os.path.basename(root), "keywords": keywords, "type": "video" if ext in VIDEO_EXTS else "image"})
    return items
