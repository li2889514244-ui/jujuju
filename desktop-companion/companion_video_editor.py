"""
companion_video_editor.py — AI 剪辑模块（DeepSeek 驱动 capcut-cli）

两种模式:
  1. 标准模式 — 固定流水线: 剪辑气口 → 字号字幕 → 场景素材 → 导出视频
  2. 自定义模式 — 自然语言输入，DeepSeek 生成命令序列

完全独立模块，不影响披星云伴侣现有功能。
"""
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from typing import Optional

from companion_encoding import run_cmd

try:
    from loguru import logger
except Exception:
    import logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("pixingyun.video_editor")

# ── 常量 ──
_CAPCUT_CMD = shutil.which("capcut") or shutil.which("npx")
_NPX_CMD = shutil.which("npx")
_NODE_CMD = shutil.which("node")

# 剪映草稿目录（Windows）
_JIANYING_DRAFT_DIR = os.path.join(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
    "JianyingPro", "User Data", "Projects", "com.lveditor.draft"
)

# DeepSeek API 配置（从环境变量）
_DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
_DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
_DEEPSEEK_MODELS = [
    {
        "id": "deepseek-v4-flash",
        "name": "DeepSeek V4 Flash",
        "description": "更快，适合标准剪辑、字幕特效匹配和日常命令生成",
    },
    {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek V4 Pro",
        "description": "更强，适合复杂自定义剪辑规划",
    },
]
_DEEPSEEK_DEFAULT_MODEL = _DEEPSEEK_MODELS[0]["id"]
_CAPCUT_ALLOWED_COMMANDS = {
    "init", "quickstart",
    "add-video", "add-audio", "add-text",
    "trim", "speed", "volume", "remove", "shift",
    "caption", "import-srt", "export-srt",
    "transition", "text-anim", "image-anim",
    "add-filter", "add-effect", "add-sfx", "add-sticker",
    "detect-scenes", "cut",
    "info", "tracks", "segments", "timeline", "texts",
    "text-style", "render", "enums",
}
_CAPCUT_STDOUT_LIMIT = 200_000
_CAPCUT_STDERR_LIMIT = 8_000

# 任务存储
_editor_tasks: dict = {}
_editor_lock = threading.Lock()


def _get_capcut_binary() -> list:
    """返回 capcut-cli 的执行命令前缀"""
    if shutil.which("capcut"):
        return ["capcut"]
    if _NPX_CMD:
        return [_NPX_CMD, "capcut-cli"]
    raise RuntimeError("未找到 capcut-cli，请运行: npm install -g capcut-cli")


def get_deepseek_models() -> list:
    """Return supported DeepSeek model choices for the UI/API."""
    return [dict(item) for item in _DEEPSEEK_MODELS]


def _normalize_deepseek_model(model: str | None) -> str:
    """Validate a DeepSeek model id and return the default when empty."""
    value = (model or "").strip()
    if not value:
        return _DEEPSEEK_DEFAULT_MODEL
    allowed = {item["id"] for item in _DEEPSEEK_MODELS}
    if value not in allowed:
        raise ValueError(f"不支持的 DeepSeek 模型: {value}")
    return value


def _validate_capcut_args(args: list) -> list:
    """Validate user/AI supplied capcut-cli command arguments."""
    if not isinstance(args, list) or not args:
        raise ValueError("缺少 capcut-cli 命令")
    clean = [str(item) for item in args if str(item).strip()]
    if not clean:
        raise ValueError("缺少 capcut-cli 命令")
    cmd = clean[0]
    if cmd not in _CAPCUT_ALLOWED_COMMANDS:
        raise ValueError(f"不允许执行 capcut-cli 命令: {cmd}")
    return clean


_CAPCUT_PROJECT_COMMANDS = {
    "add-video", "add-audio", "caption", "detect-scenes", "cut",
    "info", "tracks", "segments", "timeline", "texts",
    "text-style", "render", "add-effect", "add-filter",
}


def _resolve_jianying_project_arg(value: str) -> str:
    """Return an absolute JianYing draft path when value is a known draft name."""
    project = (value or "").strip()
    if not project:
        return project
    if os.path.isabs(project):
        return project
    candidate = os.path.join(_JIANYING_DRAFT_DIR, project)
    if os.path.isdir(candidate):
        return candidate
    return project


def _normalize_ai_capcut_args(cmd_name: str, args: list, project: Optional[str]) -> list:
    """Normalize AI generated command args before passing them to capcut-cli."""
    clean_args = [str(item).strip() for item in (args or []) if str(item).strip()]
    if cmd_name not in _CAPCUT_PROJECT_COMMANDS:
        return clean_args

    selected_project = _resolve_jianying_project_arg(project or "")
    if clean_args:
        if clean_args[0] == "auto":
            clean_args[0] = selected_project or clean_args[0]
        else:
            clean_args[0] = _resolve_jianying_project_arg(clean_args[0])
    elif selected_project:
        clean_args = [selected_project]

    return clean_args


def _get_ffmpeg_binary() -> Optional[str]:
    """查找可用的 FFmpeg 二进制"""
    # 1. 系统 PATH
    ff = shutil.which("ffmpeg")
    if ff:
        return ff
    # 2. imageio-ffmpeg
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
    # 3. 常见安装路径（Windows）
    for p in [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "ffmpeg", "bin", "ffmpeg.exe"),
    ]:
        if os.path.isfile(p):
            return p
    return None


def _check_capcut_available() -> dict:
    """检查 capcut-cli 是否可用"""
    try:
        cmd = _get_capcut_binary()
        result = run_cmd(cmd + ["doctor"], timeout=30)
        if result.returncode == 0:
            # npx 输出可能有多行，取最后一行 JSON
            for line in result.stdout_text.strip().split("\n")[::-1]:
                line = line.strip()
                if line.startswith("{"):
                    data = json.loads(line)
                    return {"available": True, "info": data}
            return {"available": True, "info": {}}
        return {"available": False, "error": result.stderr_text[:300]}
    except FileNotFoundError:
        return {"available": False, "error": "capcut-cli 未安装，请运行 npm install -g capcut-cli"}
    except Exception as e:
        return {"available": False, "error": str(e)[:300]}


def _check_jianying_installed() -> dict:
    """检查剪映是否安装"""
    draft_dir = _JIANYING_DRAFT_DIR
    return {
        "installed": os.path.isdir(draft_dir),
        "draft_dir": draft_dir,
        "drafts": [d for d in os.listdir(draft_dir) if os.path.isdir(os.path.join(draft_dir, d))]
            if os.path.isdir(draft_dir) else []
    }


def _run_capcut(args: list, timeout: int = 120) -> dict:
    """执行 capcut-cli 命令，返回结果"""
    try:
        args = _validate_capcut_args(args)
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}
    cmd = _get_capcut_binary() + args
    logger.info(f"[VideoEditor] 执行: {' '.join(cmd)}")
    try:
        result = run_cmd(cmd, timeout=timeout)
        stdout = result.stdout_text.strip()
        stderr = result.stderr_text.strip()

        # 尝试解析 JSON 输出
        parsed = None
        try:
            for line in stdout.split("\n"):
                line = line.strip()
                if line.startswith("{") or line.startswith("["):
                    parsed = json.loads(line)
                    break
            if parsed is None and stdout:
                parsed = json.loads(stdout)
        except (json.JSONDecodeError, ValueError):
            parsed = None

        return {
            "ok": result.returncode == 0,
            "exit_code": result.returncode,
            "stdout": stdout[-_CAPCUT_STDOUT_LIMIT:] if stdout else "",
            "stderr": stderr[-_CAPCUT_STDERR_LIMIT:] if stderr else "",
            "data": parsed,
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"命令超时（{timeout}s）"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}


def _run_ffmpeg(args: list, timeout: int = 300) -> dict:
    """执行 FFmpeg 命令"""
    ffmpeg = _get_ffmpeg_binary()
    if not ffmpeg:
        return {"ok": False, "error": "未找到 FFmpeg"}
    cmd = [ffmpeg] + args
    logger.info(f"[VideoEditor] FFmpeg: {' '.join(cmd[:6])}...")
    try:
        result = run_cmd(cmd, timeout=timeout)
        return {
            "ok": result.returncode == 0,
            "stdout": result.stdout_text,
            "stderr": result.stderr_text,
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"FFmpeg 超时（{timeout}s）"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}


# ═══════════════════════════════════════════════════════
# 工具函数
# ═══════════════════════════════════════════════════════

def _extract_audio(video_path: str) -> Optional[str]:
    """从视频提取音频（WAV 16kHz 单声道）"""
    ffmpeg = _get_ffmpeg_binary()
    if not ffmpeg:
        return None
    audio_path = tempfile.mktemp(suffix=".wav", prefix="vs_audio_")
    result = _run_ffmpeg([
        "-y", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le",
        "-ar", "16000", "-ac", "1",
        audio_path
    ], timeout=120)
    if result["ok"]:
        return audio_path
    logger.error(f"[VideoEditor] 音频提取失败: {result.get('stderr', '')[-300:]}")
    return None


def _detect_silence(audio_path: str, min_silence_sec: float = 0.5,
                    noise_threshold: str = "-30dB") -> list:
    """用 FFmpeg silencedetect 检测静音段"""
    ffmpeg = _get_ffmpeg_binary()
    if not ffmpeg:
        return []
    cmd = [
        "-i", audio_path,
        "-af", f"silencedetect=n={noise_threshold}:d={min_silence_sec}",
        "-f", "null", "-"
    ]
    result = _run_ffmpeg(cmd, timeout=120)
    if not result["ok"]:
        return []

    # 解析 stderr 中的 silence_start / silence_end
    silences = []
    current_start = None
    for line in result["stderr"].split("\n"):
        if "silence_start:" in line:
            try:
                current_start = float(line.split("silence_start:")[1].strip().split()[0])
            except (ValueError, IndexError):
                pass
        elif "silence_end:" in line and current_start is not None:
            try:
                end_str = line.split("silence_end:")[1].strip().split()[0]
                end = float(end_str)
                silences.append({"start": current_start, "end": end, "duration": end - current_start})
                current_start = None
            except (ValueError, IndexError):
                pass

    logger.info(f"[VideoEditor] 检测到 {len(silences)} 段静音")
    return silences


# ── 剪映内置素材缓存 ──
_jy_effect_cache: dict = {}  # {"scene_effects": [...], "filters": [...]}


def _parse_capcut_enum_rows(stdout: str) -> list:
    """Parse capcut-cli enum table rows into executable slug/name pairs."""
    rows = []
    for raw in (stdout or "").split("\n"):
        line = raw.strip()
        if not line or line.startswith("Slug") or line.startswith("---"):
            continue
        cols = [part.strip() for part in re.split(r"\s{2,}", line) if part.strip()]
        if len(cols) >= 3:
            slug, name, resource_id = cols[0], cols[1], cols[2]
            if slug == "(non-ascii)":
                slug = resource_id or name
            rows.append({"slug": slug, "name": name})
        elif len(cols) >= 2:
            slug, name = cols[0], cols[1]
            if slug == "(non-ascii)":
                slug = name
            rows.append({"slug": slug, "name": name})
    return rows


def _get_jianying_effects() -> dict:
    """获取剪映内置场景特效和滤镜列表（带缓存）"""
    if _jy_effect_cache:
        return _jy_effect_cache

    result = {"scene_effects": [], "filters": []}

    # 场景特效
    r1 = _run_capcut(["enums", "--scene-effects", "--jianying", "-H"], timeout=30)
    if r1.get("ok") and r1.get("stdout"):
        result["scene_effects"].extend(_parse_capcut_enum_rows(r1["stdout"]))

    # 滤镜
    r2 = _run_capcut(["enums", "--filters", "--jianying", "-H"], timeout=30)
    if r2.get("ok") and r2.get("stdout"):
        result["filters"].extend(_parse_capcut_enum_rows(r2["stdout"]))

    _jy_effect_cache.update(result)
    logger.info(f"[VideoEditor] 剪映素材库: {len(result['scene_effects'])} 场景特效, {len(result['filters'])} 滤镜")
    return result


# ═══════════════════════════════════════════════════════
# DeepSeek 驱动
# ═══════════════════════════════════════════════════════

_SYSTEM_PROMPT = """你是视频剪辑助手，通过 capcut-cli 工具操控剪映草稿。

你可以使用以下 capcut-cli 命令（所有命令都加 --jianying 标志）：

创建项目:
  init <name> — 创建空白剪映草稿
  quickstart <name> --video <file> — 一键创建+加视频+检查

添加素材:
  add-video <project> <file> <start> <duration> — 添加视频段
  add-audio <project> <file> <start> <duration> --volume <0-1> — 添加音频段
  add-text <project> <start> <duration> <text> --font-size <n> --color <#hex> — 添加文字

编辑:
  trim <project> <id> <start> <duration> — 裁剪片段
  speed <project> <id> <multiplier> — 变速（如 2.0 = 2倍速）
  volume <project> <id> <level> — 音量（0.0-1.0）
  remove <project> <id> — 删除片段
  shift <project> <id> <offset> — 移动片段（如 +0.5s, -1s）

字幕:
  caption <project> --audio <path> --language <code> — Whisper 自动识别字幕
  import-srt <project> <srt-file> — 导入 SRT 字幕文件
  export-srt <project> — 导出字幕为 SRT

动画与效果:
  transition <project> <id> <slug> --duration <s> — 转场（dissolve, fade-in 等）
  text-anim <project> <id> --intro <slug> --outro <slug> — 文字动画
  image-anim <project> <id> --intro <slug> --outro <slug> — 图片/视频动画
  add-filter <project> <slug> --full — 滤镜（剪映内置 468 个，如 vintage, warm, cool, bw, 黑金 等）
  add-effect <project> <slug> --full — 场景特效（剪映内置 912 个，如 shake, vhs, cinematic, 星光, 雪花 等）
  add-sfx <project> <slug> <start> <duration> — 音效（剪映内置）
  add-sticker <project> <resource-id> <start> <duration> — 贴纸

注意: 优先使用剪映内置特效/滤镜/音效，不需要下载外部素材。可用 `enums --scene-effects --jianying` 和 `enums --filters --jianying` 查看完整列表。

长视频切短:
  detect-scenes <video> — 场景检测，自动找切点
  cut <project> <start> <end> --out <path> — 提取时间范围为新项目

查看:
  info <project> — 项目概览
  tracks <project> — 列出所有轨道
  segments <project> — 列出所有片段
  timeline <project> — 显示时间线布局
  texts <project> — 列出所有文字内容

规则:
1. 时间格式: 秒（如 5.0）或 1:30（分秒）
2. 所有命令都加 --jianying
3. 返回 JSON 数组，每个元素是一个命令对象
4. 命令格式: {"cmd": "命令名", "args": ["参数1", "参数2", ...], "desc": "说明"}
5. 只返回 JSON，不要返回其他内容
"""

_EFFECT_SELECT_PROMPT = """你是视频剪辑师，需要根据视频字幕内容，从剪映内置特效库中选择最匹配的场景特效和滤镜。

可用场景特效（slug → 名称）:
{scene_effects}

可用滤镜（slug → 名称）:
{filters}

字幕内容:
{subtitle_text}

请根据字幕内容的情感、场景、主题，选择:
1. 1-3 个场景特效（slug），并说明选择理由
2. 1-2 个滤镜（slug），并说明选择理由

返回 JSON 格式:
{{
  "effects": [{{"slug": "...", "reason": "..."}}],
  "filters": [{{"slug": "...", "reason": "..."}}]
}}
只返回 JSON，不要返回其他内容。
"""


def _call_deepseek(user_message: str, api_key: str, base_url: str,
                   system_prompt: str = None, temperature: float = 0.3,
                   model: str = "", max_tokens: int = 2000,
                   timeout: int = 120) -> str:
    """调用 DeepSeek API，返回原始文本"""
    import requests

    selected_model = _normalize_deepseek_model(model)
    url = f"{base_url.rstrip('/')}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": selected_model,
        "messages": [
            {"role": "system", "content": system_prompt or _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    logger.info(f"[VideoEditor] DeepSeek 请求 model={selected_model}: {user_message[:200]}")
    resp = requests.post(url, json=payload, headers=headers, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    content = data["choices"][0]["message"]["content"].strip()
    return content


def _call_deepseek_commands(user_message: str, api_key: str, base_url: str,
                            model: str = "") -> list:
    """调用 DeepSeek API，返回命令列表"""
    content = _call_deepseek(
        user_message,
        api_key,
        base_url,
        model=model,
        max_tokens=4000,
        timeout=120,
    )
    if not content.strip():
        raise ValueError("DeepSeek 返回为空，请重试或切换模型")

    # 清理可能的 markdown 代码块
    if content.startswith("```"):
        lines = content.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        content = "\n".join(lines)

    commands = json.loads(content)
    if not isinstance(commands, list):
        commands = [commands]

    logger.info(f"[VideoEditor] DeepSeek 返回 {len(commands)} 条命令")
    return commands


def _execute_commands(commands: list, project: Optional[str] = None) -> list:
    """按顺序执行命令列表，返回每条命令的执行结果"""
    results = []
    for i, cmd_obj in enumerate(commands):
        cmd_name = cmd_obj.get("cmd", "")
        args = cmd_obj.get("args", [])
        desc = cmd_obj.get("desc", "")

        # 如果 args 中 project 参数是 "auto"，替换为实际 project
        args = _normalize_ai_capcut_args(cmd_name, args, project)

        # 所有命令加 --jianying
        if "--jianying" not in args:
            args = args + ["--jianying"]

        result = _run_capcut([cmd_name] + args)
        results.append({
            "index": i + 1,
            "cmd": cmd_name,
            "args": args,
            "desc": desc,
            "ok": result.get("ok", False),
            "data": result.get("data"),
            "stdout": result.get("stdout", ""),
            "error": result.get("error", "") or result.get("stderr", ""),
        })

        # 如果命令失败，停止后续命令
        if not result.get("ok"):
            logger.warning(f"[VideoEditor] 命令 {cmd_name} 失败，停止后续执行")
            break

    return results


# ═══════════════════════════════════════════════════════
# 标准模式流水线
# ═══════════════════════════════════════════════════════

def _run_standard_task(task_id: str, project: str, video_path: str,
                       api_key: str, base_url: str, options: dict):
    """后台执行标准模式流水线"""
    steps = []
    font_size = options.get("font_size", 48)
    subtitle_color = options.get("subtitle_color", "#FFFFFF")
    silence_threshold = options.get("silence_threshold", 0.5)
    effects_enabled = options.get("effects_enabled", True)
    model = _normalize_deepseek_model(options.get("model"))

    def _update(status, message, extra=None):
        with _editor_lock:
            _editor_tasks[task_id]["status"] = status
            _editor_tasks[task_id]["message"] = message
            _editor_tasks[task_id]["steps"] = steps
            if extra:
                _editor_tasks[task_id].update(extra)

    try:
        # ── Step 1: 剪辑气口 ──
        _update("executing", "步骤 1/4: 剪辑气口 — 正在分析音频静音...")
        step1 = {"name": "剪辑气口", "status": "running", "details": []}

        ffmpeg = _get_ffmpeg_binary()
        if ffmpeg and video_path:
            audio_path = _extract_audio(video_path)
            if audio_path:
                silences = _detect_silence(audio_path, min_silence_sec=silence_threshold)
                step1["details"].append(f"检测到 {len(silences)} 段静音/气口")

                if silences:
                    # 获取视频片段信息
                    seg_result = _run_capcut(["segments", project, "--track", "video"])
                    video_segments = []
                    if seg_result.get("ok") and seg_result.get("data"):
                        raw = seg_result["data"]
                        if isinstance(raw, list):
                            video_segments = raw
                        elif isinstance(raw, dict) and "segments" in raw:
                            video_segments = raw["segments"]

                    step1["details"].append(f"视频轨道有 {len(video_segments)} 个片段")

                    # 计算总静音时长
                    total_silence = sum(s["duration"] for s in silences)
                    step1["details"].append(f"总静音时长: {total_silence:.1f}s")

                    # 如果有视频片段，尝试用 trim 去除气口
                    # 这里我们记录气口信息，实际的裁剪需要更复杂的片段操作
                    for s in silences[:10]:  # 只显示前10个
                        step1["details"].append(
                            f"  气口: {s['start']:.1f}s - {s['end']:.1f}s ({s['duration']:.1f}s)"
                        )

                    # 使用 detect-scenes 作为辅助
                    scene_result = _run_capcut(["detect-scenes", video_path], timeout=120)
                    if scene_result.get("ok") and scene_result.get("data"):
                        scenes = scene_result["data"]
                        if isinstance(scenes, list):
                            step1["details"].append(f"场景检测: 找到 {len(scenes)} 个场景切点")
                        elif isinstance(scenes, dict) and "cuts" in scenes:
                            step1["details"].append(f"场景检测: 找到 {len(scenes['cuts'])} 个场景切点")

                    step1["status"] = "done"
                    step1["note"] = "气口已检测完成，可在剪映中手动精调或使用自定义模式自动裁剪"
                else:
                    step1["status"] = "done"
                    step1["note"] = "未检测到明显气口"
                # 清理临时音频
                try:
                    os.unlink(audio_path)
                except OSError:
                    pass
            else:
                step1["status"] = "warn"
                step1["note"] = "音频提取失败，跳过气口检测"
        else:
            step1["status"] = "warn"
            step1["note"] = "未找到 FFmpeg 或视频路径，跳过气口检测"

        steps.append(step1)
        _update("executing", "步骤 2/4: 字号字幕 — 正在生成字幕...")

        # ── Step 2: 字号字幕 ──
        step2 = {"name": "字号字幕", "status": "running", "details": []}
        texts_result = {"ok": False, "data": []}

        # 检查 whisper 是否可用
        whisper_cmd = shutil.which("whisper")
        caption_args = ["caption", project, "--audio", video_path,
                        "--language", "zh"]
        if whisper_cmd:
            caption_args += ["--whisper-cmd", whisper_cmd]
        caption_args += ["--jianying"]

        cap_result = _run_capcut(caption_args, timeout=600)
        if cap_result.get("ok"):
            step2["details"].append("字幕识别成功")
            step2["status"] = "done"

            # 获取字幕片段 ID，设置字号
            texts_result = _run_capcut(["texts", project, "--jianying"])
            if texts_result.get("ok") and texts_result.get("data"):
                texts = texts_result["data"]
                if isinstance(texts, list):
                    step2["details"].append(f"共 {len(texts)} 条字幕")

                    # 对每条字幕设置字号和颜色
                    for t in texts[:20]:  # 限制前20条避免太慢
                        seg_id = t.get("id", t.get("segment_id", ""))
                        if seg_id:
                            style_args = ["text-style", project, seg_id,
                                          "--font-size", str(font_size)]
                            # text-style 不接受 --color，颜色在 add-text/caption 时设
                            style_args.append("--jianying")
                            _run_capcut(style_args)
                    step2["details"].append(f"字号已设置为 {font_size}")
        else:
            err = cap_result.get("error", "") or cap_result.get("stderr", "")
            if "whisper" in err.lower():
                step2["status"] = "warn"
                step2["note"] = "Whisper 未安装，字幕功能需要 Whisper。请运行: pip install openai-whisper"
            else:
                step2["status"] = "warn"
                step2["note"] = f"字幕识别失败: {err[:200]}"

            # Caption generation can fail when Whisper/FFmpeg is missing, but
            # existing JianYing drafts may already contain text that can drive
            # effect matching. Keep the standard pipeline alive.
            texts_result = _run_capcut(["texts", project, "--jianying"])
            if texts_result.get("ok") and texts_result.get("data"):
                texts = texts_result["data"]
                if isinstance(texts, list) and texts:
                    step2["details"].append(f"已读取草稿中现有文字 {len(texts)} 条")

        steps.append(step2)
        _update("executing", "步骤 3/4: 场景素材 — 正在从剪映内置特效库匹配...")

        # ── Step 3: 场景素材（剪映内置特效） ──
        step3 = {"name": "场景素材", "status": "running", "details": []}

        if effects_enabled and api_key:
            # 获取字幕文本
            subtitle_text = ""
            if texts_result.get("ok") and texts_result.get("data"):
                texts = texts_result["data"]
                if isinstance(texts, list):
                    subtitle_text = " ".join(t.get("text", "") for t in texts[:30])

            if subtitle_text:
                try:
                    # 1. 获取剪映内置特效列表
                    jy_effects = _get_jianying_effects()
                    scene_list = jy_effects.get("scene_effects", [])
                    filter_list = jy_effects.get("filters", [])
                    step3["details"].append(f"剪映内置: {len(scene_list)} 场景特效, {len(filter_list)} 滤镜")

                    # 2. 用 DeepSeek 智能匹配
                    # 构造特效列表文本（截断避免超长）
                    scene_text = "\n".join(f"{e['slug']} → {e['name']}" for e in scene_list[:80])
                    filter_text = "\n".join(f"{f['slug']} → {f['name']}" for f in filter_list[:60])

                    prompt = _EFFECT_SELECT_PROMPT.format(
                        scene_effects=scene_text,
                        filters=filter_text,
                        subtitle_text=subtitle_text[:1000]
                    )

                    ai_result_str = _call_deepseek(
                        prompt,
                        api_key, base_url,
                        system_prompt="你是视频剪辑师，只返回 JSON。",
                        temperature=0.4,
                        model=model,
                        max_tokens=1000,
                        timeout=120,
                    )

                    # 清理 markdown 代码块
                    if ai_result_str.startswith("```"):
                        lines = ai_result_str.split("\n")
                        lines = [l for l in lines if not l.strip().startswith("```")]
                        ai_result_str = "\n".join(lines)

                    ai_result = json.loads(ai_result_str)
                    selected_effects = ai_result.get("effects", [])
                    selected_filters = ai_result.get("filters", [])
                    apply_failures = []

                    step3["details"].append(f"AI 选择了 {len(selected_effects)} 个特效, {len(selected_filters)} 个滤镜")

                    # 3. 应用场景特效
                    for eff in selected_effects[:3]:
                        slug = eff.get("slug", "")
                        reason = eff.get("reason", "")
                        if slug:
                            eff_result = _run_capcut(
                                ["add-effect", project, slug, "--full", "--jianying"],
                                timeout=30
                            )
                            if eff_result.get("ok"):
                                step3["details"].append(f"✅ 特效: {slug} — {reason}")
                            else:
                                err = eff_result.get("error", "") or eff_result.get("stderr", "")
                                apply_failures.append(slug)
                                step3["details"].append(f"❌ 特效 {slug} 失败: {err[:100]}")

                    # 4. 应用滤镜
                    for filt in selected_filters[:2]:
                        slug = filt.get("slug", "")
                        reason = filt.get("reason", "")
                        if slug:
                            filt_result = _run_capcut(
                                ["add-filter", project, slug, "--full", "--jianying"],
                                timeout=30
                            )
                            if filt_result.get("ok"):
                                step3["details"].append(f"✅ 滤镜: {slug} — {reason}")
                            else:
                                err = filt_result.get("error", "") or filt_result.get("stderr", "")
                                apply_failures.append(slug)
                                step3["details"].append(f"❌ 滤镜 {slug} 失败: {err[:100]}")

                    step3["status"] = "done"
                    step3["note"] = "已从剪映内置特效库智能匹配并应用特效/滤镜，打开剪映即可预览"

                    if apply_failures:
                        step3["status"] = "warn"
                        step3["note"] = "AI matched effects/filters, but writing them to the draft failed. Close JianYing and retry."

                except json.JSONDecodeError as e:
                    step3["status"] = "warn"
                    step3["note"] = f"AI 返回格式异常: {str(e)[:150]}"
                except Exception as e:
                    step3["status"] = "warn"
                    step3["note"] = f"特效匹配失败: {str(e)[:200]}"
            else:
                step3["status"] = "warn"
                step3["note"] = "无字幕文本可用于分析，跳过特效匹配"
        elif not effects_enabled:
            step3["status"] = "done"
            step3["note"] = "用户已关闭场景特效"
        elif not api_key:
            step3["status"] = "warn"
            step3["note"] = "未配置 DeepSeek API Key，跳过特效匹配"

        steps.append(step3)
        _update("executing", "步骤 4/4: 导出视频 — 正在生成预览...")

        # ── Step 4: 导出视频 ──
        step4 = {"name": "导出视频", "status": "running", "details": []}

        # 使用 capcut-cli render 生成低清预览
        preview_path = os.path.join(os.path.dirname(project), "preview.mp4")
        render_args = ["render", project, "--out", preview_path, "--burn-captions"]
        render_args.append("--jianying")
        render_result = _run_capcut(render_args, timeout=600)

        if render_result.get("ok"):
            step4["details"].append(f"预览视频已生成: {preview_path}")
            step4["status"] = "done"
            step4["preview_path"] = preview_path
        else:
            err = render_result.get("error", "") or render_result.get("stderr", "")
            if "ffmpeg" in err.lower():
                step4["status"] = "warn"
                step4["note"] = "FFmpeg 不可用，无法生成预览。请在剪映中手动导出。"
            else:
                step4["status"] = "warn"
                step4["note"] = f"预览生成失败: {err[:200]}"
            step4["details"].append("提示: 请打开剪映，在剪映中进行最终导出（高质量）")

        steps.append(step4)

        # ── 完成 ──
        all_ok = all(s["status"] in ("done", "warn") for s in steps)
        any_error = any(s["status"] not in ("done", "warn") for s in steps)

        _update(
            "done" if all_ok else ("partial" if not any_error else "error"),
            "标准模式流水线完成" if all_ok else "部分步骤未完全成功",
            {"finished_at": time.strftime("%Y-%m-%d %H:%M:%S")}
        )

    except Exception as e:
        logger.error(f"[VideoEditor] 标准模式失败: {e}")
        _update("error", str(e)[:300],
                {"finished_at": time.strftime("%Y-%m-%d %H:%M:%S")})


# ═══════════════════════════════════════════════════════
# 自定义模式
# ═══════════════════════════════════════════════════════

def _run_ai_task(task_id: str, instruction: str, api_key: str, base_url: str,
                 model: str,
                 project: Optional[str] = None):
    """后台执行自定义模式 AI 剪辑任务"""
    with _editor_lock:
        _editor_tasks[task_id]["status"] = "thinking"
        _editor_tasks[task_id]["message"] = "DeepSeek 正在理解你的需求..."

    try:
        # 1. 调用 DeepSeek 生成命令
        commands = _call_deepseek_commands(instruction, api_key, base_url, model=model)

        with _editor_lock:
            _editor_tasks[task_id]["status"] = "executing"
            _editor_tasks[task_id]["message"] = f"正在执行 {len(commands)} 条命令..."
            _editor_tasks[task_id]["commands"] = commands

        # 2. 执行命令
        results = _execute_commands(commands, project)

        # 3. 判断整体结果
        all_ok = all(r["ok"] for r in results)
        with _editor_lock:
            _editor_tasks[task_id]["status"] = "done" if all_ok else "partial"
            _editor_tasks[task_id]["message"] = "全部完成" if all_ok else "部分命令执行失败"
            _editor_tasks[task_id]["results"] = results
            _editor_tasks[task_id]["finished_at"] = time.strftime("%Y-%m-%d %H:%M:%S")

    except Exception as e:
        logger.error(f"[VideoEditor] AI 任务失败: {e}")
        with _editor_lock:
            _editor_tasks[task_id]["status"] = "error"
            _editor_tasks[task_id]["message"] = str(e)[:300]
            _editor_tasks[task_id]["finished_at"] = time.strftime("%Y-%m-%d %H:%M:%S")


# ═══════════════════════════════════════════════════════
# 公共 API
# ═══════════════════════════════════════════════════════

def start_ai_edit(instruction: str, api_key: str, base_url: str = "",
                  model: str = "",
                  project: Optional[str] = None) -> dict:
    """启动自定义模式 AI 剪辑任务"""
    selected_model = _normalize_deepseek_model(model)
    task_id = f"edit_{int(time.time())}_{threading.get_ident()}"
    with _editor_lock:
        _editor_tasks[task_id] = {
            "status": "pending",
            "message": "任务已创建",
            "mode": "custom",
            "model": selected_model,
            "instruction": instruction,
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

    base = base_url or _DEEPSEEK_BASE_URL
    thread = threading.Thread(
        target=_run_ai_task,
        args=(task_id, instruction, api_key, base, selected_model, project),
        daemon=True
    )
    thread.start()

    return {"task_id": task_id}


def start_standard_edit(project: str, video_path: str, api_key: str,
                        base_url: str = "", options: dict = None) -> dict:
    """启动标准模式流水线"""
    options = options or {}
    selected_model = _normalize_deepseek_model(options.get("model"))
    options["model"] = selected_model
    task_id = f"std_{int(time.time())}_{threading.get_ident()}"
    with _editor_lock:
        _editor_tasks[task_id] = {
            "status": "pending",
            "message": "标准模式流水线已启动",
            "mode": "standard",
            "project": project,
            "video_path": video_path,
            "options": options or {},
            "model": selected_model,
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "steps": [],
        }

    base = base_url or _DEEPSEEK_BASE_URL
    thread = threading.Thread(
        target=_run_standard_task,
        args=(task_id, project, video_path, api_key, base, options or {}),
        daemon=True
    )
    thread.start()

    return {"task_id": task_id}


def get_task_status(task_id: str) -> dict:
    """获取任务状态"""
    with _editor_lock:
        task = _editor_tasks.get(task_id)
        if not task:
            return {"error": "任务不存在"}
        return dict(task)


def list_drafts() -> dict:
    """列出剪映草稿"""
    info = _check_jianying_installed()
    if not info["installed"]:
        return {"error": "未检测到剪映，请先安装剪映"}
    return {"drafts": info["drafts"], "draft_dir": info["draft_dir"]}


def get_draft_info(project: str) -> dict:
    """获取草稿详情"""
    result = _run_capcut(["info", project])
    return result


def create_project(name: str, video_path: Optional[str] = None) -> dict:
    """创建新剪映项目"""
    if video_path:
        result = _run_capcut(["quickstart", name, "--video", video_path])
    else:
        result = _run_capcut(["init", name])
    return result


def open_in_jianying(project_path: str) -> dict:
    """在文件管理器中打开项目"""
    try:
        draft_file = os.path.join(project_path, "draft_content.json")
        if os.path.isfile(draft_file):
            os.startfile(os.path.dirname(draft_file))
            return {"ok": True, "message": "已在文件管理器中打开"}
        return {"ok": False, "error": "草稿文件不存在"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}


def get_environment() -> dict:
    """获取环境状态"""
    capcut = _check_capcut_available()
    jianying = _check_jianying_installed()
    ffmpeg = _get_ffmpeg_binary()
    whisper = shutil.which("whisper")
    return {
        "capcut": capcut,
        "jianying": jianying,
        "ffmpeg": {"available": bool(ffmpeg), "path": ffmpeg or ""},
        "whisper": {"available": bool(whisper), "path": whisper or ""},
        "deepseek_key_set": bool(_DEEPSEEK_API_KEY),
        "deepseek_models": get_deepseek_models(),
        "deepseek_default_model": _DEEPSEEK_DEFAULT_MODEL,
    }


_legacy_get_environment = get_environment


def get_environment() -> dict:
    """Return video editor environment, including the V2 local ASR model state."""
    data = _legacy_get_environment()
    fw_model_dir = os.environ.get(
        "MODEL_DIR",
        os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "MatrixFlow", "models", "faster-whisper-small"),
    )
    try:
        import faster_whisper  # noqa: F401
        fw_installed = True
    except Exception:
        fw_installed = False
    data["faster_whisper"] = {"installed": fw_installed, "model_dir": fw_model_dir, "model_ready": os.path.isdir(fw_model_dir)}
    whisper_cache = os.environ.get("WHISPER_CACHE_DIR") or os.path.join(os.path.expanduser("~"), ".cache", "whisper")
    cached_whisper_model = ""
    for name in [os.environ.get("WHISPER_MODEL", ""), "small", "base", "tiny"]:
        if name and os.path.isfile(os.path.join(whisper_cache, f"{name}.pt")):
            cached_whisper_model = name
            break
    data.setdefault("whisper", {})
    data["whisper"]["cached_model"] = cached_whisper_model
    data["speech_to_text_ready"] = bool(os.path.isdir(fw_model_dir) or cached_whisper_model)
    data["default_material_library"] = os.path.join(os.path.expanduser("~"), "Videos", "PixingyunAssets")
    return data


def start_v2_basic_edit(payload: dict) -> dict:
    """Start the timeline based MP4-producing basic editor."""
    from video_editor.task_manager import start_basic_task

    source_path = str((payload or {}).get("source_path") or "").strip()
    if not source_path:
        raise ValueError("SOURCE_REQUIRED")
    if not os.path.isfile(source_path):
        raise ValueError("SOURCE_NOT_FOUND")
    return start_basic_task(payload or {})


def list_v2_tasks() -> list:
    from video_editor.task_manager import list_tasks

    return list_tasks()


def get_v2_task(task_id: str) -> dict:
    from video_editor.task_manager import get_task

    return get_task(task_id)


def cancel_v2_task(task_id: str) -> dict:
    from video_editor.task_manager import cancel_task

    return cancel_task(task_id)


def scan_v2_materials(folder: str) -> dict:
    from video_editor.material_library import scan_materials

    return {"materials": scan_materials(folder), "folder": folder}


def pick_v2_video() -> dict:
    import tkinter as tk
    from tkinter import filedialog
    from video_editor.probe import probe_video

    root = tk.Tk()
    root.withdraw()
    path = filedialog.askopenfilename(
        title="选择视频",
        filetypes=[("Video files", "*.mp4 *.mov *.mkv *.avi *.webm"), ("All files", "*.*")],
    )
    root.destroy()
    if not path:
        return {"cancelled": True}
    info = probe_video(path).to_dict()
    return {"cancelled": False, "path": path, "info": info}


def pick_v2_material_folder() -> dict:
    import tkinter as tk
    from tkinter import filedialog
    from video_editor.material_library import scan_materials

    root = tk.Tk()
    root.withdraw()
    path = filedialog.askdirectory(title="选择素材库")
    root.destroy()
    if not path:
        return {"cancelled": True}
    return {"cancelled": False, "folder": path, "material_count": len(scan_materials(path))}


def probe_v2_video(path: str) -> dict:
    from video_editor.probe import probe_video

    return probe_video(path).to_dict()


def open_v2_output(path: str = "") -> dict:
    try:
        if path and os.path.isfile(path):
            subprocess.run(["explorer", "/select,", path], check=False)
            return {"ok": True}
        folder = os.path.join(os.path.expanduser("~"), "Videos", "Pixingyun", "Exports")
        os.makedirs(folder, exist_ok=True)
        os.startfile(folder)
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def play_v2_output(path: str) -> dict:
    if not path or not os.path.isfile(path):
        return {"ok": False, "error": "OUTPUT_NOT_FOUND"}
    try:
        os.startfile(path)
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def start_v2_advanced_analyze(payload: dict) -> dict:
    from video_editor.task_manager import start_advanced_analyze_task

    source_path = str((payload or {}).get("source_path") or "").strip()
    if not source_path or not os.path.isfile(source_path):
        raise ValueError("SOURCE_NOT_FOUND")
    return start_advanced_analyze_task(payload or {})


def patch_v2_advanced_plan(task_id: str, patch: dict) -> dict:
    from video_editor.task_manager import patch_advanced_plan

    return patch_advanced_plan(task_id, patch or {})


def render_v2_advanced(task_id: str, options: dict) -> dict:
    from video_editor.task_manager import start_advanced_render_task

    return start_advanced_render_task(task_id, options or {})
