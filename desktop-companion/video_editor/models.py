from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass
class VideoInfo:
    path: str
    duration: float
    width: int
    height: int
    fps: float
    video_codec: str
    audio_codec: str
    has_audio: bool

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class TimelineClip:
    source_start: float
    source_end: float
    action: str
    reason: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class SubtitleSegment:
    start: float
    end: float
    text: str
    words: list[dict] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class MaterialInsert:
    start: float
    end: float
    source_path: str
    category: str = ""
    keywords: list[str] = field(default_factory=list)
    reason: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class EditPlanClip:
    id: str
    source_start: float
    source_end: float
    text: str
    role: str
    reason: str
    enabled: bool
    order: int

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class AdvancedEditPlan:
    title: str
    summary: str
    estimated_duration: float
    clips: list[EditPlanClip]
    style: str = "viral"
    target_duration: float = 120.0

    def to_dict(self) -> dict:
        data = asdict(self)
        data["clips"] = [clip.to_dict() if hasattr(clip, "to_dict") else clip for clip in self.clips]
        return data
