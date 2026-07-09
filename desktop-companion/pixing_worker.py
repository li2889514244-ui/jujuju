"""
披星云数字人视频 Worker — 轮询任务 → 自动合成 → 回传结果
作为 companion_app.py 的后台线程运行

安全修复：
  - 所有 API 调用携带 X-Service-Token 头，通过后端 ServiceTokenGuard 认证
  - Service Token 从 companion_config.json 的 service_token 字段读取

稳定性修复：
  - 指数退避：API 连续失败时自动拉长轮询间隔（15s → 30s → 60s → 120s → 300s）
  - 浏览器清理保证：无论任务成功或失败，都确保 browser/context 正确关闭
  - 最大连续错误计数：超过 10 次连续错误后自动暂停 5 分钟
"""
import asyncio, json, time, threading, requests, os
from pathlib import Path

# ═══════════════════════════════════════════════════════
# 配置
# ═══════════════════════════════════════════════════════
API_BASE = "https://ddddkiii.com/api/v1"
PIXING_EDU_URL = "https://www.pixingjiaoyu.com.cn/#/login?redirectUrl=%2Fworks"
POLL_INTERVAL = 15          # 基础轮询间隔（秒）
MAX_POLL_INTERVAL = 300     # 最大轮询间隔（指数退避上限）
MAX_CONSECUTIVE_ERRORS = 10  # 连续错误上限，超过后暂停 5 分钟
COOLDOWN_AFTER_ERRORS = 300  # 连续错误后的冷却时间（秒）
DOWNLOAD_DIR = Path.home() / "Downloads" / "披星云视频"

_status = {
    "running": False,
    "current_task": None,
    "last_error": "",
    "completed": 0,
    "consecutive_errors": 0,
    "current_poll_interval": POLL_INTERVAL,
}

def get_status():
    return dict(_status)

# ═══════════════════════════════════════════════════════
# Service Token 读取
# ═══════════════════════════════════════════════════════
def _get_service_token() -> str:
    """从 companion_config.json 读取 service_token，或从环境变量读取。"""
    # 1. 环境变量优先
    env_token = os.environ.get('SERVICE_TOKEN', '')
    if env_token:
        return env_token

    # 2. 从配置文件读取（优先 AppData，回退到旧位置）
    try:
        import sys as _sys
        _config_candidates = [
            Path.home() / 'AppData' / 'Local' / 'MatrixFlow' / 'companion_config.json',
        ]
        if getattr(_sys, 'frozen', False):
            _config_candidates.append(Path(_sys.executable).parent / 'companion_config.json')
        else:
            _config_candidates.append(Path(__file__).parent / 'companion_config.json')
        for config_path in _config_candidates:
            if config_path.exists():
                cfg = json.loads(config_path.read_text(encoding='utf-8'))
                token = cfg.get('service_token', '')
                if token:
                    return token
    except Exception:
        pass
    return ''

_SERVICE_TOKEN = ''
def _ensure_service_token():
    """确保 service token 已加载，返回是否成功。"""
    global _SERVICE_TOKEN
    if not _SERVICE_TOKEN:
        _SERVICE_TOKEN = _get_service_token()
    return bool(_SERVICE_TOKEN)

def _get_auth_headers() -> dict:
    """返回包含 Service Token 的请求头。"""
    _ensure_service_token()
    headers = {'Content-Type': 'application/json'}
    if _SERVICE_TOKEN:
        headers['X-Service-Token'] = _SERVICE_TOKEN
    return headers

# ═══════════════════════════════════════════════════════
# 核心：拉取任务 + 更新状态（带认证）
# ═══════════════════════════════════════════════════════
def _api_get(path):
    headers = _get_auth_headers()
    try:
        r = requests.get(f"{API_BASE}{path}", headers=headers, timeout=15)
        if r.status_code == 401:
            _status["last_error"] = f"API GET {path}: 401 Unauthorized — Service Token 无效或未配置"
            print(f"[PixingWorker] ⚠ 401 Unauthorized: Service Token 认证失败。请检查 companion_config.json 中的 service_token 字段。")
            return None
        return r.json() if r.status_code == 200 else None
    except Exception as e:
        _status["last_error"] = f"API GET {path}: {e}"
        return None

def _api_patch(path, data):
    headers = _get_auth_headers()
    try:
        r = requests.patch(f"{API_BASE}{path}", json=data, headers=headers, timeout=15)
        if r.status_code == 401:
            _status["last_error"] = f"API PATCH {path}: 401 Unauthorized — Service Token 无效或未配置"
            print(f"[PixingWorker] ⚠ 401 Unauthorized: Service Token 认证失败。")
            return None
        return r.json() if r.status_code == 200 else None
    except Exception as e:
        _status["last_error"] = f"API PATCH {path}: {e}"
        return None

def fetch_next_task():
    """从服务器拉取下一个待处理任务"""
    result = _api_get("/pixing-video/tasks/next")
    if result and result.get("data"):
        return result["data"]
    return None

def update_task(task_id, **kwargs):
    """更新任务状态/结果"""
    return _api_patch(f"/pixing-video/tasks/{task_id}", kwargs)

# ═══════════════════════════════════════════════════════
# 指数退避管理
# ═══════════════════════════════════════════════════════
def _on_api_success():
    """API 调用成功时重置退避。"""
    _status["consecutive_errors"] = 0
    _status["current_poll_interval"] = POLL_INTERVAL

def _on_api_failure():
    """API 调用失败时增加退避间隔。"""
    _status["consecutive_errors"] += 1
    current = _status["current_poll_interval"]
    # 指数退避：每次翻倍，上限 MAX_POLL_INTERVAL
    _status["current_poll_interval"] = min(current * 2, MAX_POLL_INTERVAL)
    print(f"[PixingWorker] 连续错误 {_status['consecutive_errors']} 次，"
          f"下次轮询间隔 {_status['current_poll_interval']}s")

def _should_cooldown() -> bool:
    """是否需要进入冷却期。"""
    return _status["consecutive_errors"] >= MAX_CONSECUTIVE_ERRORS

# ═══════════════════════════════════════════════════════
# 自动化执行 — Playwright
# ═══════════════════════════════════════════════════════
def _find_browser():
    """检测可用浏览器"""
    CHROMIUM_DIR = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'MatrixFlow' / 'chromium'
    CHROMIUM_EXE = CHROMIUM_DIR / 'chrome.exe'
    if CHROMIUM_EXE.exists():
        return str(CHROMIUM_EXE)
    for p in [
        os.environ.get('PROGRAMFILES', 'C:\\Program Files') + '\\Google\\Chrome\\Application\\chrome.exe',
        os.environ.get('ProgramFiles(x86)', 'C:\\Program Files (x86)') + '\\Google\\Chrome\\Application\\chrome.exe',
        os.environ.get('LOCALAPPDATA', '') + '\\Google\\Chrome\\Application\\chrome.exe',
    ]:
        if os.path.exists(p):
            return p
    return None  # Let Playwright find its own

async def _execute_task(task: dict):
    """
    用 Playwright 自动执行一个数字人视频任务：
    1. 打开披星教育
    2. 选老师
    3. 输入文案
    4. 合成视频
    5. 下载视频
    6. 生成/提取字幕
    """
    from playwright.async_api import async_playwright

    task_id = task["id"]
    teacher = task["teacher"]
    text = task["text"]

    print(f"[PixingWorker] 开始执行任务 {task_id}: 老师={teacher}, 文案={len(text)}字")
    _status["current_task"] = task_id
    update_task(task_id, status="processing")

    browser = None
    context = None

    try:
        async with async_playwright() as pw:
            browser_path = _find_browser()
            launch_opts = {
                "headless": False,  # 有头模式，方便调试
                "args": ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--lang=zh-CN", "--disable-features=AutomationControlled"],
            }
            if browser_path:
                launch_opts["executable_path"] = browser_path

            browser = await pw.chromium.launch(**launch_opts)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                locale="zh-CN",
            )
            # 注入反检测脚本
            try:
                from stealth_patches import apply_stealth_to_context
                await apply_stealth_to_context(context)
            except ImportError:
                pass
            page = await context.new_page()

            # ── 第1步：打开披星教育 ──
            print(f"[PixingWorker] 打开 {PIXING_EDU_URL}")
            await page.goto(PIXING_EDU_URL, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(3000)
            # 等页面完全加载（SPA 需要 JS 渲染）
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(2000)

            # ── 第2步：点击"视频创作"按钮 ──
            print(f"[PixingWorker] 点击视频创作")
            for btn_text in ["视频创作", "创建视频", "新建视频", "创作"]:
                try:
                    await page.click(f"text={btn_text}", timeout=5000)
                    print(f"[PixingWorker] 点击了 '{btn_text}'")
                    break
                except:
                    continue
            await page.wait_for_timeout(2000)

            # ── 第3步：选择老师形象 ──
            print(f"[PixingWorker] 选择老师: {teacher}")
            # 点击老师选择区域
            for sel in ['text=选择老师', 'text=老师形象', '[placeholder*="老师"]', '.teacher-select', '.teacher-item']:
                try:
                    await page.click(sel, timeout=3000)
                    break
                except:
                    continue
            await page.wait_for_timeout(1000)
            # 在弹出的列表中找到并点击对应老师
            try:
                await page.click(f"text={teacher}", timeout=5000)
                print(f"[PixingWorker] 已选择老师: {teacher}")
            except:
                # 备选：搜索老师名字
                search = await page.query_selector('input[placeholder*="搜索"], input[placeholder*="老师"]')
                if search:
                    await search.fill(teacher)
                    await page.wait_for_timeout(1500)
                    await page.click(f"text={teacher}", timeout=5000)
            await page.wait_for_timeout(2000)

            # ── 第4步：选择跟老师同名的音频 ──
            print(f"[PixingWorker] 选择音频: {teacher}")
            for sel in ['text=选择音频', 'text=音频', '[placeholder*="音频"]', '.audio-select']:
                try:
                    await page.click(sel, timeout=3000)
                    break
                except:
                    continue
            await page.wait_for_timeout(1000)
            # 选择同名音频
            try:
                await page.click(f"text={teacher}", timeout=5000)
                print(f"[PixingWorker] 已选择音频: {teacher}")
            except:
                print(f"[PixingWorker] 警告: 未找到同名音频，跳过")
            await page.wait_for_timeout(2000)

            # ── 第5步：粘贴文案 ──
            print(f"[PixingWorker] 输入文案 ({len(text)}字)")
            text_input = await page.query_selector('textarea, [contenteditable="true"], .editor, .text-input')
            if text_input:
                await text_input.click()
                await page.wait_for_timeout(500)
                # 用 clipboard 方式粘贴（更可靠处理长文本）
                await page.evaluate('(t) => navigator.clipboard.writeText(t)', text)
                await page.keyboard.press('Control+v')
            await page.wait_for_timeout(1500)

            # ── 第6步：点击合成视频 ──
            print(f"[PixingWorker] 点击合成视频")
            for btn_text in ["合成视频", "合成", "开始合成", "生成视频"]:
                try:
                    await page.click(f"text={btn_text}", timeout=3000)
                    print(f"[PixingWorker] 点击了 '{btn_text}'")
                    break
                except:
                    continue
            await page.wait_for_timeout(3000)

            # ── 第7步：选择"1.0中级训练" → 点击"去合成" ──
            print(f"[PixingWorker] 选择 1.0中级训练 → 去合成")
            synth_btn = None
            try:
                mid_level = await page.query_selector('text=1.0中级训练')
                if mid_level:
                    parent = await mid_level.evaluate_handle('el => el.closest("div,li,tr,[class*=\\"item\\"],[class*=\\"card\\"],[class*=\\"row\\"]")')
                    if parent:
                        synth_btn = await parent.query_selector('text=去合成')
                        if synth_btn:
                            await synth_btn.click()
                            print(f"[PixingWorker] 已点击 1.0中级训练 的去合成")
            except:
                pass
            if not synth_btn:
                try:
                    await page.click('text=去合成', timeout=3000)
                    print(f"[PixingWorker] 直接点击了去合成")
                except:
                    print(f"[PixingWorker] 警告: 未找到去合成按钮")
            await page.wait_for_timeout(3000)

            # ── 第8步：等待合成完成 + 获取视频 ──
            print(f"[PixingWorker] 等待视频合成...")
            DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
            for i in range(240):  # 最多等20分钟
                await page.wait_for_timeout(5000)
                # 检查是否有下载/完成提示
                video_url = None
                try:
                    # 查找视频元素或下载按钮
                    video_el = await page.query_selector('video, [class*="video"], [class*="player"]')
                    if video_el:
                        video_url = await video_el.get_attribute("src") or ""
                    if not video_url:
                        dl = await page.query_selector('a[download], [class*="download"], text=下载')
                        if dl:
                            video_url = await dl.get_attribute("href") or ""
                except:
                    pass
                if video_url:
                    update_task(task_id, status="completed", videoUrl=video_url)
                    print(f"[PixingWorker] 视频完成: {video_url[:80]}")
                    break
                # 检查是否失败
                try:
                    err = await page.query_selector('[class*="error"], text=失败, text=错误')
                    if err:
                        err_text = await err.inner_text()
                        update_task(task_id, status="failed", error=err_text[:500])
                        print(f"[PixingWorker] 合成失败: {err_text[:100]}")
                        break
                except:
                    pass
                if i % 24 == 0:
                    print(f"[PixingWorker] 仍在等待... ({i * 5}s)")

            # ── 第9步：字幕 ──
            srt_content = None
            # 方式1：从页面提取字幕
            try:
                # 查找字幕文本区域
                srt_elem = await page.query_selector('[class*="subtitle"], [class*="srt"], pre, text=字幕内容')
                if srt_elem:
                    srt_content = await srt_elem.inner_text()
                    print(f"[PixingWorker] 从页面提取字幕: {len(srt_content)}字")
            except:
                pass
            # 方式2：尝试下载字幕文件
            if not srt_content:
                try:
                    srt_link = await page.query_selector('a[href*=".srt"], a[href*=".vtt"], text=下载字幕')
                    if srt_link:
                        srt_url = await srt_link.get_attribute("href")
                        if srt_url:
                            import requests as req
                            r = req.get(srt_url, timeout=30)
                            srt_content = r.text
                            print(f"[PixingWorker] 下载字幕文件: {len(srt_content)}字")
                except:
                    pass
            # 方式3：用输入文案自动生成 SRT（中文 ~4字/秒）
            if not srt_content:
                srt_content = _text_to_srt(text)
                print(f"[PixingWorker] 自动生成字幕: {len(srt_content)}字")

            if srt_content:
                update_task(task_id, srtContent=srt_content)

            _status["completed"] += 1
            _status["current_task"] = None
            print(f"[PixingWorker] 任务 {task_id} 完成")

    except Exception as e:
        error_msg = str(e)[:500]
        print(f"[PixingWorker] 任务 {task_id} 失败: {error_msg}")
        update_task(task_id, status="failed", error=error_msg)
        _status["last_error"] = error_msg
        _status["current_task"] = None
    finally:
        # ── 浏览器清理保证：无论成功或失败都关闭浏览器 ──
        if context:
            try:
                await context.close()
            except Exception:
                pass
        if browser:
            try:
                await browser.close()
            except Exception:
                pass
        print(f"[PixingWorker] 浏览器已清理 (task={task_id})")


def run_task_sync(task: dict):
    """同步包装器，供线程调用"""
    asyncio.run(_execute_task(task))


# ═══════════════════════════════════════════════════════
# 后台轮询循环（带指数退避）
# ═══════════════════════════════════════════════════════
def worker_loop():
    """后台线程：持续轮询任务队列"""
    print(f"[PixingWorker] 启动，API={API_BASE}, 间隔={POLL_INTERVAL}s")

    # 启动时检查 Service Token
    if not _ensure_service_token():
        print(f"[PixingWorker] ⚠ 警告: Service Token 未配置！")
        print(f"[PixingWorker]   请在 companion_config.json 中添加 'service_token' 字段，")
        print(f"[PixingWorker]   或设置环境变量 SERVICE_TOKEN。")
        print(f"[PixingWorker]   后端 /pixing-video/tasks/next 将返回 401，Worker 无法获取任务。")

    _status["running"] = True

    while _status["running"]:
        # 检查是否需要进入冷却期
        if _should_cooldown():
            print(f"[PixingWorker] 连续错误已达 {MAX_CONSECUTIVE_ERRORS} 次，进入 {COOLDOWN_AFTER_ERRORS}s 冷却期...")
            _status["last_error"] = f"连续错误 {MAX_CONSECUTIVE_ERRORS} 次，冷却中"
            time.sleep(COOLDOWN_AFTER_ERRORS)
            _status["consecutive_errors"] = 0
            _status["current_poll_interval"] = POLL_INTERVAL
            continue

        try:
            task = fetch_next_task()
            if task:
                _on_api_success()
                print(f"[PixingWorker] 发现待处理任务: {task['id']}")
                run_task_sync(task)
            else:
                # 无任务也可能是 API 返回 401（认证失败），检查 last_error
                if "401" in _status.get("last_error", ""):
                    _on_api_failure()
                else:
                    _on_api_success()  # 正常无任务
        except Exception as e:
            _on_api_failure()
            _status["last_error"] = str(e)[:200]
            print(f"[PixingWorker] 轮询异常: {e}")

        # 使用动态轮询间隔
        sleep_interval = _status["current_poll_interval"]
        time.sleep(sleep_interval)

    print("[PixingWorker] 已停止")


def start_worker():
    """启动后台 worker 线程"""
    if _status["running"]:
        return
    t = threading.Thread(target=worker_loop, daemon=True, name="PixingWorker")
    t.start()
    print("[PixingWorker] 线程已启动")


def _text_to_srt(text: str, chars_per_sec: int = 4, max_line: int = 20) -> str:
    """用输入文案自动生成 SRT 字幕（中文 ~4字/秒）"""
    import re
    # 按标点分句
    sentences = re.split(r'([。！？\n])', text)
    segments = []
    current = ""
    for part in sentences:
        current += part
        if part in '。！？\n' and len(current) > 2:
            segments.append(current.strip())
            current = ""
    if current.strip():
        segments.append(current.strip())

    srt = []
    start_sec = 0
    for i, seg in enumerate(segments):
        if not seg:
            continue
        duration = max(1, len(seg) / chars_per_sec)
        end_sec = start_sec + duration

        def fmt(sec):
            h = int(sec // 3600)
            m = int((sec % 3600) // 60)
            s = int(sec % 60)
            ms = int((sec - int(sec)) * 1000)
            return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

        srt.append(f"{i + 1}\n{fmt(start_sec)} --> {fmt(end_sec)}\n{seg}\n")
        start_sec = end_sec

    return "\n".join(srt)


def stop_worker():
    """停止 worker"""
    _status["running"] = False
    print("[PixingWorker] 正在停止...")
