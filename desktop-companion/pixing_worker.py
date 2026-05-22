"""
披星云数字人视频 Worker — 轮询任务 → 自动合成 → 回传结果
作为 companion_app.py 的后台线程运行
"""
import asyncio, json, time, threading, requests, os
from pathlib import Path

# ═══════════════════════════════════════════════════════
# 配置 — 修改这里
# ═══════════════════════════════════════════════════════
API_BASE = "https://ddddkiii.com/api/v1"
PIXING_EDU_URL = "https://www.pixingjiaoyu.com.cn/#/login?redirectUrl=%2Fworks"
POLL_INTERVAL = 15  # 轮询间隔（秒）
DOWNLOAD_DIR = Path.home() / "Downloads" / "披星云视频"

_status = {"running": False, "current_task": None, "last_error": "", "completed": 0}

def get_status():
    return dict(_status)

# ═══════════════════════════════════════════════════════
# 核心：拉取任务 + 更新状态
# ═══════════════════════════════════════════════════════
def _api_get(path):
    try:
        r = requests.get(f"{API_BASE}{path}", timeout=15)
        return r.json() if r.status_code == 200 else None
    except Exception as e:
        _status["last_error"] = f"API GET {path}: {e}"
        return None

def _api_patch(path, data):
    try:
        r = requests.patch(f"{API_BASE}{path}", json=data, timeout=15)
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

    try:
        async with async_playwright() as pw:
            browser_path = _find_browser()
            launch_opts = {
                "headless": False,  # 有头模式，方便调试
                "args": ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--lang=zh-CN"],
            }
            if browser_path:
                launch_opts["executable_path"] = browser_path

            browser = await pw.chromium.launch(**launch_opts)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                locale="zh-CN",
            )
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

            # ── 第7步：等待合成完成 + 获取视频 ──
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

            # ── 第8步：字幕 ──
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

            await browser.close()
            _status["completed"] += 1
            _status["current_task"] = None
            print(f"[PixingWorker] 任务 {task_id} 完成")

    except Exception as e:
        error_msg = str(e)[:500]
        print(f"[PixingWorker] 任务 {task_id} 失败: {error_msg}")
        update_task(task_id, status="failed", error=error_msg)
        _status["last_error"] = error_msg
        _status["current_task"] = None


def run_task_sync(task: dict):
    """同步包装器，供线程调用"""
    asyncio.run(_execute_task(task))


# ═══════════════════════════════════════════════════════
# 后台轮询循环
# ═══════════════════════════════════════════════════════
def worker_loop():
    """后台线程：持续轮询任务队列"""
    print(f"[PixingWorker] 启动，API={API_BASE}, 间隔={POLL_INTERVAL}s")
    _status["running"] = True

    while _status["running"]:
        try:
            task = fetch_next_task()
            if task:
                print(f"[PixingWorker] 发现待处理任务: {task['id']}")
                run_task_sync(task)
            else:
                pass  # 无任务，静默等待
        except Exception as e:
            _status["last_error"] = str(e)[:200]
            print(f"[PixingWorker] 轮询异常: {e}")

        time.sleep(POLL_INTERVAL)

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
