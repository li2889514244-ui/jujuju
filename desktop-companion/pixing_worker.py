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

            # ── 第2步：选老师 ──
            print(f"[PixingWorker] 选择老师: {teacher}")
            # TODO: 根据实际披星教育页面结构调整选择器
            # 示例：点击老师选择按钮，输入老师名字，点击确认
            try:
                # 尝试找到包含老师名字的元素并点击
                await page.click(f"text={teacher}", timeout=5000)
            except:
                # 备选：通过搜索框输入
                search_input = await page.query_selector('input[placeholder*="老师"], input[placeholder*="选择"]')
                if search_input:
                    await search_input.fill(teacher)
                    await page.wait_for_timeout(1000)
                    await page.click(f"text={teacher}", timeout=5000)
            await page.wait_for_timeout(2000)

            # ── 第3步：输入文案 ──
            print(f"[PixingWorker] 输入文案")
            text_input = await page.query_selector('textarea, [contenteditable="true"]')
            if text_input:
                await text_input.click()
                await text_input.fill(text)
            await page.wait_for_timeout(1000)

            # ── 第4步：合成视频 ──
            print(f"[PixingWorker] 触发视频合成")
            # 找"生成"/"合成"/"开始"按钮
            for btn_text in ["生成视频", "合成", "开始生成", "创建视频", "提交"]:
                try:
                    await page.click(f"text={btn_text}", timeout=3000)
                    print(f"[PixingWorker] 点击了 '{btn_text}'")
                    break
                except:
                    continue
            await page.wait_for_timeout(5000)

            # ── 第5步：等待合成完成 + 下载 ──
            print(f"[PixingWorker] 等待视频合成...")
            DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
            # 等最多10分钟
            for i in range(120):
                await page.wait_for_timeout(5000)
                # 检查是否有下载按钮或完成提示
                try:
                    download_btn = await page.query_selector('a[download], [class*="download"], text=下载')
                    if download_btn:
                        print(f"[PixingWorker] 检测到下载按钮")
                        # 获取视频 URL
                        video_url = await download_btn.get_attribute("href") or ""
                        if video_url:
                            update_task(task_id, status="completed", videoUrl=video_url)
                            print(f"[PixingWorker] 视频链接: {video_url}")
                        break
                except:
                    pass
                if i % 12 == 0:
                    print(f"[PixingWorker] 仍在等待... ({i * 5}s)")

            # ── 第6步：字幕处理 ──
            # 尝试获取/生成字幕
            srt_content = None
            try:
                srt_elem = await page.query_selector('[class*="subtitle"], [class*="srt"], pre')
                if srt_elem:
                    srt_content = await srt_elem.inner_text()
            except:
                pass

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


def stop_worker():
    """停止 worker"""
    _status["running"] = False
    print("[PixingWorker] 正在停止...")
