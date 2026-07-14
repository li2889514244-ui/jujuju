"""
companion_login_worker.py — Scan-bind login worker using Playwright.
"""
import asyncio, base64, json, tempfile, uuid, time
from pathlib import Path
from queue import Empty

import companion_state as state
from companion_browser import _launch_browser_opts
from companion_collector import _record_scan_time
from companion_metrics import _parse_metric_num, _scrape_account_pages

PLATFORMS = state.PLATFORMS
_DEFAULT_QUICK_MAX_POSTS = state._DEFAULT_QUICK_MAX_POSTS


async def _get_page_text(page) -> str:
    try:
        return await page.locator("body").inner_text(timeout=10_000)
    except Exception:
        try:
            return await page.evaluate("() => document.body ? document.body.innerText : ''")
        except Exception:
            return ""


def _sanitize_text(value) -> str:
    return " ".join(str(value or "").replace("\u200b", "").split()).strip()


# ══════════════════════════════════════════════════════════════════
# Shared Playwright login worker (scan-bind)
# ══════════════════════════════════════════════════════════════════

def _make_login_worker(platform, info, queue, ctrl_queue, api_url, token, use_sse=False, session_id=None):
    # Create a scan-bind login worker.
    def login_worker():
        async def _run():
            context = None
            page = None
            browser = None
            scan_profile_dir = None
            try:
                from playwright.async_api import async_playwright
                from local_db import PROFILE_ROOT, add_account, get_or_create_profile_dir, update_status

                async with async_playwright() as pw:
                    import shutil as _shutil
                    scan_profile_dir = PROFILE_ROOT / f'_scan_{platform}_{session_id or uuid.uuid4().hex[:8]}'
                    try:
                        resolved_root = PROFILE_ROOT.resolve()
                        resolved_scan = scan_profile_dir.resolve()
                        if scan_profile_dir.exists() and resolved_root in resolved_scan.parents:
                            _shutil.rmtree(scan_profile_dir, ignore_errors=True)
                    except Exception as _e:
                        print(f'[WARN] {type(_e).__name__}: {_e}')
                    scan_profile_dir.mkdir(parents=True, exist_ok=True)
                    launch_kw = {
                        'user_data_dir': str(scan_profile_dir),
                        'headless': False,
                        'viewport': {'width': 1280, 'height': 800},
                        'locale': 'zh-CN',
                        'args': _launch_browser_opts(False, ['--lang=zh-CN'])['args'],
                    }
                    if state._BROWSER_PATH:
                        launch_kw['executable_path'] = state._BROWSER_PATH
                    elif state._BROWSER_CHANNEL:
                        launch_kw['channel'] = state._BROWSER_CHANNEL
                    context = await pw.chromium.launch_persistent_context(**launch_kw)
                    print(f"[Worker] scan browser opened platform={platform} profile={scan_profile_dir}", flush=True)
                    # 注入反检测脚本
                    try:
                        from stealth_patches import apply_stealth_to_context
                        await apply_stealth_to_context(context)
                    except ImportError:
                        pass
                    # Cookie 隔离不同平台登录
                    try:
                        await context.clear_cookies()
                    except Exception:
                        print('[Worker] clear_cookies failed, creating new context')
                        try: await context.close()
                        except Exception: pass
                        context = await pw.chromium.launch_persistent_context(**launch_kw)

                    page = context.pages[0] if context.pages else await context.new_page()
                    page.on('popup', lambda popup: asyncio.ensure_future(popup.close()))

                    if use_sse:
                        queue.put(json.dumps({'type':'browser','data':'浏览器已打开'}))

                    if info['key'] == 'WECHAT_VIDEO':
                        try:
                            await page.goto('https://channels.weixin.qq.com', wait_until='domcontentloaded', timeout=15000)
                            await page.evaluate('''async () => {
                                try { localStorage.clear(); } catch (e) {}
                                try { sessionStorage.clear(); } catch (e) {}
                                try {
                                    if (window.indexedDB && indexedDB.databases) {
                                        const dbs = await indexedDB.databases();
                                        await Promise.all((dbs || []).map(db => db && db.name ? new Promise(resolve => {
                                            const req = indexedDB.deleteDatabase(db.name);
                                            req.onsuccess = req.onerror = req.onblocked = () => resolve();
                                        }) : Promise.resolve()));
                                    }
                                } catch (e) {}
                                try {
                                    if (window.caches) {
                                        const names = await caches.keys();
                                        await Promise.all(names.map(name => caches.delete(name)));
                                    }
                                } catch (e) {}
                            }''')
                            await page.wait_for_timeout(500)
                        except Exception as e:
                            print(f'[Worker] WECHAT_VIDEO storage clear warning: {str(e)[:100]}')

                    print(f"[Worker] navigating platform={platform} url={info['url']}", flush=True)
                    await page.goto(info['url'], wait_until='domcontentloaded', timeout=30000)
                    print(f"[Worker] navigated platform={platform} url={page.url}", flush=True)
                    await page.wait_for_timeout(8000)
                    await page.wait_for_load_state("networkidle")
                    await page.wait_for_timeout(3000)

                    if use_sse:
                        try:
                            screenshot = await page.screenshot(type='png')
                            b64 = base64.b64encode(screenshot).decode()
                            queue.put(json.dumps({'type':'qr_code','data':f'data:image/png;base64,{b64}'}))
                        except Exception as _e:
                            print(f'[WARN] {type(_e).__name__}: {_e}')
                        queue.put(json.dumps({'type':'status','data':'请在 Chrome 窗口中完成扫码登录，然后回到此页面点"已完成登录"'}))

                    wechat_login_markers = (
                        '视频号ID', '数据中心', '内容管理', '视频管理', '视频数据',
                        '互动管理', '直播', '收入与服务', '带货助手',
                    )

                    for i in range(600):
                        await page.wait_for_timeout(500)
                        try:
                            msg = ctrl_queue.get_nowait()
                            if msg == 'EXTRACT_COOKIES':
                                print('[Worker] Received EXTRACT_COOKIES, extracting...')
                                break
                            if msg == 'CANCEL':
                                if use_sse:
                                    queue.put(json.dumps({'type':'error','data':'用户取消'}))
                                if page:
                                    try: await page.close()
                                    except Exception: pass
                                return
                        except Empty:
                            pass
                        if info['key'] == 'WECHAT_VIDEO' and i >= 8 and i % 4 == 0:
                            try:
                                probe_text = await _get_page_text(page)
                                marker_count = sum(1 for marker in wechat_login_markers if marker in probe_text)
                                if 'login.html' not in (page.url or '') and marker_count >= 2:
                                    print(f'[Worker] WECHAT_VIDEO login auto-detected: url={page.url} markers={marker_count}', flush=True)
                                    break
                            except Exception as _e:
                                print(f'[WARN] {type(_e).__name__}: {_e}')
                    else:
                        if use_sse:
                            queue.put(json.dumps({"type":"error","data":"操作超时，请重试"}))
                        if page:
                            try: await page.close()
                            except Exception: pass
                        return
                    if use_sse:
                        queue.put(json.dumps({'type':'status','data':'正在提取信息...'}))

                    # 提取页面信息，不把 Cookie 明文展示到界面。
                    if info['key'] == 'WECHAT_VIDEO':
                        try:
                            await page.goto('https://channels.weixin.qq.com/platform', wait_until='domcontentloaded', timeout=30000)
                            await page.wait_for_timeout(6000)
                            page_text_check = await _get_page_text(page)
                            marker_count = sum(1 for marker in wechat_login_markers if marker in page_text_check)
                            if 'login.html' in page.url or marker_count < 2:
                                err_msg = '未检测到有效的视频号后台登录态，请等后台首页完全加载后再点“已完成登录”'
                                print(f'[Worker] WECHAT_VIDEO login validation failed: url={page.url} markers={marker_count}')
                                if use_sse:
                                    queue.put(json.dumps({'type':'error','data':err_msg}))
                                if session_id:
                                    state.scan_status[session_id] = 'error'
                                    state.scan_errors[session_id] = err_msg
                                if page:
                                    try: await page.close()
                                    except Exception: pass
                                return
                        except Exception as e:
                            err_msg = f'验证视频号登录失败：{str(e)[:80]}'
                            print(f'[Worker] WECHAT_VIDEO login validation error: {str(e)[:120]}')
                            if use_sse:
                                queue.put(json.dumps({'type':'error','data':err_msg}))
                            if session_id:
                                state.scan_status[session_id] = 'error'
                                state.scan_errors[session_id] = err_msg
                            if page:
                                try: await page.close()
                                except Exception: pass
                            return

                    cookies = await context.cookies()
                    page_text = await _get_page_text(page)
                    try:
                        with open(Path(tempfile.gettempdir()) / 'pixingyun_page.txt', 'w', encoding='utf-8') as f:
                            f.write(page_text[:5000])
                    except Exception: pass

                    if not cookies:
                        if use_sse:
                            queue.put(json.dumps({'type':'error','data':'未获取到 Cookie，请在 Chrome 窗口中确认已登录'}))
                        if page:
                            try: await page.close()
                            except Exception: pass
                        return

                    # Scrape real ID and nickname from the logged-in page
                    import re, requests
                    page_text = await page.evaluate('() => document.body.innerText')
                    try:
                        with open(Path(tempfile.gettempdir()) / 'pixingyun_page.txt', 'w', encoding='utf-8') as f:
                            f.write(page_text[:3000])
                    except Exception: pass
                    real_id = ''
                    nickname = None
                    m = re.search(r'视频号ID[:\s]*(\S+)', page_text)
                    if m:
                        real_id = m.group(1).strip()
                    lines = page_text.split('\n')
                    for i, line in enumerate(lines):
                        if '视频号ID' in line and i >= 2:
                            for j in range(i-1, max(i-4, -1), -1):
                                c = _sanitize_text(lines[j].strip())
                                if c and len(c) > 1 and len(c) < 30 and not c.isdigit() and c not in ('视频号', '视频号助手', '微信'):
                                    nickname = c
                                    break
                            break
                    # 抖音号
                    if not real_id:
                        m = re.search(r'抖音号[:\s]*(\S+)', page_text)
                        if m:
                            real_id = m.group(1).strip()
                            if not nickname:
                                # 抖音号上方通常是昵称。
                                for i, line in enumerate(lines):
                                    if '抖音号' in line and i >= 1:
                                        for j in range(i-1, max(i-3, -1), -1):
                                            c = _sanitize_text(lines[j].strip())
                                            if c and 2 < len(c) < 30 and not c.isdigit():
                                                nickname = c
                                                break
                                        break
                    # 快手号
                    if not real_id:
                        m = re.search(r'快手号[:\s]*(\S+)', page_text)
                        if m:
                            real_id = m.group(1).strip()
                    # 小红书号
                    if not real_id:
                        m = re.search(r'小红书号[:\s]*(\S+)', page_text)
                        if m:
                            real_id = m.group(1).strip()

                    if not nickname and real_id:
                        nickname = real_id
                    if not nickname:
                        nickname = _sanitize_text(info['name'])

                    platform_uid = real_id if real_id else f"{platform}_{int(time.time())}"
                    platform_key = info['key']  # DOUYIN / WECHAT_VIDEO etc.

                    # 后端注册尽力而为，失败不阻断本地流程。
                    import requests as req
                    existing_id = None
                    data = {'code': -1, 'message': 'Backend unavailable'}  # default: backend failed
                    try:
                        check_resp = req.get(
                            f"{api_url.rstrip('/')}/accounts",
                            headers={'Authorization': f'Bearer {token}'},
                            timeout=10,
                        )
                        if check_resp.status_code == 200:
                            for acc in ((check_resp.json().get('data') or {}).get('accounts') or []):
                                if acc.get('platformUserId') == platform_uid or (acc.get('nickname') == nickname and acc.get('platform') == platform_key):
                                    existing_id = acc.get('id')
                                    break
                    except Exception as _e:
                        print(f'[WARN] {type(_e).__name__}: {_e}')  # Backend unreachable; proceed with local-only

                    account_id = existing_id
                    if existing_id:
                        try:
                            resp = req.put(
                                f"{api_url.rstrip('/')}/accounts/{existing_id}",
                                json={'nickname': nickname, 'cookies': ''},
                                headers={'Authorization': f'Bearer {token}','Content-Type': 'application/json'},
                                timeout=15,
                            )
                            if resp.status_code == 200:
                                account_id = (resp.json().get('data') or {}).get('id') or existing_id
                        except Exception as _e:
                            print(f'[WARN] {type(_e).__name__}: {_e}')
                    else:
                        try:
                            resp = req.post(
                                f"{api_url.rstrip('/')}/accounts",
                                json={'platform': platform_key, 'platformUserId': platform_uid,
                                      'nickname': nickname, 'cookies': ''},
                                headers={'Authorization': f'Bearer {token}','Content-Type': 'application/json'},
                                timeout=15,
                            )
                            if resp.status_code in (200, 201):
                                account_id = (resp.json().get('data') or {}).get('id')
                        except Exception as _e:
                            print(f'[WARN] {type(_e).__name__}: {_e}')

                    # 上传 Cookie 到服务器，让后端定时同步也能使用。
                    if account_id and not account_id.startswith('local_') and cookies:
                        try:
                            cookie_list = [
                                {'name': c['name'], 'value': c['value'], 'domain': c.get('domain', ''),
                                 'path': c.get('path', '/'), 'expires': c.get('expires', -1),
                                 'httpOnly': c.get('httpOnly', False), 'secure': c.get('secure', False),
                                 'sameSite': c.get('sameSite', 'Lax')}
                                for c in cookies
                            ]
                            upload_resp = req.post(
                                f"{api_url.rstrip('/')}/accounts/{account_id}/cookies",
                                json={'cookies': cookie_list},
                                headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                                timeout=15,
                            )
                            if upload_resp.status_code == 200:
                                print(f'[Worker] Cookie uploaded to server: {len(cookie_list)} cookies for account {account_id}')
                            else:
                                print(f'[Worker] Cookie upload failed: {upload_resp.status_code} {upload_resp.text[:200]}')
                        except Exception as e:
                            print(f'[Worker] Cookie upload error (non-fatal): {e}')

                    # 存入本地 DB 并保存 Profile 状态。
                    #  即使后端注册失败，本地也要保存（矩阵管理是离线优先架构）
                    if not account_id:
                        # Check local DB for existing account with same platform_uid
                        from local_db import get_accounts_by_platform
                        local_accounts = get_accounts_by_platform(platform_key)
                        for la in local_accounts:
                            if la.get('platform_uid') == platform_uid:
                                account_id = la['id']
                                print(f'[Worker] Reusing existing local account {account_id} for uid {platform_uid}')
                                break
                        if not account_id:
                            import uuid as _uuid
                            account_id = f'local_{_uuid.uuid4().hex[:16]}'
                            print(f'[Worker] Backend unreachable, using local ID: {account_id}')
                    
                    # Always save locally (regardless of backend status)
                    profile_dir = get_or_create_profile_dir(account_id, platform_key)
                    add_account(account_id, platform_key, profile_dir.name,
                            platform_uid=platform_uid, nickname=nickname)
                    try:
                        update_status(account_id, 'active')
                    except Exception as _e:
                        print(f'[WARN] {type(_e).__name__}: {_e}')
                    # 保存 storage_state 到 Profile 目录，供采集流程使用。
                    target_profile = str(profile_dir)
                    Path(target_profile).mkdir(parents=True, exist_ok=True)
                    state_path = Path(target_profile) / 'state.json'
                    await context.storage_state(path=str(state_path))
                    print(f'[Worker] Storage state saved: {state_path}')

                    # Save cookie freshness info alongside state.json
                    try:
                        cookie_info = {
                            'last_cookie_refresh': time.strftime('%Y-%m-%d %H:%M:%S'),
                            'cookie_age_seconds': 0,
                        }
                        cookie_info_path = Path(target_profile) / 'cookie_info.json'
                        cookie_info_path.write_text(json.dumps(cookie_info, ensure_ascii=False))
                    except Exception as e:
                        print(f'[Worker] Cookie info save warning: {e}')

                    # Cookie 已在 state.json 中持久化，无需额外固化步骤。
                    # state.json 可供 _scrape_one_account 通过 storage_state 加载

                    # 立即采集初始数据
                    metrics = {}
                    # 判断是否已在仪表盘：有数据内容即可，不依赖 URL。
                    has_dashboard = any(kw in page_text[:2000]
                        for kw in ['关注者', '粉丝', '数据中心', 'dashboard', '粉丝数据'])
                    if has_dashboard:
                        try:
                            m_f = re.search(r'关注者\s*(\d[\d,.]*)', page_text)
                            if m_f: metrics['followers'] = _parse_metric_num(m_f.group(1))
                            m_f2 = re.search(r'粉丝\s*(?:\n\s*)?([\d,.]+[万wW]?)', page_text[:3000])
                            if m_f2 and 'followers' not in metrics:
                                metrics['followers'] = _parse_metric_num(m_f2.group(1))

                            yd_start = page_text.find('昨日数据')
                            if yd_start > 0:
                                yd = page_text[yd_start:yd_start+500]
                                for label, key in [('净增关注','newFollowers'),('新增播放','newViews'),('新增评论','newComments'),('新增分享','newShares')]:
                                    m = re.search(rf'{label}\s*([\d,.]+[万wW]?)', yd)
                                    if m: metrics[key] = _parse_metric_num(m.group(1))
                                # 新增点赞，排除已被上述前缀匹配的行。
                                m_like = re.search(r'新增(?!播放|评论|分享)\s*([\d,.]+[万wW]?)', yd)
                                if m_like: metrics['newLikes'] = _parse_metric_num(m_like.group(1))

                            # Deep scrape
                            extra = {}
                            try:
                                extra = await _scrape_account_pages(
                                    context,
                                    platform_key,
                                    max_posts=_DEFAULT_QUICK_MAX_POSTS,
                                    sleep_sec=0.35,
                                )
                            except Exception as e:
                                print(f'[DC] deep scrape error {platform_key}: {e}')
                            for k, v in extra.get('metrics', {}).items():
                                prefer_video_period = platform_key == 'WECHAT_VIDEO' and k in {
                                    '_periodMetrics',
                                    'newViews', 'newLikes', 'newComments', 'newShares', 'newFollowers',
                                    'views', 'likes', 'comments', 'shares',
                                }
                                if v is not None and (prefer_video_period or k not in metrics or metrics.get(k, 0) == 0):
                                    metrics[k] = v

                            # Save deep scrape results to local DB immediately
                            extra_metrics = extra.get('metrics', {})
                            if extra_metrics or extra.get('video_stats'):
                                try:
                                    from local_db import update_metrics, save_contents, save_history_snapshot, update_collection_time
                                    update_metrics(account_id, extra_metrics)
                                    vstats = extra.get('video_stats') or []
                                    if vstats:
                                        save_contents(account_id, vstats)
                                    save_history_snapshot(account_id)
                                    update_collection_time(account_id)
                                except Exception as e:
                                    print(f'[DC] Local DB save error {account_id}: {e}')

                            # Extract historical data before reporting
                            history = metrics.pop('_history', []) if isinstance(metrics, dict) else []
                            can_report_initial = bool(
                                api_url and token and account_id
                                and not str(account_id).startswith('local_')
                            )

                            if can_report_initial and metrics:
                                req.post(f"{api_url.rstrip('/')}/platforms/report-metrics",
                                    json={'accountId': account_id, 'metrics': metrics},
                                    headers={'Authorization': f'Bearer {token}'}, timeout=30)

                            # Report historical data (7-day / 30-day)
                            if can_report_initial and history:
                                for hist_entry in history:
                                    hist_date = hist_entry.pop('date', None)
                                    if not hist_date:
                                        continue
                                    try:
                                        req.post(
                                            f'{api_url}/platforms/report-metrics',
                                            json={'accountId': account_id, 'metrics': hist_entry, 'date': hist_date},
                                            headers={'Authorization': f'Bearer {token}'}, timeout=30,
                                        )
                                    except Exception as _e:
                                        print(f'[WARN] {type(_e).__name__}: {_e}')

                            vstats = extra.get('video_stats') or []
                            if can_report_initial and vstats and account_id:
                                try:
                                    req.post(
                                        f'{api_url}/platforms/report-post-stats',
                                        json={'accountId': account_id, 'posts': vstats},
                                        headers={'Authorization': f'Bearer {token}'}, timeout=30,
                                    )
                                except Exception as _e:
                                    print(f'[WARN] {type(_e).__name__}: {_e}')

                            if use_sse:
                                f_count = metrics.get('followers', '?')
                                v_count = metrics.get('views', '?')
                                p_count = len(vstats)
                                queue.put(json.dumps({'type':'status','data':f'数据已采集 粉丝{f_count} 播放{v_count} 视频{p_count}条'}))
                        except Exception as e:
                            if use_sse:
                                queue.put(json.dumps({'type':'status','data':f'数据采集失败: {str(e)[:80]}'}))

                    if platform_key == 'WECHAT_VIDEO' and scan_profile_dir:
                        try:
                            source_profile = Path(scan_profile_dir).resolve()
                            target_profile_path = Path(target_profile).resolve()
                            profile_root = PROFILE_ROOT.resolve()
                            if profile_root in source_profile.parents and profile_root in target_profile_path.parents:
                                source_state = source_profile / 'state.json'
                                await context.storage_state(path=str(source_state))

                                # CRITICAL: storage_state() misses session cookies (compass_token etc.)
                                # Use context.cookies() to capture ALL cookies including session ones,
                                # then merge into state.json so the scraper can restore them.
                                try:
                                    all_cookies = await context.cookies()
                                    state_data = json.loads(source_state.read_text('utf-8'))
                                    existing_names = {(c.get('name'), c.get('domain'), c.get('path')) for c in state_data.get('cookies', [])}
                                    merged = list(state_data.get('cookies', []))
                                    for c in all_cookies:
                                        key = (c.get('name'), c.get('domain'), c.get('path'))
                                        if key not in existing_names:
                                            merged.append(c)
                                        else:
                                            # Replace with the fresher version
                                            merged = [c if (m.get('name'), m.get('domain'), m.get('path')) == key else m for m in merged]
                                            existing_names.discard(key)
                                    state_data['cookies'] = merged
                                    source_state.write_text(json.dumps(state_data, ensure_ascii=False), encoding='utf-8')
                                    print(f'[Worker] WECHAT_VIDEO: merged {len(all_cookies)} cookies into state.json (total: {len(merged)})')
                                except Exception as ce:
                                    print(f'[Worker] WECHAT_VIDEO: cookie merge warning: {ce}')

                                source_cookie_info = source_profile / 'cookie_info.json'
                                source_cookie_info.write_text(json.dumps({
                                    'last_cookie_refresh': time.strftime('%Y-%m-%d %H:%M:%S'),
                                    'cookie_age_seconds': 0,
                                    'profile_persisted': True,
                                }, ensure_ascii=False), encoding='utf-8')
                                if page:
                                    try: await page.close()
                                    except Exception: pass
                                    page = None
                                if context:
                                    try: await context.close()
                                    except Exception: pass
                                    context = None
                                import shutil as _shutil
                                if target_profile_path.exists():
                                    _shutil.rmtree(target_profile_path, ignore_errors=True)
                                _shutil.copytree(source_profile, target_profile_path, dirs_exist_ok=True)
                                print(f'[Worker] WECHAT_VIDEO full profile persisted: {target_profile_path}')
                        except Exception as e:
                            print(f'[Worker] WECHAT_VIDEO full profile persist warning: {str(e)[:120]}')

                    upload_ok = data.get('code') == 0 or bool(account_id)
                    upload_err = f"上传失败: {data.get('message','未知错误')}"
                    if upload_ok:
                        _record_scan_time(platform)
                    if use_sse:
                        if upload_ok:
                            queue.put(json.dumps({'type':'success','data':{'platform':platform,'cookies_count':len(cookies),'account_id':account_id}}))
                        else:
                            queue.put(json.dumps({'type':'error','data':upload_err}))

                    # 只关页面，保留上下文直到持久化完成。
                    if page:
                        try: await page.close()
                        except Exception: pass

                    if session_id:
                        state.scan_status[session_id] = 'done' if upload_ok else 'error'
                        if upload_ok:
                            state.scan_errors.pop(session_id, None)
                        else:
                            state.scan_errors[session_id] = upload_err
                        if session_id in state.active_sessions: del state.active_sessions[session_id]
            except Exception as e:
                import traceback
                err_full = traceback.format_exc()
                try:
                    import tempfile
                    with open(Path(tempfile.gettempdir()) / 'pixingyun_error.log', 'w', encoding='utf-8') as f:
                        f.write(err_full)
                except Exception: pass
                if session_id:
                    state.scan_status[session_id] = 'error'
                    state.scan_errors[session_id] = f'浏览器异常：{str(e)[:200]}'
                    if session_id in state.active_sessions: del state.active_sessions[session_id]
                if use_sse:
                    queue.put(json.dumps({'type':'error','data':f'浏览器异常：{str(e)[:200]}'}))

        asyncio.run(_run())
    return login_worker

