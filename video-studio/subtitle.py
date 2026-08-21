"""
subtitle.py — 字幕识别 + ASS 字幕生成

支持两种识别引擎:
  1. tiny   — 使用 faster-whisper tiny 模型，速度快，CPU 可跑，准确度一般
  2. whisper — 使用 faster-whisper 更大模型，准确度高但速度较慢

两种模式都需要 faster-whisper 库 (pip install faster-whisper)

ASS 字幕格式可精确控制: 字体、字号、颜色、描边、阴影、位置
"""
import os
import subprocess
import tempfile
from typing import List, Tuple
from loguru import logger
import config


# ═══════════════════════════════════════════════════════
# 时间格式转换
# ═══════════════════════════════════════════════════════

def _seconds_to_ass_time(seconds: float) -> str:
    """秒 → ASS时间格式 H:MM:SS.cc"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centis = int((seconds % 1) * 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{centis:02d}"


def _seconds_to_srt_time(seconds: float) -> str:
    """秒 → SRT时间格式 H:MM:SS,mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours}:{minutes:02d}:{secs:02d},{millis:03d}"


# ═══════════════════════════════════════════════════════
# 从视频中提取音频
# ═══════════════════════════════════════════════════════

def extract_audio(video_path: str, output_path: str = None) -> str:
    """用 FFmpeg 从视频中提取音频，返回 wav 文件路径"""
    if output_path is None:
        output_path = tempfile.mktemp(suffix=".wav", prefix="vs_audio_")

    ffmpeg = config.get_ffmpeg_binary()
    cmd = [
        ffmpeg, "-y",
        "-i", video_path,
        "-vn",                    # 不要视频
        "-acodec", "pcm_s16le",   # WAV 16bit
        "-ar", "16000",           # 16kHz 足够语音识别
        "-ac", "1",               # 单声道
        output_path
    ]
    logger.info(f"提取音频: {video_path} → {output_path}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f"音频提取失败: {result.stderr[-500:]}")

    return output_path


# ═══════════════════════════════════════════════════════
# Tiny 引擎识别（快速模式，CPU 可跑）
# ═══════════════════════════════════════════════════════

def _recognize_with_tiny(audio_path: str, language: str = "zh") -> List[Tuple[float, float, str]]:
    """
    使用 faster-whisper 的 tiny 模型进行快速识别（CPU 可跑）。
    
    返回: [(start, end, text), ...]
    """
    return _recognize_with_whisper(audio_path, language, model_size="tiny")


# ═══════════════════════════════════════════════════════
# Whisper 引擎识别（本地运行，准确度高）
# ═══════════════════════════════════════════════════════

def _recognize_with_whisper(
    audio_path: str,
    language: str = "zh",
    model_size: str = None,
) -> List[Tuple[float, float, str]]:
    """
    使用 faster-whisper 进行语音识别
    
    返回: [(start, end, text), ...]
    """
    from faster_whisper import WhisperModel

    if model_size is None:
        model_size = config.get("subtitle", "whisper_model", "medium")
    device = config.get("subtitle", "whisper_device", "cpu")

    logger.info(f"加载 Whisper 模型: {model_size} (device={device})")
    model = WhisperModel(model_size, device=device, compute_type="int8" if device == "cpu" else "float16")

    logger.info(f"开始语音识别: {audio_path}")
    segments, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
        vad_filter=True,          # 过滤静音段
        vad_parameters=dict(
            min_silence_duration_ms=500,
            speech_pad_ms=200,
        ),
    )

    results = []
    for seg in segments:
        text = seg.text.strip()
        if text:
            results.append((seg.start, seg.end, text))
            logger.debug(f"  [{seg.start:.1f}s - {seg.end:.1f}s] {text}")

    logger.info(f"识别完成，共 {len(results)} 段")
    return results


# ═══════════════════════════════════════════════════════
# 主入口：识别字幕
# ═══════════════════════════════════════════════════════

def recognize_subtitle(video_path: str, language: str = "zh") -> List[Tuple[float, float, str]]:
    """
    识别视频中的语音，返回字幕段列表
    
    参数:
        video_path: 视频文件路径
        language: 语言代码 (zh=中文, en=英文)
    
    返回:
        [(start_seconds, end_seconds, text), ...]
    """
    provider = config.get("subtitle", "provider", "tiny")

    # 提取音频
    audio_path = extract_audio(video_path)

    try:
        if provider == "whisper":
            return _recognize_with_whisper(audio_path, language)
        else:
            # "tiny" 模式：快速但准确度一般，CPU 可跑
            return _recognize_with_tiny(audio_path, language)
    finally:
        # 清理临时音频文件
        try:
            os.unlink(audio_path)
        except OSError:
            pass


# ═══════════════════════════════════════════════════════
# 生成 ASS 字幕文件
# ═══════════════════════════════════════════════════════

def generate_ass(
    segments: List[Tuple[float, float, str]],
    output_path: str,
) -> str:
    """
    生成 ASS 字幕文件，字体样式从 config 读取
    
    返回: output_path
    """
    sub_cfg = config.get("subtitle")

    font_name = sub_cfg.get("font_name", "微软雅黑")
    font_size = sub_cfg.get("font_size", 48)
    primary_color = sub_cfg.get("primary_color", "&H00FFFFFF")
    outline_color = sub_cfg.get("outline_color", "&H00000000")
    outline_width = sub_cfg.get("outline_width", 2)
    shadow = sub_cfg.get("shadow", 1)
    position = sub_cfg.get("position", "bottom")
    margin_v = sub_cfg.get("margin_v", 60)

    # 位置对应的对齐方式
    # 1=左下 2=中下 3=右下 / 4=左中 5=中中 6=右中 / 7=左上 8=中上 9=右上
    alignment_map = {
        "bottom": 2,
        "middle": 5,
        "top": 8,
    }
    alignment = alignment_map.get(position, 2)

    # ASS 文件头部
    ass_header = f"""[Script Info]
Title: Video Studio Subtitle
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},{primary_color},{primary_color},{outline_color},{outline_color},1,0,0,0,100,100,0,0,1,{outline_width},{shadow},{alignment},40,40,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    # 生成每条字幕
    lines = []
    for start, end, text in segments:
        start_str = _seconds_to_ass_time(start)
        end_str = _seconds_to_ass_time(end)
        # 转义 ASS 特殊字符
        safe_text = text.replace("\\N", " ").replace("\\n", " ").replace("\\h", " ")
        lines.append(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{safe_text}")

    # 写入文件
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(ass_header)
        f.write("\n".join(lines))
        f.write("\n")

    logger.info(f"ASS 字幕已生成: {output_path} ({len(segments)} 条)")
    return output_path


# ═══════════════════════════════════════════════════════
# 生成 SRT 字幕文件（兼容剪映/Premiere）
# ═══════════════════════════════════════════════════════

def generate_srt(
    segments: List[Tuple[float, float, str]],
    output_path: str,
) -> str:
    """生成 SRT 字幕文件（可在剪映/Premiere 中导入编辑）"""
    lines = []
    for i, (start, end, text) in enumerate(segments, 1):
        lines.append(str(i))
        lines.append(f"{_seconds_to_srt_time(start)} --> {_seconds_to_srt_time(end)}")
        lines.append(text)
        lines.append("")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    logger.info(f"SRT 字幕已生成: {output_path} ({len(segments)} 条)")
    return output_path
