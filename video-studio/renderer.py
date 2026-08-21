"""
renderer.py — FFmpeg 视频渲染引擎

负责把视频 + ASS字幕 + B-roll素材 + 背景音乐 合成为最终视频

核心 FFmpeg 操作:
  1. 烧录字幕 (ass filter)
  2. 混合背景音乐 (amix filter)
  3. 拼接 B-roll 片段
  4. 编码输出
"""
import os
import subprocess
import tempfile
from pathlib import Path
from typing import List, Optional, Tuple
from loguru import logger
import config

BASE_DIR = Path(__file__).parent.resolve()


def _get_ffmpeg() -> str:
    return config.get_ffmpeg_binary()


def _run_ffmpeg(cmd: list, desc: str = ""):
    """执行 FFmpeg 命令，打印日志"""
    logger.debug(f"FFmpeg 命令: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)  # 30分钟超时
    if result.returncode != 0:
        stderr_tail = result.stderr[-1000:] if result.stderr else ""
        raise RuntimeError(f"FFmpeg 执行失败 ({desc}): {stderr_tail}")
    return result


# ═══════════════════════════════════════════════════════
# 获取视频信息
# ═══════════════════════════════════════════════════════

def get_video_info(video_path: str) -> dict:
    """用 FFmpeg 获取视频信息（宽高、时长、帧率）"""
    ffmpeg = _get_ffmpeg()
    cmd = [
        ffmpeg, "-i", video_path,
        "-hide_banner",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    # FFmpeg 的信息输出在 stderr 里
    info_text = result.stderr

    info = {"width": 0, "height": 0, "duration": 0, "fps": 30}

    # 解析分辨率
    import re
    res_match = re.search(r"(\d{2,5})x(\d{2,5})", info_text)
    if res_match:
        info["width"] = int(res_match.group(1))
        info["height"] = int(res_match.group(2))

    # 解析时长
    dur_match = re.search(r"Duration:\s*([\d:.]+)", info_text)
    if dur_match:
        parts = dur_match.group(1).split(":")
        info["duration"] = float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])

    # 解析帧率
    fps_match = re.search(r"(\d+(?:\.\d+)?)\s*fps", info_text)
    if fps_match:
        info["fps"] = float(fps_match.group(1))

    return info


# ═══════════════════════════════════════════════════════
# 烧录字幕到视频
# ═══════════════════════════════════════════════════════

def burn_subtitles(
    video_path: str,
    ass_path: str,
    output_path: str,
) -> str:
    """
    将 ASS 字幕烧录到视频中（hardcoded subtitle）
    
    使用 FFmpeg 的 subtitles 滤镜
    """
    ffmpeg = _get_ffmpeg()
    codec = config.get("ffmpeg", "video_codec", "libx264")
    crf = config.get("ffmpeg", "crf", 23)
    audio_codec = config.get("ffmpeg", "audio_codec", "aac")
    audio_bitrate = config.get("ffmpeg", "audio_bitrate", "192k")

    # Windows 下 ASS 路径需要转义
    # FFmpeg subtitles filter 中 ':' 是选项分隔符
    # 用单引号包裹路径即可保护冒号，不能再做 \: 转义
    # （否则单引号内 \: 会被当字面量，路径变成 C\:/path 导致找不到文件）
    ass_filter_path = ass_path.replace("\\", "/")

    cmd = [
        ffmpeg, "-y",
        "-i", video_path,
        "-vf", f"subtitles='{ass_filter_path}'",
        "-c:v", codec,
        "-crf", str(crf),
        "-preset", "medium",
        "-c:a", audio_codec,
        "-b:a", audio_bitrate,
        "-movflags", "+faststart",  # 支持 Web 渐进播放
        output_path,
    ]

    logger.info(f"烧录字幕: {video_path} + {ass_path} → {output_path}")
    _run_ffmpeg(cmd, "烧录字幕")
    logger.info(f"字幕烧录完成: {output_path}")
    return output_path


# ═══════════════════════════════════════════════════════
# 混合背景音乐
# ═══════════════════════════════════════════════════════

def mix_background_music(
    video_path: str,
    music_path: str,
    output_path: str,
    music_volume: float = 0.15,
    fade: bool = True,
) -> str:
    """
    在视频的原始音频上混入背景音乐
    
    参数:
        video_path: 输入视频（已有原始音频）
        music_path: 背景音乐文件
        music_volume: 背景音乐音量 (0.0~1.0)
        fade: 是否淡入淡出
    """
    ffmpeg = _get_ffmpeg()

    # 获取视频时长
    video_info = get_video_info(video_path)
    duration = video_info["duration"]
    if duration <= 0:
        logger.warning("无法获取视频时长，跳过背景音乐")
        import shutil
        shutil.copy2(video_path, output_path)
        return output_path

    has_audio = _has_audio_stream(video_path)

    # 构建滤镜
    # 背景音乐处理：调整音量 + 截取到视频时长
    music_filter = f"[1:a]volume={music_volume}"
    if fade:
        music_filter += f",afade=t=in:st=0:d=2,afade=t=out:st={max(0, duration-3)}:d=3"
    music_filter += f",atrim=0:{duration}[bgm]"

    if has_audio:
        # 视频有音频：混合原始音频和背景音乐
        filters = [
            music_filter,
            f"[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]",
        ]
        filter_complex = ";".join(filters)
        cmd = [
            ffmpeg, "-y",
            "-i", video_path,
            "-i", music_path,
            "-filter_complex", filter_complex,
            "-map", "0:v",
            "-map", "[aout]",
            "-c:v", "copy",       # 视频流直接复制，不重新编码
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            output_path,
        ]
    else:
        # 视频无音频：直接用背景音乐作为音轨
        cmd = [
            ffmpeg, "-y",
            "-i", video_path,
            "-i", music_path,
            "-filter_complex", music_filter,
            "-map", "0:v",
            "-map", "[bgm]",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            output_path,
        ]

    logger.info(f"混入背景音乐: {music_path} (volume={music_volume}, has_audio={has_audio})")
    _run_ffmpeg(cmd, "混入背景音乐")
    logger.info(f"背景音乐混入完成: {output_path}")
    return output_path


# ═══════════════════════════════════════════════════════
# 拼接 B-roll 素材（前置或后置插入）
# ═══════════════════════════════════════════════════════

def _has_audio_stream(video_path: str) -> bool:
    """检查视频是否有音频流"""
    ffmpeg = _get_ffmpeg()
    cmd = [ffmpeg, "-i", video_path, "-hide_banner"]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    return "Audio:" in result.stderr


# ═══════════════════════════════════════════════════════
# 拼接 B-roll 素材（前置或后置插入）
# ═══════════════════════════════════════════════════════

def concatenate_broll(
    main_video: str,
    broll_paths: List[str],
    output_path: str,
    position: str = "intro",  # "intro" (开头) 或 "outro" (结尾) 或 "both"
    broll_duration_each: int = 3,
) -> str:
    """
    在主视频的开头或结尾拼接 B-roll 片段
    
    参数:
        main_video: 主视频路径
        broll_paths: B-roll 文件路径列表
        output_path: 输出路径
        position: 拼接位置
        broll_duration_each: 每个 B-roll 片段取多少秒
    """
    if not broll_paths:
        logger.info("没有 B-roll 素材，跳过拼接")
        return main_video

    ffmpeg = _get_ffmpeg()
    codec = config.get("ffmpeg", "video_codec", "libx264")
    crf = config.get("ffmpeg", "crf", 23)
    audio_codec = config.get("ffmpeg", "audio_codec", "aac")
    audio_bitrate = config.get("ffmpeg", "audio_bitrate", "192k")

    # 先把每个 B-roll 片段截取指定时长
    main_info = get_video_info(main_video)
    target_w = main_info["width"]
    target_h = main_info["height"]
    main_has_audio = _has_audio_stream(main_video)

    temp_dir = tempfile.mkdtemp(prefix="vs_broll_")
    processed_brolls = []

    for i, broll_path in enumerate(broll_paths):
        if not os.path.isfile(broll_path):
            continue
        out_file = os.path.join(temp_dir, f"broll_{i:03d}.mp4")
        # B-roll 片段需要和主视频完全一致的编码参数（包括音频流是否存在）
        # 否则 concat demuxer 的 -c copy 会失败
        vf = f"scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:black"
        # FFmpeg 要求所有 -i 输入在输出选项之前
        cmd = [
            ffmpeg, "-y",
            "-i", broll_path,
        ]
        if main_has_audio:
            # 主视频有音频 → B-roll 也需要生成静音音频轨（第二个输入）
            cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
        # 输出选项
        cmd += [
            "-t", str(broll_duration_each),           # 截取指定秒数
            "-vf", vf,
            "-c:v", codec,
            "-crf", str(crf),
            "-preset", "fast",
            "-r", str(int(main_info["fps"])),         # 统一帧率
        ]
        if main_has_audio:
            cmd += ["-c:a", audio_codec, "-b:a", audio_bitrate, "-shortest"]
        else:
            cmd += ["-an"]
        cmd.append(out_file)

        try:
            _run_ffmpeg(cmd, f"处理 B-roll {i}")
            processed_brolls.append(out_file)
        except RuntimeError as e:
            logger.warning(f"B-roll {i} 处理失败，跳过: {e}")

    if not processed_brolls:
        logger.warning("没有有效的 B-roll 素材，跳过拼接")
        return main_video

    # 创建 concat 列表文件
    list_file = os.path.join(temp_dir, "concat_list.txt")
    with open(list_file, "w", encoding="utf-8") as f:
        if position in ("intro", "both"):
            for p in processed_brolls:
                f.write(f"file '{p}'\n")
        f.write(f"file '{main_video}'\n")
        if position in ("outro", "both"):
            for p in processed_brolls:
                f.write(f"file '{p}'\n")

    cmd = [
        ffmpeg, "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", list_file,
        "-c", "copy",
        output_path,
    ]

    logger.info(f"拼接 B-roll: {len(processed_brolls)} 个片段, 位置={position}")
    _run_ffmpeg(cmd, "拼接 B-roll")
    logger.info(f"B-roll 拼接完成: {output_path}")

    # 清理临时文件
    import shutil
    try:
        shutil.rmtree(temp_dir)
    except Exception:
        pass

    return output_path


# ═══════════════════════════════════════════════════════
# 完整渲染流程
# ═══════════════════════════════════════════════════════

def render_video(
    input_video: str,
    ass_path: str = None,
    broll_paths: List[str] = None,
    bgm_path: str = None,
    output_path: str = None,
    bgm_volume: float = None,
) -> str:
    """
    完整渲染流程: 原始视频 + 字幕 + B-roll + 背景音乐 → 最终视频
    
    流程:
      1. (可选) 拼接 B-roll
      2. (可选) 烧录字幕
      3. (可选) 混入背景音乐
    
    返回: 最终视频路径
    """
    if output_path is None:
        output_dir = config.get("output", "dir", "storage/output")
        output_path = str(BASE_DIR / output_dir / f"output_{int(__import__('time').time())}.mp4")

    keep_intermediate = config.get("output", "keep_intermediate", True)
    inter_dir = config.get("output", "intermediate_dir", "storage/intermediate")
    inter_path = BASE_DIR / inter_dir if not os.path.isabs(inter_dir) else Path(inter_dir)
    inter_path.mkdir(parents=True, exist_ok=True)

    current_file = input_video
    temp_files = []

    # Step 1: 拼接 B-roll
    if broll_paths:
        step1_output = str(inter_path / "step1_broll.mp4")
        try:
            current_file = concatenate_broll(current_file, broll_paths, step1_output, position="intro")
            if current_file != input_video:
                temp_files.append(step1_output)
            logger.info("✅ Step 1/3: B-roll 拼接完成")
        except Exception as e:
            logger.error(f"Step 1 失败 (B-roll): {e}")
            logger.info("跳过 B-roll，继续处理")

    # Step 2: 烧录字幕
    if ass_path and os.path.isfile(ass_path):
        step2_output = str(inter_path / "step2_subtitle.mp4")
        try:
            current_file = burn_subtitles(current_file, ass_path, step2_output)
            temp_files.append(step2_output)
            logger.info("✅ Step 2/3: 字幕烧录完成")
        except Exception as e:
            logger.error(f"Step 2 失败 (字幕): {e}")
            logger.info("跳过字幕烧录，继续处理")

    # Step 3: 混入背景音乐
    if bgm_path and os.path.isfile(bgm_path):
        if bgm_volume is None:
            bgm_volume = config.get("bgm", "volume", 0.15)
        step3_output = output_path  # 最后一步直接输出到最终路径
        try:
            current_file = mix_background_music(current_file, bgm_path, step3_output, bgm_volume)
            logger.info("✅ Step 3/3: 背景音乐混入完成")
        except Exception as e:
            logger.error(f"Step 3 失败 (背景音乐): {e}")
            # 如果背景音乐失败，把当前文件复制为输出
            import shutil
            shutil.copy2(current_file, output_path)
    else:
        # 没有背景音乐，把当前文件复制为输出
        import shutil
        if current_file != output_path:
            shutil.copy2(current_file, output_path)
        logger.info("✅ Step 3/3: 跳过背景音乐（未配置）")

    # 清理中间文件
    if not keep_intermediate:
        for f in temp_files:
            try:
                os.unlink(f)
            except OSError:
                pass

    logger.info(f"🎉 渲染完成: {output_path}")
    return output_path
