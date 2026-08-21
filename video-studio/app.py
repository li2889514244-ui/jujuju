"""
app.py — Video Studio Flask 后端

完全独立运行，不影响 desktop-companion

启动: python app.py
端口: 默认 5600
"""
import os
import time
import threading
import uuid
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from loguru import logger
import config

# 初始化
config.ensure_dirs()

BASE_DIR = Path(__file__).parent.resolve()

app = Flask(__name__, static_folder="static")
CORS(app)

# 配置日志
log_level = config.get("app", "log_level", "INFO")
logger.remove()
logger.add(lambda msg: print(msg, end=""), level=log_level, colorize=True)

# ═══════════════════════════════════════════════════════
# 任务管理（内存中，简单够用）
# ═══════════════════════════════════════════════════════

_tasks = {}
_tasks_lock = threading.Lock()


def _create_task(task_type: str, params: dict) -> str:
    task_id = str(uuid.uuid4())[:8]
    with _tasks_lock:
        _tasks[task_id] = {
            "id": task_id,
            "type": task_type,
            "status": "pending",
            "progress": 0,
            "message": "",
            "result": None,
            "error": None,
            "created_at": time.time(),
            "params": params,
        }
    return task_id


def _update_task(task_id: str, **kwargs):
    with _tasks_lock:
        if task_id in _tasks:
            _tasks[task_id].update(kwargs)


def _get_task(task_id: str) -> dict:
    with _tasks_lock:
        return _tasks.get(task_id, {}).copy()


# ═══════════════════════════════════════════════════════
# API 路由
# ═══════════════════════════════════════════════════════

@app.route("/")
def index():
    """返回 WebUI"""
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "name": "Video Studio", "version": "1.0.0"})


@app.route("/api/config")
def get_config():
    """返回当前配置（隐藏敏感的 API key）"""
    cfg = config.load_config()
    safe = {}
    for section, values in cfg.items():
        safe[section] = {}
        for k, v in values.items():
            if "key" in k.lower() or "token" in k.lower():
                safe[section][k] = "***" if v else ""
            else:
                safe[section][k] = v
    return jsonify(safe)


def _coerce_value(v):
    """将前端传来的字符串转换为合适的类型，避免 TOML 写入后 int→str"""
    if not isinstance(v, str):
        return v
    if v == "true":
        return True
    if v == "false":
        return False
    try:
        return int(v)
    except ValueError:
        pass
    try:
        return float(v)
    except ValueError:
        pass
    return v


@app.route("/api/config", methods=["POST"])
def update_config():
    """更新配置文件"""
    data = request.json
    if not data:
        return jsonify({"error": "无数据"}), 400

    try:
        import tomli_w
        cfg = config.load_config()
        for section, values in data.items():
            if section in cfg:
                for k, v in values.items():
                    cfg[section][k] = _coerce_value(v)

        with open(config.CONFIG_FILE, "wb") as f:
            tomli_w.dump(cfg, f)

        # 清除缓存让下次读取生效
        config._config = None

        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── 字幕相关 ───

@app.route("/api/subtitle/recognize", methods=["POST"])
def api_recognize_subtitle():
    """识别视频中的语音，生成字幕"""
    data = request.json or {}
    video_path = data.get("video_path", "")
    language = data.get("language", "zh")

    if not video_path or not os.path.isfile(video_path):
        return jsonify({"error": f"视频文件不存在: {video_path}"}), 400

    task_id = _create_task("subtitle", {"video_path": video_path, "language": language})

    def _worker():
        try:
            _update_task(task_id, status="running", message="正在提取音频...")
            import subtitle

            _update_task(task_id, progress=20, message="正在识别语音...")
            segments = subtitle.recognize_subtitle(video_path, language)

            if not segments:
                _update_task(task_id, status="done", progress=100,
                             message="未识别到语音内容",
                             result={"segments": [], "count": 0})
                return

            # AI 优化字幕文案
            _update_task(task_id, progress=60, message="正在优化字幕文案...")
            import ai_keywords
            segments = ai_keywords.optimize_subtitle(segments)

            # 生成 ASS 和 SRT
            _update_task(task_id, progress=80, message="正在生成字幕文件...")
            inter_dir = config.get("output", "intermediate_dir", "storage/intermediate")
            inter_path = BASE_DIR / inter_dir
            inter_path.mkdir(parents=True, exist_ok=True)

            ass_path = str(inter_path / f"subtitle_{task_id}.ass")
            srt_path = str(inter_path / f"subtitle_{task_id}.srt")

            subtitle.generate_ass(segments, ass_path)
            subtitle.generate_srt(segments, srt_path)

            _update_task(task_id, status="done", progress=100,
                         message=f"识别完成，共 {len(segments)} 条字幕",
                         result={
                             "segments": [{"start": s, "end": e, "text": t} for s, e, t in segments],
                             "count": len(segments),
                             "ass_path": ass_path,
                             "srt_path": srt_path,
                         })
        except Exception as e:
            logger.exception("字幕识别失败")
            _update_task(task_id, status="error", error=str(e))

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({"task_id": task_id})


# ─── B-roll 搜索 ───

@app.route("/api/material/search")
def api_search_material():
    """搜索 B-roll 素材"""
    keyword = request.args.get("keyword", "")
    if not keyword:
        return jsonify({"error": "请提供搜索关键词"}), 400

    try:
        import material
        clips = material.search_materials(keyword)

        # 自动下载前几个素材
        downloaded = []
        for clip in clips[:5]:  # 最多下载5个
            local = material.download_material(clip)
            if local:
                downloaded.append(clip.to_dict())

        return jsonify({
            "keyword": keyword,
            "total_found": len(clips),
            "downloaded": len(downloaded),
            "clips": downloaded,
        })
    except Exception as e:
        logger.exception("素材搜索失败")
        return jsonify({"error": str(e)}), 500


@app.route("/api/material/search-by-subtitle", methods=["POST"])
def api_search_by_subtitle():
    """根据字幕内容自动提取关键词并搜索 B-roll"""
    data = request.json or {}
    segments = data.get("segments", [])

    if not segments:
        return jsonify({"error": "请提供字幕内容"}), 400

    task_id = _create_task("material_search", {"segments_count": len(segments)})

    def _worker():
        try:
            _update_task(task_id, status="running", message="正在提取搜索关键词...")
            import ai_keywords
            import material

            # 转换格式
            seg_tuples = [(s["start"], s["end"], s["text"]) for s in segments]

            keywords = ai_keywords.extract_keywords(seg_tuples)
            _update_task(task_id, progress=30, message=f"提取到 {len(keywords)} 个关键词: {keywords}")

            all_clips = []
            for i, kw in enumerate(keywords):
                _update_task(task_id, progress=30 + int(60 * (i + 1) / len(keywords)),
                             message=f"正在搜索: {kw} ({i+1}/{len(keywords)})")
                clips = material.search_materials(kw, count=3)
                for clip in clips[:2]:  # 每个关键词取2个
                    local = material.download_material(clip)
                    if local:
                        all_clips.append(clip.to_dict())

            _update_task(task_id, status="done", progress=100,
                         message=f"共下载 {len(all_clips)} 个素材",
                         result={"keywords": keywords, "clips": all_clips})
        except Exception as e:
            logger.exception("B-roll 搜索失败")
            _update_task(task_id, status="error", error=str(e))

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({"task_id": task_id})


# ─── 背景音乐 ───

@app.route("/api/bgm/list")
def api_list_bgm():
    """列出可用的背景音乐"""
    try:
        import bgm
        files = bgm.list_music()
        return jsonify({"music": files})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/bgm/upload", methods=["POST"])
def api_upload_bgm():
    """上传背景音乐"""
    if "file" not in request.files:
        return jsonify({"error": "请上传文件"}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "空文件名"}), 400

    try:
        import bgm
        data = f.read()
        if len(data) > 30 * 1024 * 1024:
            return jsonify({"error": "文件超过 30MB 限制"}), 400

        path = bgm.save_uploaded_music(f.filename, data)
        return jsonify({"ok": True, "path": path, "name": f.filename})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── 视频渲染 ───

@app.route("/api/render", methods=["POST"])
def api_render():
    """
    完整渲染流程
    
    参数:
        video_path: 原始视频路径
        ass_path: ASS 字幕文件路径（可选）
        broll_paths: B-roll 文件路径列表（可选）
        bgm_name: 背景音乐文件名（可选）
        bgm_volume: 背景音乐音量（可选）
    """
    data = request.json or {}
    video_path = data.get("video_path", "")
    ass_path = data.get("ass_path")
    broll_paths = data.get("broll_paths", [])
    bgm_name = data.get("bgm_name")
    bgm_volume = data.get("bgm_volume")

    if not video_path or not os.path.isfile(video_path):
        return jsonify({"error": f"视频文件不存在: {video_path}"}), 400

    # 解析背景音乐路径
    bgm_path = None
    if bgm_name:
        try:
            import bgm
            bgm_path = bgm.resolve_music_path(bgm_name)
        except FileNotFoundError as e:
            return jsonify({"error": str(e)}), 400

    task_id = _create_task("render", {
        "video_path": video_path,
        "ass_path": ass_path,
        "broll_count": len(broll_paths),
        "bgm_name": bgm_name,
    })

    def _worker():
        try:
            import renderer

            _update_task(task_id, status="running", message="开始渲染...")

            output_dir = config.get("output", "dir", "storage/output")
            output_path = str(BASE_DIR / output_dir / f"final_{task_id}.mp4")

            _update_task(task_id, progress=10, message="正在处理 B-roll 和字幕...")
            result_path = renderer.render_video(
                input_video=video_path,
                ass_path=ass_path,
                broll_paths=broll_paths if broll_paths else None,
                bgm_path=bgm_path,
                output_path=output_path,
                bgm_volume=bgm_volume,
            )

            _update_task(task_id, status="done", progress=100,
                         message="渲染完成",
                         result={"output_path": result_path})
        except Exception as e:
            logger.exception("渲染失败")
            _update_task(task_id, status="error", error=str(e))

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({"task_id": task_id})


# ─── 一键处理（全自动流水线） ───

@app.route("/api/autoprocess", methods=["POST"])
def api_autoprocess():
    """
    全自动流水线:
      1. 识别字幕
      2. AI 优化字幕
      3. AI 提取关键词 → 搜索下载 B-roll
      4. 混入背景音乐
      5. 渲染最终视频
    
    参数:
        video_path: 原始视频路径
        bgm_name: 背景音乐文件名（可选）
        language: 语言（默认 zh）
    """
    data = request.json or {}
    video_path = data.get("video_path", "")
    bgm_name = data.get("bgm_name")
    language = data.get("language", "zh")

    if not video_path or not os.path.isfile(video_path):
        return jsonify({"error": f"视频文件不存在: {video_path}"}), 400

    task_id = _create_task("autoprocess", {"video_path": video_path, "bgm_name": bgm_name})

    def _worker():
        try:
            import subtitle
            import ai_keywords
            import material
            import renderer
            import bgm

            # Step 1: 识别字幕
            _update_task(task_id, status="running", progress=5, message="Step 1/5: 正在识别字幕...")
            segments = subtitle.recognize_subtitle(video_path, language)

            if not segments:
                _update_task(task_id, status="error", error="未识别到语音内容")
                return

            _update_task(task_id, progress=20, message=f"Step 1/5: 识别到 {len(segments)} 条字幕")

            # Step 2: AI 优化字幕
            _update_task(task_id, progress=25, message="Step 2/5: 正在优化字幕文案...")
            segments = ai_keywords.optimize_subtitle(segments)

            # 生成 ASS
            inter_dir = config.get("output", "intermediate_dir", "storage/intermediate")
            inter_path = BASE_DIR / inter_dir
            inter_path.mkdir(parents=True, exist_ok=True)

            ass_path = str(inter_path / f"subtitle_{task_id}.ass")
            srt_path = str(inter_path / f"subtitle_{task_id}.srt")
            subtitle.generate_ass(segments, ass_path)
            subtitle.generate_srt(segments, srt_path)

            _update_task(task_id, progress=35, message="Step 2/5: 字幕优化完成")

            # Step 3: AI 提取关键词 + 搜索 B-roll
            _update_task(task_id, progress=40, message="Step 3/5: 正在提取搜索关键词...")
            keywords = ai_keywords.extract_keywords(segments)

            broll_paths = []
            for i, kw in enumerate(keywords):
                _update_task(task_id, progress=40 + int(20 * (i + 1) / len(keywords)),
                             message=f"Step 3/5: 搜索 B-roll: {kw}")
                clips = material.search_materials(kw, count=2)
                for clip in clips[:1]:  # 每个关键词取1个
                    local = material.download_material(clip)
                    if local:
                        broll_paths.append(local)

            _update_task(task_id, progress=60, message=f"Step 3/5: 下载了 {len(broll_paths)} 个 B-roll 素材")

            # Step 4: 解析背景音乐
            bgm_path = None
            if bgm_name:
                try:
                    bgm_path = bgm.resolve_music_path(bgm_name)
                except FileNotFoundError:
                    logger.warning(f"背景音乐不存在: {bgm_name}")

            _update_task(task_id, progress=65, message="Step 4/5: 准备背景音乐")

            # Step 5: 渲染
            _update_task(task_id, progress=70, message="Step 5/5: 正在渲染最终视频...")
            output_dir = config.get("output", "dir", "storage/output")
            output_path = str(BASE_DIR / output_dir / f"final_{task_id}.mp4")

            result_path = renderer.render_video(
                input_video=video_path,
                ass_path=ass_path,
                broll_paths=broll_paths if broll_paths else None,
                bgm_path=bgm_path,
                output_path=output_path,
            )

            _update_task(task_id, status="done", progress=100,
                         message="🎉 全部完成",
                         result={
                             "output_path": result_path,
                             "subtitle_count": len(segments),
                             "broll_count": len(broll_paths),
                             "ass_path": ass_path,
                             "srt_path": srt_path,
                             "keywords": keywords,
                         })
        except Exception as e:
            logger.exception("自动处理失败")
            _update_task(task_id, status="error", error=str(e))

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({"task_id": task_id})


# ─── 任务状态查询 ───

@app.route("/api/task/<task_id>")
def api_get_task(task_id):
    """查询任务状态"""
    task = _get_task(task_id)
    if not task:
        return jsonify({"error": "任务不存在"}), 404
    return jsonify(task)


# ─── 文件浏览 ───

@app.route("/api/files/output")
def api_list_output():
    """列出输出目录的文件"""
    output_dir = config.get("output", "dir", "storage/output")
    out_path = BASE_DIR / output_dir
    files = []
    if out_path.exists():
        for f in sorted(out_path.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if f.is_file():
                files.append({
                    "name": f.name,
                    "size_mb": round(f.stat().st_size / 1024 / 1024, 2),
                    "modified": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(f.stat().st_mtime)),
                })
    return jsonify({"files": files})


@app.route("/api/files/download")
def api_download_file():
    """下载文件"""
    filename = request.args.get("file", "")
    output_dir = config.get("output", "dir", "storage/output")
    out_path = BASE_DIR / output_dir
    try:
        return send_from_directory(str(out_path), filename, as_attachment=True)
    except FileNotFoundError:
        return jsonify({"error": "文件不存在"}), 404


# ═══════════════════════════════════════════════════════
# 启动
# ═══════════════════════════════════════════════════════

if __name__ == "__main__":
    port = config.get("app", "port", 5600)
    print(f"""
╔══════════════════════════════════════════════╗
║   Video Studio v1.0.0                        ║
║   独立视频后处理工具                           ║
║   http://127.0.0.1:{port}                       ║
╚══════════════════════════════════════════════╝
    """)
    app.run(host="127.0.0.1", port=port, debug=False)
