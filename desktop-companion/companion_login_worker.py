"""
companion_login_worker.py — Scan-bind login worker using Playwright.
"""
import asyncio, base64, json, tempfile, uuid, time, re
from pathlib import Path
from queue import Empty

import companion_state as state
from companion_encoding import read_text_file, write_text_file
from companion_browser import _launch_browser_opts
from companion_collector import (
    _is_local_or_missing_uid,
    _is_unsafe_nickname_fallback,
    _record_scan_time,
    report_post_stats_in_batches,
)
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


def _browser_launch_label(launch_kw: dict) -> str:
    if launch_kw.get('executable_path'):
        return str(launch_kw.get('executable_path'))
    if launch_kw.get('channel'):
        return f"channel:{launch_kw.get('channel')}"
    return 'playwright-default'


def _browser_launch_error_message(errors: list[str]) -> str:
    detail = '；'.join(errors[-3:]) if errors else ''
    return (
        '无法启动扫码浏览器。请确认电脑已安装 Microsoft Edge 或 Google Chrome，'
        '然后重启披星云伴侣再试。'
        f' 最近错误：{detail[:260]}' if detail else
        '无法启动扫码浏览器。请确认电脑已安装 Microsoft Edge 或 Google Chrome，'
        '然后重启披星云伴侣再试。'
    )


def _douyin_manual_login_args() -> list[str]:
    return [
        '--lang=zh-CN',
        '--no-first-run',
        '--no-default-browser-check',
    ]


def _is_douyin_login_or_challenge(url: str, text: str = '') -> bool:
    url = (url or '').lower()
    text = _sanitize_text(text)
    challenge_markers = (
        'captcha',
        'verify',
        'challenge',
        '\u9a8c\u8bc1\u7801',
        '\u5b89\u5168\u9a8c\u8bc1',
        '\u62d6\u52a8\u6ed1\u5757',
        '\u8bf7\u5b8c\u6210\u9a8c\u8bc1',
    )
    if any(part in url for part in ('/login', '/qrcode', '/passport', 'captcha', 'verify')):
        return True
    return any(marker in text for marker in challenge_markers)


def _build_scan_browser_launches(scan_profile_dir, browser_opts: dict, login_fp: dict | None, platform_key: str) -> list[dict]:
    base = {
        'user_data_dir': str(scan_profile_dir),
        'headless': False,
        'viewport': {'width': 1280, 'height': 800},
        'locale': 'zh-CN',
        'args': _douyin_manual_login_args() if platform_key == 'DOUYIN' else browser_opts.get('args', []),
    }
    if browser_opts.get('ignore_default_args') is not None:
        base['ignore_default_args'] = browser_opts.get('ignore_default_args')
    if login_fp and login_fp.get('user_agent') and platform_key not in ('WECHAT_VIDEO', 'DOUYIN'):
        base['user_agent'] = login_fp['user_agent']

    candidates: list[tuple[str | None, str | None]] = []
    if platform_key == 'DOUYIN':
        try:
            from browser_manager import find_local_chromium, find_playwright_chromium, find_system_browser_candidates
            for path in find_system_browser_candidates():
                candidates.append((path, None))
            for path in (find_local_chromium(), find_playwright_chromium()):
                if path:
                    candidates.append((path, None))
        except Exception as exc:
            print(f'[Worker] Douyin browser candidate discovery warning: {exc}', flush=True)
        candidates.extend([(None, 'msedge'), (None, 'chrome')])
    elif browser_opts.get('executable_path') or state._BROWSER_PATH:
        candidates.append((browser_opts.get('executable_path') or state._BROWSER_PATH, None))
    elif browser_opts.get('channel') or state._BROWSER_CHANNEL:
        candidates.append((None, browser_opts.get('channel') or state._BROWSER_CHANNEL))

    if platform_key != 'DOUYIN':
        try:
            from browser_manager import find_local_chromium, find_playwright_chromium, find_system_browser_candidates
            for path in (find_playwright_chromium(), find_local_chromium()):
                if path:
                    candidates.append((path, None))
            for path in find_system_browser_candidates():
                candidates.append((path, None))
        except Exception as exc:
            print(f'[Worker] Browser candidate discovery warning: {exc}', flush=True)

    candidates.extend([(None, 'msedge'), (None, 'chrome'), (None, None)])

    launches: list[dict] = []
    seen = set()
    for path, channel in candidates:
        key = ('path', str(path).lower()) if path else ('channel', str(channel or '').lower())
        if key in seen:
            continue
        seen.add(key)
        launch_kw = dict(base)
        if path:
            launch_kw['executable_path'] = path
        elif channel:
            launch_kw['channel'] = channel
        launches.append(launch_kw)
    return launches


async def _launch_scan_browser_context(pw, scan_profile_dir, browser_opts: dict, login_fp: dict | None, platform_key: str):
    launch_errors: list[str] = []
    launches = _build_scan_browser_launches(scan_profile_dir, browser_opts, login_fp, platform_key)
    # P0 安全修复：launch 前快照，成功后只登记新出现的浏览器进程
    from process_registry import browser_snapshot, register_new_browser_tree
    pre_snapshot = browser_snapshot()
    for launch_kw in launches:
        label = _browser_launch_label(launch_kw)
        try:
            context = await pw.chromium.launch_persistent_context(**launch_kw)
            register_new_browser_tree(
                scan_profile_dir, pre_snapshot, process_type='scan_login_browser'
            )
            print(f'[Worker] Scan browser launch succeeded via {label}', flush=True)
            return context, launch_kw
        except Exception as exc:
            err = f'{label}: {type(exc).__name__}: {str(exc)[:160]}'
            launch_errors.append(err)
            print(f'[Worker] Scan browser launch failed via {err}', flush=True)
    raise RuntimeError(_browser_launch_error_message(launch_errors))


async def _safe_close_context(context, profile_dir=None, label: str = "scan", timeout_ms: int = 8_000) -> None:
    if not context:
        return
    try:
        await asyncio.wait_for(context.close(), timeout=max(1, timeout_ms) / 1000)
        return
    except asyncio.TimeoutError:
        print(f"[Worker] context.close timed out for {label}; cleaning profile browsers", flush=True)
    except Exception as exc:
        print(f"[Worker] context.close warning for {label}: {str(exc)[:120]}", flush=True)
    if profile_dir:
        try:
            from browser_manager import cleanup_browser_processes_for_profile
            cleanup_browser_processes_for_profile(profile_dir)
        except Exception as cleanup_err:
            print(f"[Worker] browser cleanup warning for {label}: {str(cleanup_err)[:120]}", flush=True)


def _looks_like_wechat_uid(value) -> bool:
    value = _sanitize_text(value)
    if not value:
        return False
    return bool(
        re.match(r'^sph[A-Za-z0-9_-]{8,}$', value)
        or re.match(r'^v2_[A-Za-z0-9_@.\-]{8,}@finder$', value)
    )


def _looks_like_wechat_noise(value) -> bool:
    value = _sanitize_text(value)
    if not value:
        return True
    noise_values = {
        '申请认证',
        '视频号',
        '视频号助手',
        '微信',
        '内容管理',
        '数据中心',
        '关注者',
        '昨日数据',
        # 页面 UI 模块/导航标题，绝不能被当作昵称
        '最近视频',
        '最近作品',
        '视频数据',
        '数据概览',
        '内容数据',
        '作品数据',
        '今日数据',
        '数据趋势',
        '热门视频',
        '视频列表',
        '作品列表',
        '全部视频',
        '全部作品',
        '视频明细',
        '粉丝数据',
        '观众数据',
        '直播数据',
        '商品数据',
        '订单数据',
        '账号概览',
        '内容洞察',
        '互动管理',
        '图文数据',
        '视频动态',
        '视频号动态',
        '查看全部',
        '更多',
    }
    if value in noise_values:
        return True
    return bool(re.match(r'^(视频|用户)\d+$', value))


def _looks_like_legal_entity_name(value) -> bool:
    value = _sanitize_text(value)
    legal_markers = (
        '有限公司',
        '有限责任公司',
        '股份有限公司',
        '集团有限公司',
        '文化有限公司',
        '科技有限公司',
    )
    return any(marker in value for marker in legal_markers)


def _is_wechat_placeholder_nickname(value) -> bool:
    value = _sanitize_text(value)
    return value in {'\u89c6\u9891\u53f7', '\u89c6\u9891\u53f7\u52a9\u624b'} or _looks_like_wechat_uid(value)


def _is_safe_existing_wechat_nickname(value) -> bool:
    value = _sanitize_text(value)
    return bool(
        value
        and not _is_wechat_placeholder_nickname(value)
        and not _looks_like_wechat_noise(value)
        and not _looks_like_legal_entity_name(value)
    )


async def _get_local_storage_items(page) -> dict:
    try:
        items = await page.evaluate(
            r'''() => {
                const out = {};
                try {
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        out[key] = localStorage.getItem(key) || '';
                    }
                } catch (e) {}
                return out;
            }'''
        )
        return items if isinstance(items, dict) else {}
    except Exception:
        return {}


async def _extract_wechat_video_identity(page) -> dict:
    """Extract WeChat Video uid/nickname/avatar without relying on source-file Chinese literals."""
    identity = {'platform_uid': '', 'nickname': '', 'avatar': ''}
    try:
        raw = await page.evaluate(
            r'''() => {
                const out = { platform_uid: '', nickname: '', avatar: '' };
                const wujie = document.querySelector('wujie-app');
                const root = (wujie && wujie.shadowRoot) ? wujie.shadowRoot : document;
                const body = root.querySelector('body') || document.body;
                const text = body ? (body.innerText || '') : '';
                const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
                const uidLabel = '\u89c6\u9891\u53f7ID';
                const noise = new Set([
                    '\u89c6\u9891\u53f7',
                    '\u89c6\u9891\u53f7\u52a9\u624b',
                    '\u5fae\u4fe1',
                    '\u9996\u9875',
                    '\u5185\u5bb9\u7ba1\u7406',
                    '\u4e92\u52a8\u7ba1\u7406',
                    '\u6570\u636e\u4e2d\u5fc3',
                    '\u89c6\u9891\u6570\u636e',
                    '\u5173\u6ce8\u8005\u6570\u636e',
                    '\u56fe\u6587\u6570\u636e',
                    '\u6628\u65e5\u6570\u636e',
                    '\u6700\u8fd1\u89c6\u9891',
                    '\u6700\u8fd1\u4f5c\u54c1',
                    '\u6570\u636e\u6982\u89c8',
                    '\u5185\u5bb9\u6570\u636e',
                    '\u4f5c\u54c1\u6570\u636e',
                    '\u4eca\u65e5\u6570\u636e',
                    '\u6570\u636e\u8d8b\u52bf',
                    '\u70ed\u95e8\u89c6\u9891',
                    '\u89c6\u9891\u5217\u8868',
                    '\u4f5c\u54c1\u5217\u8868',
                    '\u5168\u90e8\u89c6\u9891',
                    '\u5168\u90e8\u4f5c\u54c1',
                    '\u89c6\u9891\u660e\u7ec6',
                    '\u7c89\u4e1d\u6570\u636e',
                    '\u89c2\u4f17\u6570\u636e',
                    '\u76f4\u64ad\u6570\u636e',
                    '\u5546\u54c1\u6570\u636e',
                    '\u8ba2\u5355\u6570\u636e',
                    '\u8d26\u53f7\u6982\u89c8',
                    '\u5185\u5bb9\u6d1e\u5bdf',
                    '\u4e92\u52a8\u7ba1\u7406',
                    '\u56fe\u6587\u6570\u636e',
                    '\u89c6\u9891\u52a8\u6001',
                    '\u89c6\u9891\u53f7\u52a8\u6001',
                    '\u67e5\u770b\u5168\u90e8',
                    '\u66f4\u591a',
                ]);
                const isUid = (value) => /^sph[A-Za-z0-9_-]{8,}$/.test(value || '');
                const clean = (value) => String(value || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
                const isGoodName = (value) => {
                    const v = clean(value);
                    if (v.length < 2 || v.length > 40) return false;
                    if (noise.has(v)) return false;
                    if (isUid(v)) return false;
                    if (/^\d+$/.test(v)) return false;
                    if (v.includes(uidLabel)) return false;
                    if (/^(http|https):\/\//i.test(v)) return false;
                    if (/(\u5173\u6ce8\u8005|\u89c6\u9891|\u6570\u636e|\u64ad\u653e|\u70b9\u8d5e|\u8bc4\u8bba|\u5206\u4eab)\s*\d/.test(v)) return false;
                    return true;
                };

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (!line.includes(uidLabel)) continue;
                    const uidMatch = line.match(/(?:\u89c6\u9891\u53f7ID)[:\uff1a\s]*([A-Za-z0-9_@.\-]+)/);
                    if (uidMatch) out.platform_uid = uidMatch[1];
                    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
                        if (isGoodName(lines[j])) {
                            out.nickname = clean(lines[j]);
                            break;
                        }
                    }
                    break;
                }

                if (!out.nickname) {
                    const selectors = [
                        '[class*="account-name"]',
                        '[class*="nickname"]',
                        '[class*="profile-name"]',
                        '[class*="user-name"]',
                        '[class*="creator-name"]',
                        'h1',
                    ];
                    for (const selector of selectors) {
                        const el = root.querySelector(selector);
                        const txt = el ? clean(el.innerText || el.textContent || '') : '';
                        if (isGoodName(txt)) {
                            out.nickname = txt;
                            break;
                        }
                    }
                }

                if (!out.nickname) {
                    for (const candidate of lines.slice(0, 20)) {
                        if (isGoodName(candidate)) {
                            out.nickname = clean(candidate);
                            break;
                        }
                    }
                }

                for (const img of Array.from(root.querySelectorAll('img'))) {
                    const src = img.currentSrc || img.src || '';
                    if (
                        src &&
                        (src.includes('wx.qlogo.cn') || src.includes('qpic.cn') || src.includes('finderhead')) &&
                        ((img.naturalWidth || img.width || 0) >= 30 || (img.naturalHeight || img.height || 0) >= 30)
                    ) {
                        out.avatar = src;
                        break;
                    }
                }
                return out;
            }'''
        )
        if isinstance(raw, dict):
            uid = _sanitize_text(raw.get('platform_uid'))
            nick = _sanitize_text(raw.get('nickname'))
            avatar = _sanitize_text(raw.get('avatar'))
            if uid and _looks_like_wechat_uid(uid):
                identity['platform_uid'] = uid
            if nick and not _looks_like_wechat_uid(nick) and not _looks_like_wechat_noise(nick):
                identity['nickname'] = nick
            if avatar:
                identity['avatar'] = avatar
    except Exception as e:
        print(f'[Worker] WECHAT_VIDEO identity DOM extraction warning: {str(e)[:120]}')
    return identity


def _extract_account_id_from_response(body) -> str:
    """Accept both wrapped and direct account responses from the cloud API."""
    if not isinstance(body, dict):
        return ''
    candidates = [body]
    data = body.get('data')
    if isinstance(data, dict):
        candidates.append(data)
        for key in ('account', 'record', 'item'):
            if isinstance(data.get(key), dict):
                candidates.append(data[key])
    for item in candidates:
        value = item.get('id') or item.get('accountId') or item.get('account_id')
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ''


async def _extract_douyin_identity(page) -> dict:
    """Get a stable Douyin identity after scan login.

    After QR scan on creator.douyin.com, the page may not expose sec_uid in
    localStorage or window variables. We try multiple extraction strategies,
    including navigating to www.douyin.com/user/self to get a reliable redirect.
    """
    identity = {'platform_uid': '', 'nickname': '', 'avatar': '', 'bio': ''}

    # ── Strategy 1: Extract from current page DOM/localStorage ──
    try:
        raw = await page.evaluate(
            r'''() => {
                const out = {};
                const seen = new Set();
                const firstUrl = (value, depth = 0) => {
                    if (!value || depth > 5) return '';
                    if (typeof value === 'string') {
                        const text = value.trim();
                        return /^https?:\/\//.test(text) ? text : '';
                    }
                    if (Array.isArray(value)) {
                        for (const item of value) {
                            const url = firstUrl(item, depth + 1);
                            if (url) return url;
                        }
                        return '';
                    }
                    if (typeof value === 'object') {
                        for (const key of ['url_list', 'urlList', 'urls', 'url']) {
                            const url = firstUrl(value[key], depth + 1);
                            if (url) return url;
                        }
                    }
                    return '';
                };
                const setText = (key, value) => {
                    if (key === 'avatar') {
                        const url = firstUrl(value);
                        if (url && !out[key]) out[key] = url;
                        if (url) return;
                    }
                    if (typeof value !== 'string' && typeof value !== 'number') return;
                    const text = String(value || '').trim();
                    if (!text || text === '[object Object]') return;
                    if (key === 'platform_uid' && text.length < 8) return;
                    if (key !== 'platform_uid' && text.length > 2000) return;
                    if (!out[key]) out[key] = text;
                };
                const visit = (value, depth = 0) => {
                    if (!value || depth > 5 || out.platform_uid && out.nickname && out.avatar) return;
                    if (typeof value === 'string') {
                        const sec = value.match(/MS4wLjAB[A-Za-z0-9._-]{20,}/);
                        if (sec) setText('platform_uid', sec[0]);
                        try { value = JSON.parse(value); } catch (e) { return; }
                    }
                    if (typeof value !== 'object' || seen.has(value)) return;
                    seen.add(value);
                    if (Array.isArray(value)) {
                        for (const item of value.slice(0, 80)) visit(item, depth + 1);
                        return;
                    }
                    for (const [k, v] of Object.entries(value)) {
                        const key = String(k || '');
                        if (/^(sec_uid|secUserId|sec_user_id)$/i.test(key)) setText('platform_uid', v);
                        if (/^(nickname|nickName|screen_name|displayName)$/i.test(key)) setText('nickname', v);
                        if (/^(avatar|avatarUrl|avatar_url|headImgUrl|head_img_url)$/i.test(key)) setText('avatar', v);
                        if (/(avatar|head).*?(url|uri)?$/i.test(key)) setText('avatar', v);
                        if (/^(signature|bio|description)$/i.test(key)) setText('bio', v);
                        visit(v, depth + 1);
                    }
                };
                try {
                    for (const store of [localStorage, sessionStorage]) {
                        for (let i = 0; i < store.length; i++) {
                            const key = store.key(i);
                            visit({ [key]: store.getItem(key) }, 0);
                        }
                    }
                } catch (e) {}
                try { visit(window.__STORE__ || window.__INITIAL_STATE__ || window.__NUXT__ || {}, 0); } catch (e) {}
                try {
                    const bodyText = document.body ? document.body.innerText || '' : '';
                    const m = bodyText.match(/MS4wLjAB[A-Za-z0-9._-]{20,}/);
                    if (m) setText('platform_uid', m[0]);
                } catch (e) {}
                try {
                    const candidates = [...document.images]
                        .map((img) => ({
                            src: img.currentSrc || img.src || '',
                            w: img.naturalWidth || img.width || 0,
                            h: img.naturalHeight || img.height || 0,
                            text: `${img.className || ''} ${img.alt || ''} ${img.getAttribute('aria-label') || ''}`.toLowerCase(),
                        }))
                        .filter((item) => /^https?:\/\//.test(item.src) && Math.max(item.w, item.h) >= 40)
                        .map((item) => {
                            // 竖版大图（视频封面/剧照）严重降权：头像几乎是方图，视频封面是 9:16 竖图
                            const portrait = item.h > item.w * 1.35;
                            const squareBias = item.w >= item.h ? 1 : (item.h <= item.w * 1.35 ? 0.7 : 0.2);
                            const sizeScore = Math.max(item.w, item.h) * (portrait ? 0.2 : 1) * squareBias;
                            const textScore = (/(avatar|head|user)/.test(item.text) ? 1000 : 0);
                            return { ...item, score: textScore + sizeScore };
                        })
                        .sort((a, b) => b.score - a.score);
                    if (candidates[0] && candidates[0].score > 0) setText('avatar', candidates[0].src);
                } catch (e) {}
                return out;
            }'''
        )
        if isinstance(raw, dict):
            for key in identity:
                text = _sanitize_text(raw.get(key))
                if text:
                    identity[key] = text
    except Exception as exc:
        print(f'[Worker] DOUYIN browser identity extraction warning: {str(exc)[:120]}')

    try:
        from douyin_api_collector import extract_creator_home_identity
        home_identity = await extract_creator_home_identity(page)
        home_nickname = _sanitize_text(home_identity.get('nickname') if isinstance(home_identity, dict) else '')
        home_avatar = _sanitize_text(home_identity.get('avatar_url') if isinstance(home_identity, dict) else '')
        home_sec_uid = _sanitize_text(home_identity.get('sec_uid') if isinstance(home_identity, dict) else '')
        if home_nickname and not _is_unsafe_nickname_fallback('DOUYIN', home_nickname):
            identity['nickname'] = home_nickname
        if home_avatar:
            identity['avatar'] = home_avatar
        if home_sec_uid.startswith('MS4wLjAB'):
            identity['platform_uid'] = home_sec_uid
    except Exception as exc:
        print(f'[Worker] DOUYIN creator-home identity warning: {str(exc)[:120]}')

    # If we already have a sec_uid from DOM, try to enrich with API profile.
    if identity.get('platform_uid'):
        try:
            from douyin_api_collector import get_user_profile
            profile = await get_user_profile(page, identity['platform_uid'])
            if profile:
                identity['nickname'] = _sanitize_text(profile.get('nickname')) or identity.get('nickname', '')
                identity['avatar'] = identity.get('avatar', '') or _sanitize_text(profile.get('avatar_url'))
                identity['bio'] = _sanitize_text(profile.get('bio')) or identity.get('bio', '')
        except Exception as exc:
            print(f'[Worker] DOUYIN API profile enrichment warning: {str(exc)[:120]}')
        return identity

    # ── Strategy 2: Navigate to www.douyin.com/user/self for reliable redirect ──
    # creator.douyin.com doesn't expose sec_uid in localStorage/window.
    # Navigating to /user/self on the main site redirects to /user/{sec_uid}.
    print('[Worker] DOUYIN sec_uid not found on creator page, navigating to www.douyin.com/user/self...', flush=True)
    try:
        await page.goto('https://www.douyin.com/user/self', wait_until='commit', timeout=20000)
        await page.wait_for_timeout(3000)
        current_url = page.url
        print(f'[Worker] DOUYIN /user/self redirected to: {current_url}', flush=True)
        import re as _re
        # sec_uid starts with MS4wLjAB and is 40+ chars
        m = _re.search(r'/user/(MS4wLjAB[A-Za-z0-9._-]+)', current_url)
        if m:
            identity['platform_uid'] = m.group(1)
            print(f'[Worker] DOUYIN sec_uid from /user/self redirect: {identity["platform_uid"][:40]}...', flush=True)
        else:
            # Try shorter match (some URLs have shorter IDs)
            m2 = _re.search(r'/user/([A-Za-z0-9_-]{10,})', current_url)
            if m2 and m2.group(1).lower() != 'self':
                identity['platform_uid'] = m2.group(1)
                print(f'[Worker] DOUYIN uid from /user/self redirect: {identity["platform_uid"][:40]}...', flush=True)
    except Exception as nav_exc:
        print(f'[Worker] DOUYIN /user/self navigation failed: {str(nav_exc)[:120]}', flush=True)

    # ── Strategy 3: Extract from www.douyin.com page after navigation ──
    if not identity.get('platform_uid'):
        try:
            raw2 = await page.evaluate(
                r'''() => {
                    try {
                        const store = window.__STORE__ || window.__INITIAL_STATE__;
                        if (store) {
                            const ui = store.userInfo || (store.user && store.user.userInfo);
                            if (ui) return { sec_uid: ui.secUserId || ui.sec_uid || '', nickname: ui.nickname || '' };
                        }
                    } catch(e) {}
                    try {
                        const m = document.cookie.match(/ss_uid[=]([^;]+)/);
                        if (m) return { sec_uid: decodeURIComponent(m[1]), nickname: '' };
                    } catch(e) {}
                    return {};
                }'''
            )
            if isinstance(raw2, dict):
                sec = _sanitize_text(raw2.get('sec_uid'))
                if sec and sec.lower() not in ('self', 'undefined', 'null', ''):
                    identity['platform_uid'] = sec
                    nick = _sanitize_text(raw2.get('nickname'))
                    if nick:
                        identity['nickname'] = nick
                    print(f'[Worker] DOUYIN sec_uid from page state: {sec[:40]}...', flush=True)
        except Exception as exc:
            print(f'[Worker] DOUYIN page state extraction warning: {str(exc)[:120]}')

    # ── Strategy 4: Try douyin_api_collector.get_sec_user_id as last resort ──
    if not identity.get('platform_uid'):
        try:
            from douyin_api_collector import get_sec_user_id
            sec_uid = await get_sec_user_id(page)
            if sec_uid:
                identity['platform_uid'] = _sanitize_text(sec_uid)
                print(f'[Worker] DOUYIN sec_uid from get_sec_user_id: {sec_uid[:40]}...', flush=True)
        except Exception as exc:
            print(f'[Worker] DOUYIN API identity extraction warning: {str(exc)[:120]}')

    # Enrich with API profile if we have sec_uid
    if identity.get('platform_uid'):
        try:
            from douyin_api_collector import get_user_profile
            profile = await get_user_profile(page, identity['platform_uid'])
            if profile:
                identity['nickname'] = _sanitize_text(profile.get('nickname')) or identity.get('nickname', '')
                identity['avatar'] = identity.get('avatar', '') or _sanitize_text(profile.get('avatar_url'))
                identity['bio'] = _sanitize_text(profile.get('bio')) or identity.get('bio', '')
        except Exception as exc:
            print(f'[Worker] DOUYIN API profile enrichment warning: {str(exc)[:120]}')

    return identity


def _build_session_auth_summary(profile_dir: Path, cookies: list | None = None, local_storage: dict | None = None) -> dict:
    """Build non-secret auth metadata for the local session registry."""
    cookie_names = []
    local_storage_keys = []
    try:
        if cookies is None:
            state_path = profile_dir / 'state.json'
            if state_path.exists():
                state_data = json.loads(read_text_file(state_path))
                cookies = state_data.get('cookies') or []
                for origin in state_data.get('origins') or []:
                    for item in origin.get('localStorage') or []:
                        name = item.get('name')
                        if name:
                            local_storage_keys.append(name)
        for cookie in cookies or []:
            name = cookie.get('name') if isinstance(cookie, dict) else ''
            domain = cookie.get('domain') if isinstance(cookie, dict) else ''
            if name and 'weixin' in str(domain or ''):
                cookie_names.append(name)
    except Exception:
        pass
    if local_storage:
        local_storage_keys.extend([str(k) for k in local_storage.keys() if k])
    local_storage_keys = sorted(set(local_storage_keys))
    cookie_names = sorted(set(cookie_names))
    return {
        'auth_ref': 'state.json',
        'cookie_count': len(cookies or []),
        'wechat_cookie_names': cookie_names,
        'local_storage_keys': local_storage_keys,
        'finder_login_token_present': 'finder_login_token' in local_storage_keys,
        'profile_persisted': (profile_dir / 'cookie_info.json').exists(),
        'saved_at': time.strftime('%Y-%m-%d %H:%M:%S'),
    }


async def _persist_runtime_storage(context, page, state_path: Path, wait_ms: int = 10_000) -> dict:
    """Save storage_state and merge live localStorage values into state.json."""
    runtime = {'origin': '', 'items': {}, 'finder_login_token': ''}
    deadline = time.monotonic() + max(wait_ms, 0) / 1000

    while True:
        try:
            captured = await page.evaluate(
                r'''() => {
                    const items = {};
                    try {
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            items[key] = localStorage.getItem(key) || '';
                        }
                    } catch (e) {}
                    return {
                        origin: location.origin,
                        items,
                        finder_login_token: items.finder_login_token || ''
                    };
                }'''
            )
            if isinstance(captured, dict):
                runtime = captured
                items = runtime.get('items') or {}
                if 'finder_login_token' in items or str(items.get('finder_username') or '').strip():
                    break
        except Exception:
            pass
        if time.monotonic() >= deadline:
            break
        await page.wait_for_timeout(500)

    await context.storage_state(path=str(state_path))

    try:
        state_data = json.loads(read_text_file(state_path))
        origin = runtime.get('origin') or 'https://channels.weixin.qq.com'
        items = runtime.get('items') or {}
        if items:
            origins = state_data.setdefault('origins', [])
            origin_entry = next((o for o in origins if o.get('origin') == origin), None)
            if not origin_entry:
                origin_entry = {'origin': origin, 'localStorage': []}
                origins.append(origin_entry)
            local_storage = origin_entry.setdefault('localStorage', [])
            existing = {item.get('name'): item for item in local_storage if item.get('name')}
            for name, value in items.items():
                if not name:
                    continue
                if name in existing:
                    existing[name]['value'] = value
                else:
                    local_storage.append({'name': name, 'value': value})
            state_path.write_text(json.dumps(state_data, ensure_ascii=False), encoding='utf-8')
    except Exception as e:
        print(f'[Worker] runtime localStorage merge warning: {e}')

    token = str(runtime.get('finder_login_token') or '').strip()
    print(f'[Worker] runtime localStorage saved: finder_login_token={"yes" if token else "empty"}')
    return runtime


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
                from local_db import (
                    PROFILE_ROOT,
                    add_account,
                    get_or_create_profile_dir,
                    mark_current_online_account,
                    save_account_session,
                    update_status,
                )
                platform_key = info['key']  # DOUYIN / WECHAT_VIDEO etc.

                def is_cancelled() -> bool:
                    return bool(
                        session_id
                        and (
                            session_id in state.scan_cancelled
                            or state.scan_status.get(session_id) == 'cancelled'
                        )
                    )

                def abort_if_cancelled(stage: str = '') -> None:
                    if not is_cancelled():
                        return
                    if stage:
                        print(f'[Worker] Scan session cancelled before {stage}', flush=True)
                    raise RuntimeError('SCAN_CANCELLED')

                def rethrow_if_cancelled(exc) -> None:
                    if str(exc) == 'SCAN_CANCELLED' or is_cancelled():
                        raise RuntimeError('SCAN_CANCELLED')

                async with async_playwright() as pw:
                    abort_if_cancelled('browser launch')
                    import shutil as _shutil
                    scan_profile_dir = PROFILE_ROOT / f'_scan_{platform}_{session_id or uuid.uuid4().hex[:8]}'
                    try:
                        resolved_root = PROFILE_ROOT.resolve()
                        resolved_scan = scan_profile_dir.resolve()
                        if scan_profile_dir.exists() and resolved_root in resolved_scan.parents:
                            try:
                                from browser_manager import cleanup_browser_processes_for_profile
                                cleanup_browser_processes_for_profile(scan_profile_dir)
                            except Exception as cleanup_err:
                                print(f'[Worker] stale scan browser cleanup warning: {str(cleanup_err)[:120]}')
                            _shutil.rmtree(scan_profile_dir, ignore_errors=True)
                    except Exception as _e:
                        print(f'[WARN] {type(_e).__name__}: {_e}')
                    scan_profile_dir.mkdir(parents=True, exist_ok=True)

                    # Generate per-account fingerprint (saved to profile for collection reuse)
                    login_fp = None
                    try:
                        from fingerprint import generate_fingerprint, save_fingerprint
                        login_fp = generate_fingerprint(session_id or uuid.uuid4().hex)
                        save_fingerprint(scan_profile_dir, login_fp)
                        print(f'[Worker] Fingerprint: Chrome/{login_fp.get("chrome_version","?")} WebGL={login_fp.get("webgl_vendor","?")[:20]}')
                    except Exception as fp_err:
                        print(f'[Worker] Fingerprint gen failed: {fp_err}')

                    browser_opts = _launch_browser_opts(False, ['--lang=zh-CN'])
                    context, launch_kw = await _launch_scan_browser_context(
                        pw,
                        scan_profile_dir,
                        browser_opts,
                        login_fp,
                        platform_key,
                    )
                    if session_id:
                        state.scan_status[session_id] = 'browser'
                        state.scan_errors.pop(session_id, None)
                    print(f"[Worker] scan browser opened platform={platform} profile={scan_profile_dir}", flush=True)
                    # 注入反检测脚本（每账号独立指纹）
                    if platform_key != 'DOUYIN':
                        try:
                            from stealth_patches import apply_stealth_to_context
                            await apply_stealth_to_context(context, fingerprint=login_fp)
                        except ImportError:
                            pass
                    # Cookie 隔离不同平台登录
                    try:
                        await context.clear_cookies()
                    except Exception:
                        print('[Worker] clear_cookies failed, creating new context')
                        await _safe_close_context(context, scan_profile_dir, f'{platform_key}/clear_cookies')
                        from process_registry import browser_snapshot as _bs, register_new_browser_tree as _rbnt
                        _pre2 = _bs()
                        context = await pw.chromium.launch_persistent_context(**launch_kw)
                        _rbnt(scan_profile_dir, _pre2, process_type='scan_login_browser')

                    page = context.pages[0] if context.pages else await context.new_page()
                    # Don't auto-close popups for Douyin — its login flow may open
                    # a popup window for QR code scanning.
                    if platform_key != 'DOUYIN':
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
                    # Douyin creator.douyin.com is a heavy SPA — 30s timeout is too short.
                    # Use 'commit' (navigation started) + generous wait, with retry.
                    nav_timeout = 60000 if platform_key == 'DOUYIN' else 30000
                    nav_ok = False
                    for nav_attempt in range(2):
                        try:
                            await page.goto(info['url'], wait_until='commit', timeout=nav_timeout)
                            nav_ok = True
                            break
                        except Exception as nav_err:
                            err_name = type(nav_err).__name__
                            if 'TargetClosed' in err_name or 'closed' in str(nav_err).lower():
                                raise RuntimeError(
                                    f'浏览器页面在打开抖音时被关闭。'
                                    f'可能原因：1) 抖音检测到自动化浏览器并拦截；'
                                    f'2) 系统缺少浏览器运行依赖。'
                                    f'请尝试重启披星云伴侣后再试，或联系技术支持。'
                                    f' (原始错误: {err_name})'
                                )
                            if nav_attempt == 0:
                                print(f'[Worker] Navigation attempt 1 failed ({err_name}), retrying...', flush=True)
                                await page.wait_for_timeout(2000)
                            else:
                                raise
                    print(f"[Worker] navigated platform={platform} url={page.url}", flush=True)
                    # Give the SPA time to render QR code / login page
                    await page.wait_for_timeout(8000)
                    try:
                        await page.wait_for_load_state("networkidle", timeout=15000)
                    except Exception:
                        print('[Worker] networkidle wait timed out, continuing anyway', flush=True)
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
                    # Douyin creator dashboard markers — appear after successful QR scan
                    # when the page redirects from QR login to creator-micro dashboard.
                    douyin_dashboard_markers = (
                        '创作者中心', '数据中心', '内容管理', '视频管理',
                        '粉丝数据', '关注者', '昨日数据', '互动评论',
                    )

                    for i in range(600):
                        await page.wait_for_timeout(500)
                        try:
                            msg = ctrl_queue.get_nowait()
                            if msg == 'EXTRACT_COOKIES':
                                print('[Worker] Received EXTRACT_COOKIES, extracting...')
                                break
                            if msg == 'CANCEL':
                                if session_id:
                                    state.scan_cancelled.add(session_id)
                                    state.scan_status[session_id] = 'cancelled'
                                    state.scan_errors.pop(session_id, None)
                                if use_sse:
                                    queue.put(json.dumps({'type':'error','data':'用户取消'}))
                                if page:
                                    try: await page.close()
                                    except Exception: pass
                                    page = None
                                if context:
                                    await _safe_close_context(context, scan_profile_dir, f'{platform_key}/cancel')
                                    context = None
                                return
                        except Empty:
                            pass
                        # Auto-detect login success for both platforms.
                        # WECHAT_VIDEO: check for backend markers after 4s
                        if info['key'] == 'WECHAT_VIDEO' and i >= 8 and i % 4 == 0:
                            try:
                                probe_text = await _get_page_text(page)
                                marker_count = sum(1 for marker in wechat_login_markers if marker in probe_text)
                                if 'login.html' not in (page.url or '') and marker_count >= 2:
                                    print(f'[Worker] WECHAT_VIDEO login auto-detected: url={page.url} markers={marker_count}', flush=True)
                                    break
                            except Exception as _e:
                                print(f'[WARN] {type(_e).__name__}: {_e}')
                        # DOUYIN: auto-detect dashboard redirect after 6s.
                        # When the QR scan succeeds, creator.douyin.com redirects
                        # from the QR login page to the creator dashboard.
                        if info['key'] == 'DOUYIN' and i >= 12 and i % 4 == 0:
                            try:
                                cur_url = page.url or ''
                                # QR login page URL typically contains '/login' or '/qrcode'
                                if '/login' not in cur_url and '/qrcode' not in cur_url and '/passport' not in cur_url:
                                    probe_text = await _get_page_text(page)
                                    marker_count = sum(1 for marker in douyin_dashboard_markers if marker in probe_text)
                                    if marker_count >= 2:
                                        print(f'[Worker] DOUYIN login auto-detected: url={cur_url[:80]} markers={marker_count}', flush=True)
                                        break
                            except Exception as _e:
                                print(f'[WARN] {type(_e).__name__}: {_e}')
                    else:
                        if platform_key == 'DOUYIN':
                            if use_sse:
                                queue.put(json.dumps({
                                    "type": "status",
                                    "data": "抖音仍在登录或安全验证中，浏览器不会自动关闭；请在浏览器里完成验证后再点击已完成登录。"
                                }, ensure_ascii=False))
                            if session_id:
                                state.scan_status[session_id] = 'browser'
                                state.scan_errors[session_id] = '等待用户完成抖音登录或验证码'
                            return
                        if use_sse:
                            queue.put(json.dumps({"type":"error","data":"操作超时，请重试"}))
                        if page:
                            try: await page.close()
                            except Exception: pass
                            page = None
                        if context:
                            await _safe_close_context(context, scan_profile_dir, f'{platform_key}/timeout')
                            context = None
                        return
                    if use_sse:
                        queue.put(json.dumps({'type':'status','data':'正在提取信息...'}))

                    # DOUYIN: After the user clicks “已完成登录”, the page may still
                    # be transitioning from the QR login page to the creator dashboard.
                    # Wait for the dashboard to fully load before extracting page text,
                    # otherwise has_dashboard will be False and initial collection skipped.
                    if info['key'] == 'DOUYIN':
                        try:
                            # If still on a login/qrcode URL, poll for redirect
                            cur_url = page.url or ''
                            cur_text = ''
                            if _is_douyin_login_or_challenge(cur_url, cur_text):
                                print(f'[Worker] DOUYIN still on login page ({cur_url[:60]}), waiting for dashboard redirect...', flush=True)
                                for _wait_i in range(20):
                                    await page.wait_for_timeout(1000)
                                    cur_url = page.url or ''
                                    try:
                                        cur_text = await _get_page_text(page)
                                    except Exception:
                                        cur_text = ''
                                    if not _is_douyin_login_or_challenge(cur_url, cur_text):
                                        print(f'[Worker] DOUYIN dashboard redirect detected: {cur_url[:60]}', flush=True)
                                        break
                                else:
                                    msg = '抖音仍在登录或安全验证中，请在浏览器里完成验证后再点击已完成登录。'
                                    print('[Worker] DOUYIN still on login/challenge page; keep browser open', flush=True)
                                    if use_sse:
                                        queue.put(json.dumps({'type':'status','data':msg}, ensure_ascii=False))
                                    if session_id:
                                        state.scan_status[session_id] = 'browser'
                                        state.scan_errors[session_id] = msg
                                    return
                            # Wait for dashboard content to render
                            try:
                                await page.wait_for_load_state('networkidle', timeout=15000)
                            except Exception:
                                pass
                            await page.wait_for_timeout(3000)
                            # Verify dashboard actually loaded
                            probe = await _get_page_text(page)
                            probe_markers = sum(1 for m in douyin_dashboard_markers if m in probe)
                            print(f'[Worker] DOUYIN dashboard probe: url={page.url[:60]} markers={probe_markers}', flush=True)
                            if probe_markers < 1:
                                # Dashboard not loaded — maybe user clicked too early
                                print('[Worker] DOUYIN dashboard not detected, waiting 5s more...', flush=True)
                                await page.wait_for_timeout(5000)
                                try:
                                    await page.reload(wait_until='commit', timeout=30000)
                                    await page.wait_for_timeout(5000)
                                except Exception:
                                    pass
                        except Exception as dy_err:
                            print(f'[Worker] DOUYIN dashboard wait warning: {str(dy_err)[:120]}', flush=True)

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
                                    page = None
                                if context:
                                    await _safe_close_context(context, scan_profile_dir, f'{platform_key}/validation_failed')
                                    context = None
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
                                page = None
                            if context:
                                await _safe_close_context(context, scan_profile_dir, f'{platform_key}/validation_error')
                                context = None
                            return

                    # Use CDP to get ALL cookies including session cookies (expires=-1)
                    # context.cookies() misses session cookies like compass_token, finder_session
                    cookies = []
                    try:
                        cdp_page = page or (context.pages[0] if context.pages else None)
                        if cdp_page:
                            cdp_sess = await context.new_cdp_session(cdp_page)
                            cdp_result = await cdp_sess.send('Network.getAllCookies')
                            await cdp_sess.detach()
                            cookies = cdp_result.get('cookies', [])
                            print(f'[Worker] CDP got {len(cookies)} cookies (incl session)')
                    except Exception as cdp_err:
                        print(f'[Worker] CDP getAllCookies failed: {cdp_err}, falling back to context.cookies()')
                        cookies = await context.cookies()
                    # Normalize cookie format (CDP returns slightly different keys)
                    for c in cookies:
                        if 'expires' not in c:
                            c['expires'] = -1
                        if 'sameSite' not in c:
                            c['sameSite'] = c.get('sameSite', 'Lax')
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
                            page = None
                        if context:
                            await _safe_close_context(context, scan_profile_dir, f'{platform_key}/no_cookies')
                            context = None
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
                    avatar = ''
                    bio = ''
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

                    platform_key = info['key']  # DOUYIN / WECHAT_VIDEO etc.
                    local_storage_items = {}
                    if platform_key == 'DOUYIN':
                        douyin_identity = await _extract_douyin_identity(page)
                        if douyin_identity.get('platform_uid'):
                            real_id = douyin_identity['platform_uid']
                        if douyin_identity.get('nickname') and (
                            not nickname
                            or nickname == real_id
                            or nickname == _sanitize_text(info['name'])
                            or _is_unsafe_nickname_fallback(platform_key, nickname)
                        ):
                            nickname = douyin_identity['nickname']
                        avatar = douyin_identity.get('avatar') or ''
                        bio = douyin_identity.get('bio') or ''
                        print(
                            f'[Worker] DOUYIN identity: '
                            f'uid={"yes" if real_id else "missing"} '
                            f'nickname={nickname or ""} avatar={"yes" if avatar else "missing"}'
                        )
                    if platform_key == 'WECHAT_VIDEO':
                        wechat_identity = await _extract_wechat_video_identity(page)
                        if wechat_identity.get('platform_uid'):
                            real_id = wechat_identity['platform_uid']
                        if wechat_identity.get('nickname'):
                            nickname = wechat_identity['nickname']
                        if wechat_identity.get('avatar'):
                            avatar = wechat_identity['avatar']
                        if wechat_identity.get('platform_uid') or wechat_identity.get('nickname') or wechat_identity.get('avatar'):
                            print(
                                f'[Worker] WECHAT_VIDEO identity: '
                                f'uid={"yes" if wechat_identity.get("platform_uid") else "missing"} '
                                f'nickname={wechat_identity.get("nickname") or ""} '
                                f'avatar={"yes" if wechat_identity.get("avatar") else "missing"}'
                            )
                        if real_id and not _looks_like_wechat_uid(real_id):
                            print(f'[Worker] WECHAT_VIDEO discarded unstable page id: {real_id}')
                            real_id = ''
                        if nickname and real_id and nickname == real_id:
                            print(f'[Worker] WECHAT_VIDEO discarded uid-as-nickname: {nickname}')
                            nickname = None
                        if nickname and _looks_like_wechat_noise(nickname):
                            print(f'[Worker] WECHAT_VIDEO discarded noisy nickname: {nickname}')
                            nickname = None
                        if nickname and _looks_like_legal_entity_name(nickname):
                            print(f'[Worker] WECHAT_VIDEO discarded legal-entity nickname: {nickname}')
                            nickname = None
                        local_storage_items = await _get_local_storage_items(page)
                        if not real_id:
                            finder_username = _sanitize_text(local_storage_items.get('finder_username'))
                            if finder_username and _looks_like_wechat_uid(finder_username):
                                real_id = finder_username
                                if not nickname or nickname == _sanitize_text(info['name']):
                                    nickname = '视频号'
                            elif finder_username:
                                print(f'[Worker] WECHAT_VIDEO ignored unstable finder_username: {finder_username}')

                    if real_id:
                        platform_uid = real_id
                        local_only_identity = False
                    else:
                        import uuid as _uid_uuid
                        platform_uid = f"local:{platform}:{_uid_uuid.uuid4().hex[:12]}"
                        local_only_identity = True

                    # 后端注册和上报必须可观测：本地可以先保存，但网站同步失败不能冒充成功。
                    import requests as req
                    # 出站 HTTP 全部直连：requests 默认读取 Windows 系统代理
                    # （Clash/VPN 等），代理节点故障时会被 TCP RST 打断。
                    req_session = req.Session()
                    req_session.trust_env = False
                    sync_errors = []

                    def _record_sync_error(label, detail):
                        rethrow_if_cancelled(detail)
                        msg = f'{label}: {str(detail)[:180]}'
                        sync_errors.append(msg)
                        print(f'[Worker] Sync error: {msg}')

                    def _refresh_backend_token(reason: str = '') -> bool:
                        nonlocal token
                        try:
                            from companion_auth import _login_with_saved_credentials
                            from companion_config import _load_config
                            cfg = _load_config()
                            if api_url:
                                cfg['api_url'] = api_url.rstrip('/')
                            fresh = _login_with_saved_credentials(cfg)
                            if fresh:
                                token = fresh
                                print(f'[Worker] Backend token refreshed{f" ({reason})" if reason else ""}')
                                return True
                        except Exception as e:
                            print(f'[Worker] Backend token refresh error: {str(e)[:120]}')
                        return False

                    def _request_with_auth(method: str, url: str, **kwargs):
                        abort_if_cancelled(f'{method} {url}')
                        headers = dict(kwargs.pop('headers', {}) or {})
                        if token and 'Authorization' not in headers:
                            headers['Authorization'] = f'Bearer {token}'
                        resp = req_session.request(method, url, headers=headers, **kwargs)
                        if resp.status_code == 401 and _refresh_backend_token('HTTP 401'):
                            abort_if_cancelled(f'{method} {url} retry')
                            headers['Authorization'] = f'Bearer {token}'
                            resp = req_session.request(method, url, headers=headers, **kwargs)
                        return resp

                    def _response_ok(resp) -> bool:
                        if not resp or resp.status_code >= 400:
                            return False
                        try:
                            body = resp.json()
                            if isinstance(body, dict) and body.get('success') is False:
                                return False
                            inner = body.get('data') if isinstance(body, dict) else None
                            if isinstance(inner, dict) and inner.get('success') is False:
                                return False
                        except Exception:
                            pass
                        return True

                    def _account_text(value, fallback='') -> str:
                        text = _sanitize_text(value)
                        if text:
                            return text
                        return _sanitize_text(fallback)

                    platform_uid = _account_text(platform_uid, f'local:{platform_key}:{uuid.uuid4().hex[:12]}')
                    if platform_key == 'WECHAT_VIDEO' and (not nickname or _looks_like_wechat_uid(nickname)):
                        nickname = '视频号'
                    nickname = _account_text(nickname, platform_uid or info.get('name') or '未命名账号')
                    avatar = _account_text(avatar, '')
                    bio = _account_text(bio, '')

                    # 身份可靠性守卫：只有 finder 内部 uid（非 sph 视频号ID）且昵称不可靠时，
                    # 不允许创建/更新云端账号 —— 避免把"最近视频"等页面标题误存为昵称。
                    _finder_only_uid = bool(
                        re.match(r'^v2_[A-Za-z0-9_@.\-]{8,}@finder$', platform_uid or '')
                    )
                    _unreliable_nickname = (
                        not nickname
                        or _looks_like_wechat_uid(nickname)
                        or _looks_like_wechat_noise(nickname)
                        or _looks_like_legal_entity_name(nickname)
                    )
                    if platform_key == 'WECHAT_VIDEO' and _finder_only_uid and _unreliable_nickname:
                        local_only_identity = True
                        platform_uid = f"local:{platform_key}:{uuid.uuid4().hex[:12]}"
                        _record_sync_error(
                            '昵称采集失败',
                            '未从页面可靠识别到视频号昵称，本次仅本地保存，未创建/更新云端账号。请停留在视频号主页后重新扫码绑定。',
                        )

                    existing_id = None
                    data = {'code': -1, 'message': 'Backend unavailable'}  # default: backend failed
                    abort_if_cancelled('cloud account lookup')
                    if local_only_identity:
                        _record_sync_error(
                            '未识别到平台账号身份',
                            '扫码后没有拿到抖音号/sec_uid，不能安全同步到网站。请确认登录后停留在创作者中心或账号主页再点完成。',
                        )
                    if not local_only_identity:
                        try:
                            check_resp = _request_with_auth(
                                'GET',
                                f"{api_url.rstrip('/')}/accounts",
                                timeout=10,
                            )
                            if check_resp.status_code == 200:
                                nickname_candidates = []
                                for acc in ((check_resp.json().get('data') or {}).get('accounts') or []):
                                    remote_platform = acc.get('platform')
                                    remote_uid = (acc.get('platformUserId') or '').strip()
                                    remote_name = (acc.get('nickname') or '').strip()
                                    if remote_platform == platform_key and remote_name == nickname:
                                        nickname_candidates.append(acc)
                                    same_uid = bool(
                                        remote_platform == platform_key
                                        and platform_uid
                                        and remote_uid == platform_uid
                                    )
                                    if same_uid:
                                        existing_id = acc.get('id')
                                        if (
                                            platform_key == 'WECHAT_VIDEO'
                                            and _is_wechat_placeholder_nickname(nickname)
                                            and _is_safe_existing_wechat_nickname(remote_name)
                                        ):
                                            nickname = remote_name
                                            print(f'[Worker] WECHAT_VIDEO preserved existing remote nickname: {nickname}')
                                        break
                                if not existing_id:
                                    legacy_candidates = [
                                        acc for acc in nickname_candidates
                                        if _is_local_or_missing_uid((acc.get('platformUserId') or '').strip())
                                        and _is_local_or_missing_uid(platform_uid)
                                    ]
                                    # 只有 finder 内部 uid 时，若昵称可靠且云端有唯一同名账号，
                                    # 复用该账号（不覆盖其 platformUserId），避免产生重复账号。
                                    finder_reuse_allowed = (
                                        platform_key == 'WECHAT_VIDEO'
                                        and _finder_only_uid
                                        and not _unreliable_nickname
                                    )
                                    if (
                                        len(legacy_candidates) == 1
                                        and not _is_unsafe_nickname_fallback(platform_key, nickname)
                                    ):
                                        existing_id = legacy_candidates[0].get('id')
                                        print(
                                            f'[Worker] Legacy nickname account reuse allowed for '
                                            f'{platform_key} {nickname}: {existing_id}'
                                        )
                                    elif finder_reuse_allowed and len(nickname_candidates) == 1:
                                        existing_id = nickname_candidates[0].get('id')
                                        print(
                                            f'[Worker] WECHAT_VIDEO finder-uid scan reused same-name account '
                                            f'{existing_id} (platformUserId untouched)'
                                        )
                                    elif nickname_candidates:
                                        print(
                                            f'[Worker] Skip nickname-only cloud reuse for {platform_key} '
                                            f'{nickname}; candidates={len(nickname_candidates)} '
                                            f'legacy={len(legacy_candidates)}'
                                        )
                            else:
                                _record_sync_error('查询云端账号失败', f'HTTP {check_resp.status_code} {check_resp.text[:120]}')
                        except Exception as _e:
                            _record_sync_error('查询云端账号异常', _e)
                    else:
                        print(f'[Worker] No stable platform uid found for {platform_key}; saving local-only binding')

                    account_id = existing_id
                    local_existing_id = None
                    abort_if_cancelled('local profile save')
                    if not account_id:
                        try:
                            from local_db import get_accounts_by_platform
                            for la in get_accounts_by_platform(platform_key):
                                if la.get('platform_uid') == platform_uid:
                                    local_existing_id = la['id']
                                    if local_only_identity or not str(local_existing_id).startswith('local_'):
                                        account_id = local_existing_id
                                        print(f'[Worker] Reusing existing local account {account_id} for uid {platform_uid}')
                                    else:
                                        print(f'[Worker] Found local-only account {local_existing_id} for uid {platform_uid}; trying backend promotion')
                                    break
                        except Exception as _e:
                            print(f'[WARN] {type(_e).__name__}: {_e}')

                    if existing_id:
                        try:
                            payload = {'nickname': nickname, 'cookies': ''}
                            if avatar:
                                payload['avatar'] = avatar
                            if bio:
                                payload['bio'] = bio
                            resp = _request_with_auth(
                                'PUT',
                                f"{api_url.rstrip('/')}/accounts/{existing_id}",
                                json=payload,
                                headers={'Content-Type': 'application/json'},
                                timeout=15,
                            )
                            if resp.status_code == 200:
                                account_id = _extract_account_id_from_response(resp.json()) or existing_id
                            else:
                                _record_sync_error('更新云端账号失败', f'HTTP {resp.status_code} {resp.text[:120]}')
                        except Exception as _e:
                            _record_sync_error('更新云端账号异常', _e)
                    elif not account_id and not local_only_identity:
                        try:
                            payload = {
                                'platform': platform_key,
                                'platformUserId': platform_uid,
                                'nickname': nickname,
                                'cookies': '',
                            }
                            if avatar:
                                payload['avatar'] = avatar
                            if bio:
                                payload['bio'] = bio
                            resp = _request_with_auth(
                                'POST',
                                f"{api_url.rstrip('/')}/accounts",
                                json=payload,
                                headers={'Content-Type': 'application/json'},
                                timeout=15,
                            )
                            if resp.status_code in (200, 201):
                                account_id = _extract_account_id_from_response(resp.json())
                                if not account_id:
                                    _record_sync_error('创建云端账号失败', f'响应缺少 accountId: {resp.text[:160]}')
                            else:
                                _record_sync_error('创建云端账号失败', f'HTTP {resp.status_code} {resp.text[:120]}')
                        except Exception as _e:
                            _record_sync_error('创建云端账号异常', _e)

                    # 上传 Cookie 到服务器，让后端定时同步也能使用。
                    if account_id and not account_id.startswith('local_') and cookies:
                        abort_if_cancelled('cookie upload')
                        try:
                            cookie_list = [
                                {'name': c['name'], 'value': c['value'], 'domain': c.get('domain', ''),
                                 'path': c.get('path', '/'), 'expires': c.get('expires', -1),
                                 'httpOnly': c.get('httpOnly', False), 'secure': c.get('secure', False),
                                 'sameSite': c.get('sameSite', 'Lax')}
                                for c in cookies
                            ]
                            upload_resp = _request_with_auth(
                                'POST',
                                f"{api_url.rstrip('/')}/accounts/{account_id}/cookies",
                                json={'cookies': cookie_list},
                                headers={'Content-Type': 'application/json'},
                                timeout=15,
                            )
                            if upload_resp.status_code == 200:
                                print(f'[Worker] Cookie uploaded to server: {len(cookie_list)} cookies for account {account_id}')
                            else:
                                _record_sync_error('上传 Cookie 失败', f'HTTP {upload_resp.status_code} {upload_resp.text[:120]}')
                        except Exception as e:
                            _record_sync_error('上传 Cookie 异常', e)

                    # 存入本地 DB 并保存 Profile 状态。
                    #  即使后端注册失败，本地也要保存（矩阵管理是离线优先架构）
                    if not account_id:
                        if local_existing_id:
                            account_id = local_existing_id
                            print(f'[Worker] Backend unavailable, keeping local account {account_id}')
                        else:
                            import uuid as _uuid
                            account_id = f'local_{_uuid.uuid4().hex[:16]}'
                            print(f'[Worker] Backend unreachable, using local ID: {account_id}')
                    
                    # Always save locally (regardless of backend status)
                    profile_dir = get_or_create_profile_dir(account_id, platform_key)
                    saved_account_id = add_account(account_id, platform_key, profile_dir.name,
                            platform_uid=platform_uid, nickname=nickname)
                    if saved_account_id and saved_account_id != account_id:
                        account_id = saved_account_id
                        profile_dir = get_or_create_profile_dir(account_id, platform_key)
                    try:
                        update_status(account_id, 'active')
                    except Exception as _e:
                        print(f'[WARN] {type(_e).__name__}: {_e}')
                    # 保存 storage_state 到 Profile 目录，供采集流程使用。
                    target_profile = str(profile_dir)
                    Path(target_profile).mkdir(parents=True, exist_ok=True)
                    state_path = Path(target_profile) / 'state.json'
                    if platform_key == 'WECHAT_VIDEO':
                        await _persist_runtime_storage(context, page, state_path)
                    else:
                        await context.storage_state(path=str(state_path))
                    print(f'[Worker] Storage state saved: {state_path}')

                    # Merge CDP-captured cookies into state.json
                    # storage_state() misses session cookies (expires=-1) like compass_token
                    # We already have them in the `cookies` variable from CDP extraction above
                    try:
                        import json as _json2
                        state_data = _json2.loads(read_text_file(state_path))
                        existing_keys = {(c.get('name'), c.get('domain'), c.get('path')) for c in state_data.get('cookies', [])}
                        merged = list(state_data.get('cookies', []))
                        added = 0
                        for c in cookies:
                            key = (c.get('name'), c.get('domain'), c.get('path'))
                            if key not in existing_keys:
                                merged.append(c)
                                added += 1
                            else:
                                # Replace with CDP version (has session cookies)
                                merged = [c if (m.get('name'), m.get('domain'), m.get('path')) == key else m for m in merged]
                                existing_keys.discard(key)
                        state_data['cookies'] = merged
                        state_path.write_text(_json2.dumps(state_data, ensure_ascii=False), encoding='utf-8')
                        print(f'[Worker] Merged {added} CDP cookies into state.json (total: {len(merged)})')
                    except Exception as merge_err:
                        print(f'[Worker] Cookie merge warning: {merge_err}')

                    # Save per-account fingerprint to the real profile dir
                    # (so collection uses the same fingerprint as login)
                    try:
                        from fingerprint import save_fingerprint
                        if login_fp:
                            save_fingerprint(Path(target_profile), login_fp)
                            print(f'[Worker] Fingerprint saved to {target_profile}')
                    except Exception as fp_save_err:
                        print(f'[Worker] Fingerprint save warning: {fp_save_err}')

                    # Save cookie freshness info alongside state.json
                    try:
                        cookie_info = {
                            'last_cookie_refresh': time.strftime('%Y-%m-%d %H:%M:%S'),
                            'cookie_age_seconds': 0,
                        }
                        cookie_info_path = Path(target_profile) / 'cookie_info.json'
                        write_text_file(cookie_info_path, json.dumps(cookie_info, ensure_ascii=False))
                    except Exception as e:
                        print(f'[Worker] Cookie info save warning: {e}')

                    try:
                        auth_summary = _build_session_auth_summary(Path(target_profile), cookies, local_storage_items)
                        save_account_session(
                            account_id,
                            platform_key,
                            Path(target_profile).name,
                            auth=auth_summary,
                            session_state='saved',
                        )
                        print(f'[Worker] Local session auth saved for {platform_key}/{account_id}')
                    except Exception as sess_err:
                        print(f'[Worker] Local session auth save warning: {str(sess_err)[:120]}')

                    # Cookie 已在 state.json 中持久化，无需额外固化步骤。
                    # state.json 可供 _scrape_one_account 通过 storage_state 加载

                    # 立即采集初始数据
                    metrics = {}
                    initial_collected = False
                    initial_reported = False
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
                                abort_if_cancelled('initial collection')
                                # WeChat Video sessions expire quickly after browser close.
                                # Must do FULL collection (max_posts=0) while session is active.
                                # Quick mode (20 posts) misses cumulative totals from all videos.
                                initial_max_posts = 0 if platform_key == 'WECHAT_VIDEO' else _DEFAULT_QUICK_MAX_POSTS
                                initial_sleep = 1.5 if platform_key == 'WECHAT_VIDEO' else 0.35
                                print(f'[Worker] Initial FULL collection for {platform_key} (max_posts={initial_max_posts})')
                                extra = await _scrape_account_pages(
                                    context,
                                    platform_key,
                                    max_posts=initial_max_posts,
                                    sleep_sec=initial_sleep,
                                )
                                print(f'[Worker] Initial collection done: metrics={list(extra.get("metrics",{}).keys())} videos={len(extra.get("video_stats",[]))}')
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
                                initial_collected = True
                                try:
                                    from local_db import update_metrics, save_contents, save_history_snapshot, update_collection_time
                                    update_metrics(account_id, extra_metrics)
                                    vstats = extra.get('video_stats') or []
                                    if vstats:
                                        save_contents(account_id, vstats)
                                    save_history_snapshot(account_id)
                                    update_collection_time(account_id)
                                    if platform_key == 'WECHAT_VIDEO':
                                        total_videos = extra_metrics.get('videos') or extra_metrics.get('video_count') or 0
                                        if total_videos:
                                            coverage = len(vstats) / max(total_videos, 1)
                                            missing = max(int(total_videos) - len(vstats), 0)
                                            print(
                                                f'[Worker] WECHAT_VIDEO completeness {nickname or account_id}: '
                                                f'posts={len(vstats)}/{total_videos} '
                                                f'coverage={coverage:.1%} missing_est={missing}'
                                            )
                                        elif vstats:
                                            print(
                                                f'[Worker] WECHAT_VIDEO completeness {nickname or account_id}: '
                                                f'posts={len(vstats)}, dashboard total unavailable'
                                            )
                                except Exception as e:
                                    print(f'[DC] Local DB save error {account_id}: {e}')

                            # Extract historical data before reporting
                            history = metrics.pop('_history', []) if isinstance(metrics, dict) else []
                            can_report_initial = bool(
                                api_url and token and account_id
                                and not str(account_id).startswith('local_')
                            )

                            if can_report_initial and metrics:
                                abort_if_cancelled('initial metric report')
                                report_resp = _request_with_auth('POST', f"{api_url.rstrip('/')}/platforms/report-metrics",
                                    json={'accountId': account_id, 'metrics': metrics},
                                    timeout=30)
                                if _response_ok(report_resp):
                                    initial_reported = True
                                else:
                                    _record_sync_error('上报初始指标失败', f'HTTP {report_resp.status_code} {report_resp.text[:120]}')

                            # Report historical data (7-day / 30-day)
                            if can_report_initial and history:
                                for hist_entry in history:
                                    hist_date = hist_entry.pop('date', None)
                                    if not hist_date:
                                        continue
                                    try:
                                        abort_if_cancelled('history metric report')
                                        hist_resp = _request_with_auth(
                                            'POST',
                                            f'{api_url}/platforms/report-metrics',
                                            json={'accountId': account_id, 'metrics': hist_entry, 'date': hist_date},
                                            timeout=30,
                                        )
                                        if not _response_ok(hist_resp):
                                            _record_sync_error('上报历史指标失败', f'{hist_date} HTTP {hist_resp.status_code} {hist_resp.text[:120]}')
                                    except Exception as _e:
                                        _record_sync_error('上报历史指标异常', _e)

                            vstats = extra.get('video_stats') or []
                            if can_report_initial and vstats and account_id:
                                try:
                                    abort_if_cancelled('video post report')
                                    upload_result = report_post_stats_in_batches(
                                        account_id=account_id,
                                        posts=vstats,
                                        send_batch=lambda batch: _request_with_auth(
                                            'POST',
                                            f'{api_url}/platforms/report-post-stats',
                                            json={'accountId': account_id, 'posts': batch},
                                            timeout=30,
                                        ),
                                        response_ok=_response_ok,
                                        should_abort=is_cancelled,
                                        log_prefix='[Worker]',
                                    )
                                    if upload_result['sent'] > 0:
                                        initial_reported = True
                                    if upload_result['failed'] == 0:
                                        print(
                                            f'[Worker] Video post stats uploaded: '
                                            f'{upload_result["sent"]}/{len(vstats)} for account {account_id}'
                                        )
                                    else:
                                        _record_sync_error(
                                            '上报视频明细失败',
                                            f'sent={upload_result["sent"]} failed={upload_result["failed"]} '
                                            f'errors={upload_result["errors"][:3]}',
                                        )
                                except Exception as _e:
                                    _record_sync_error('上报视频明细异常', _e)

                            if use_sse:
                                f_count = metrics.get('followers', '?')
                                v_count = metrics.get('views', '?')
                                p_count = len(vstats)
                                queue.put(json.dumps({'type':'status','data':f'数据已采集 粉丝{f_count} 播放{v_count} 视频{p_count}条'}))
                        except Exception as e:
                            if use_sse:
                                queue.put(json.dumps({'type':'status','data':f'数据采集失败: {str(e)[:80]}'}))
                            _record_sync_error('初始采集异常', e)
                    else:
                        _record_sync_error('初始采集未完成', '未检测到有效后台首页，未进入完整采集')

                    if platform_key == 'WECHAT_VIDEO' and scan_profile_dir:
                        try:
                            source_profile = Path(scan_profile_dir).resolve()
                            target_profile_path = Path(target_profile).resolve()
                            profile_root = PROFILE_ROOT.resolve()
                            if profile_root in source_profile.parents and profile_root in target_profile_path.parents:
                                # Navigate to data-center to trigger compass_token cookie creation
                                if page:
                                    try:
                                        await page.goto('https://channels.weixin.qq.com/platform/data-center',
                                                        wait_until='domcontentloaded', timeout=15000)
                                        await page.wait_for_timeout(3000)
                                    except Exception:
                                        pass

                                source_state = source_profile / 'state.json'
                                await _persist_runtime_storage(context, page, source_state)

                                # CRITICAL: storage_state() and context.cookies() both miss
                                # session cookies (compass_token etc.) set by WeChat JS.
                                # Use CDP (Chrome DevTools Protocol) to get ALL cookies
                                # with decrypted values, including session cookies.
                                try:
                                    extra_cookies = []
                                    # Try CDP approach first - gets all cookies including session
                                    try:
                                        cdp_page = page or (context.pages[0] if context.pages else None)
                                        if cdp_page:
                                            cdp_session = await context.new_cdp_session(cdp_page)
                                            result = await cdp_session.send('Network.getAllCookies')
                                            for c in result.get('cookies', []):
                                                extra_cookies.append({
                                                    'name': c.get('name', ''),
                                                    'value': c.get('value', ''),
                                                    'domain': c.get('domain', ''),
                                                    'path': c.get('path', '/'),
                                                    'expires': c.get('expires', -1),
                                                    'httpOnly': c.get('httpOnly', False),
                                                    'secure': c.get('secure', False),
                                                    'sameSite': c.get('sameSite', 'Lax'),
                                                })
                                            await cdp_session.detach()
                                            print(f'[Worker] WECHAT_VIDEO: CDP got {len(extra_cookies)} cookies')
                                    except Exception as cdp_err:
                                        print(f'[Worker] WECHAT_VIDEO: CDP cookie fetch failed: {cdp_err}')
                                        # Fallback: context.cookies()
                                        try:
                                            ctx_cookies = await context.cookies()
                                            extra_cookies = list(ctx_cookies)
                                            print(f'[Worker] WECHAT_VIDEO: context.cookies() fallback got {len(extra_cookies)} cookies')
                                        except Exception:
                                            pass

                                    state_data = json.loads(read_text_file(source_state))
                                    existing_names = {(c.get('name'), c.get('domain'), c.get('path')) for c in state_data.get('cookies', [])}
                                    merged = list(state_data.get('cookies', []))
                                    for c in extra_cookies:
                                        key = (c.get('name'), c.get('domain'), c.get('path'))
                                        if key not in existing_names:
                                            merged.append(c)
                                        else:
                                            merged = [c if (m.get('name'), m.get('domain'), m.get('path')) == key else m for m in merged]
                                            existing_names.discard(key)
                                    state_data['cookies'] = merged
                                    source_state.write_text(json.dumps(state_data, ensure_ascii=False), encoding='utf-8')
                                    print(f'[Worker] WECHAT_VIDEO: merged {len(extra_cookies)} cookies via CDP (total in state.json: {len(merged)})')
                                except Exception as ce:
                                    print(f'[Worker] WECHAT_VIDEO: cookie merge warning: {ce}')

                                source_cookie_info = source_profile / 'cookie_info.json'
                                write_text_file(source_cookie_info, json.dumps({
                                    'last_cookie_refresh': time.strftime('%Y-%m-%d %H:%M:%S'),
                                    'cookie_age_seconds': 0,
                                    'profile_persisted': True,
                                }, ensure_ascii=False))
                                if page:
                                    try: await page.close()
                                    except Exception: pass
                                    page = None
                                if context:
                                    await _safe_close_context(context, scan_profile_dir, f'{platform_key}/persist_profile')
                                    context = None
                                import shutil as _shutil
                                if target_profile_path.exists():
                                    _shutil.rmtree(target_profile_path, ignore_errors=True)
                                _shutil.copytree(source_profile, target_profile_path, dirs_exist_ok=True)
                                print(f'[Worker] WECHAT_VIDEO full profile persisted: {target_profile_path}')
                                try:
                                    auth_summary = _build_session_auth_summary(
                                        target_profile_path,
                                        None,
                                        local_storage_items,
                                    )
                                    save_account_session(
                                        account_id,
                                        platform_key,
                                        target_profile_path.name,
                                        auth=auth_summary,
                                        session_state='online',
                                    )
                                    evicted = mark_current_online_account(platform_key, account_id, source='scan_bind')
                                    print(
                                        f'[Worker] WECHAT_VIDEO current online account={account_id}; '
                                        f'evicted_sessions={evicted}'
                                    )
                                except Exception as sess_err:
                                    print(f'[Worker] WECHAT_VIDEO session pointer warning: {str(sess_err)[:120]}')
                        except Exception as e:
                            print(f'[Worker] WECHAT_VIDEO full profile persist warning: {str(e)[:120]}')

                    cloud_account_ok = bool(
                        account_id
                        and not str(account_id).startswith('local_')
                        and not local_only_identity
                    )
                    if not cloud_account_ok:
                        _record_sync_error('云端账号未确认', '未拿到可同步到网站的 accountId')
                    if initial_collected and cloud_account_ok and not initial_reported:
                        _record_sync_error('网站未同步采集结果', '初始采集已写入本地，但没有任何指标或视频明细成功上报到网站')
                    if not initial_collected:
                        _record_sync_error('未完成初始采集', '绑定后没有采到有效指标或视频明细')

                    if platform_key == 'DOUYIN' and cloud_account_ok and sync_errors:
                        print(
                            '[Worker] DOUYIN bind saved; treating post-login collection/upload '
                            f'warnings as non-fatal: {sync_errors[:2]}'
                        )
                        sync_errors = []

                    upload_ok = cloud_account_ok if platform_key == 'DOUYIN' else (
                        cloud_account_ok and initial_collected and initial_reported and not sync_errors
                    )
                    upload_err = sync_errors[0] if sync_errors else f"上传失败: {data.get('message','未知错误')}"
                    if upload_ok:
                        _record_scan_time(platform)

                    # 持久化和上传完成后关闭持久化上下文，避免扫码窗口继续显示进行中。
                    if page:
                        try:
                            await page.close()
                        except Exception:
                            pass
                        page = None
                    if context:
                        await _safe_close_context(context, scan_profile_dir, f'{platform_key}/done')
                        context = None

                    if session_id:
                        state.scan_status[session_id] = 'done' if upload_ok else 'error'
                        if upload_ok:
                            state.scan_errors.pop(session_id, None)
                        else:
                            state.scan_errors[session_id] = upload_err
                        state.scan_cancelled.discard(session_id)
                        if session_id in state.active_sessions: del state.active_sessions[session_id]
                    if use_sse:
                        if upload_ok:
                            queue.put(json.dumps({'type':'success','data':{'platform':platform,'cookies_count':len(cookies),'account_id':account_id}}))
                        else:
                            queue.put(json.dumps({'type':'error','data':upload_err}))
            except Exception as e:
                if str(e) == 'SCAN_CANCELLED':
                    if session_id:
                        state.scan_status[session_id] = 'cancelled'
                        state.scan_errors.pop(session_id, None)
                        state.scan_cancelled.discard(session_id)
                        state.active_sessions.pop(session_id, None)
                    if page:
                        try: await page.close()
                        except Exception: pass
                    if context:
                        await _safe_close_context(context, scan_profile_dir, f'{platform or "scan"}/cancelled')
                    if use_sse:
                        queue.put(json.dumps({'type':'error','data':'用户取消'}))
                    return
                import traceback
                err_full = traceback.format_exc()
                try:
                    import tempfile
                    with open(Path(tempfile.gettempdir()) / 'pixingyun_error.log', 'w', encoding='utf-8') as f:
                        f.write(err_full)
                except Exception: pass
                friendly_error = str(e)
                if '无法启动扫码浏览器' not in friendly_error:
                    friendly_error = f'浏览器异常：{friendly_error[:200]}'
                if session_id:
                    state.scan_status[session_id] = 'error'
                    state.scan_errors[session_id] = friendly_error[:360]
                    state.scan_cancelled.discard(session_id)
                    if session_id in state.active_sessions: del state.active_sessions[session_id]
                if page:
                    try: await page.close()
                    except Exception: pass
                if context:
                    await _safe_close_context(context, scan_profile_dir, f'{platform or "scan"}/exception')
                if use_sse:
                    queue.put(json.dumps({'type':'error','data':f'浏览器异常：{str(e)[:200]}'}))

        asyncio.run(_run())
    return login_worker
