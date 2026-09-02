from __future__ import annotations

from .models import MaterialInsert, SubtitleSegment
from .deepseek_client import call_deepseek_json, deepseek_configured


def match_materials(subtitles: list[SubtitleSegment | dict], materials: list[dict], density: str = "normal") -> list[MaterialInsert]:
    if density == "off":
        return []
    if not materials:
        return []
    ai_inserts = _match_with_ai(subtitles, materials, density)
    if ai_inserts:
        return ai_inserts
    return _match_locally(subtitles, materials, density)


def _match_locally(subtitles: list[SubtitleSegment | dict], materials: list[dict], density: str = "normal") -> list[MaterialInsert]:
    step = {"low": 8, "normal": 5, "high": 3}.get(density, 5)
    inserts: list[MaterialInsert] = []
    for idx, raw in enumerate(subtitles):
        if idx % step:
            continue
        seg = raw if isinstance(raw, SubtitleSegment) else SubtitleSegment(**raw)
        text = seg.text.lower()
        best = None
        for item in materials:
            if any(k and k in text for k in item.get("keywords", [])):
                best = item
                break
        best = best or materials[idx % len(materials)]
        inserts.append(MaterialInsert(seg.start, min(seg.end, seg.start + 3.0), best["path"], best.get("category", ""), best.get("keywords", []), "keyword_or_round_robin"))
    return inserts


def _match_with_ai(subtitles: list[SubtitleSegment | dict], materials: list[dict], density: str) -> list[MaterialInsert]:
    if not deepseek_configured():
        return []
    material_index = [
        {"index": i, "category": m.get("category", ""), "keywords": m.get("keywords", [])[:8]}
        for i, m in enumerate(materials[:300])
    ]
    wanted = {"low": 0.10, "normal": 0.18, "high": 0.30}.get(density, 0.18)
    inserts: list[MaterialInsert] = []
    for offset in range(0, len(subtitles), 30):
        chunk = subtitles[offset : offset + 30]
        rows = []
        normalized = []
        for idx, raw in enumerate(chunk, offset):
            seg = raw if isinstance(raw, SubtitleSegment) else SubtitleSegment(**raw)
            normalized.append(seg)
            rows.append({"subtitle_index": idx, "start": seg.start, "end": seg.end, "text": seg.text})
        prompt = json_prompt(rows, material_index, wanted)
        try:
            data = call_deepseek_json(prompt, model="deepseek-v4-flash", retries=2)
            if not isinstance(data, list):
                continue
            for item in data:
                if not isinstance(item, dict):
                    continue
                sub_idx = int(item.get("subtitle_index", -1))
                if sub_idx < 0 or sub_idx >= len(subtitles):
                    continue
                seg_raw = subtitles[sub_idx]
                seg = seg_raw if isinstance(seg_raw, SubtitleSegment) else SubtitleSegment(**seg_raw)
                keywords = [str(x).lower() for x in item.get("keywords", []) if str(x).strip()]
                category = str(item.get("category") or "")
                best = score_material(materials, keywords, category)
                if best:
                    inserts.append(MaterialInsert(seg.start, min(seg.end, seg.start + 3.0), best["path"], best.get("category", ""), best.get("keywords", []), str(item.get("reason") or "AI matched")))
        except Exception:
            return []
    return inserts


def json_prompt(subtitles: list[dict], materials: list[dict], wanted_ratio: float) -> str:
    return (
        "根据字幕判断哪些位置值得插入本地 B-roll。不要返回本地文件路径，只返回 JSON 数组。"
        f"插入比例约为字幕数量的 {wanted_ratio:.0%}，每 20-40 条字幕批量判断。\n"
        "返回格式：[{\"subtitle_index\":15,\"keywords\":[\"女性\",\"职场\"],\"category\":\"女性职场\",\"reason\":\"...\"}]\n"
        f"字幕：{subtitles}\n素材索引：{materials}"
    )


def score_material(materials: list[dict], keywords: list[str], category: str) -> dict | None:
    best = None
    best_score = -1
    cat = category.lower()
    for item in materials:
        text = " ".join([item.get("category", ""), " ".join(item.get("keywords", []))]).lower()
        score = sum(3 for k in keywords if k and k in text)
        if cat and cat in text:
            score += 4
        if score > best_score:
            best_score = score
            best = item
    return best
