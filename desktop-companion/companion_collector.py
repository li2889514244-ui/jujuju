"""
companion_collector.py — Data collection orchestration: run collection, schedule, loop.
"""
import asyncio, time, threading, json, base64

import companion_state as state
from companion_config import _load_config, _save_config
from companion_auth import _login_with_saved_credentials
from companion_metrics import (
    _scrape_all, _sanitize_text, _parse_metric_num,
    _METRIC_PATTERNS, _STORE_METRIC_PATTERNS,
    _extract_douyin_overview_metrics, _get_page_text,
    PLATFORM_DASHBOARDS,
)

_DEFAULT_QUICK_MAX_POSTS = state._DEFAULT_QUICK_MAX_POSTS
_POST_STATS_BATCH_SIZE = 80
_STALE_STARTUP_COLLECT_SECONDS = 15 * 60


def _is_local_or_missing_uid(value) -> bool:
    text = str(value or '').strip()
    return not text or text.startswith('local:')


def _is_unsafe_nickname_fallback(platform, value) -> bool:
    text = str(value or '').strip()
    if not text:
        return True
    if text in {
        '视频号', '视频号助手', '微信', '抖音', '快手', '小红书',
        '创作者中心', '创作者服务平台', '内容管理', '数据中心', '首页',
        # 页面 UI 模块/导航标题
        '最近视频', '最近作品', '视频数据', '数据概览', '内容数据', '作品数据',
        '今日数据', '数据趋势', '热门视频', '视频列表', '作品列表', '全部视频',
        '全部作品', '视频明细', '粉丝数据', '观众数据', '直播数据', '商品数据',
        '订单数据', '账号概览', '内容洞察', '互动管理', '图文数据', '视频动态',
        '视频号动态', '作品发布', '发布作品', '发布高清视频', '发布全景视频',
        '发布图文', '发布文章', '智能创作', 'AI分身', 'AI工坊', '创作服务',
        '创作中心', '收入变现', '活动中心', '通知', '查看全部', '更多',
    }:
        return True
    return platform == 'WECHAT_VIDEO' and text.startswith('sph') and len(text) >= 12


def _normalize_post_stat_item(post: dict) -> dict:
    """Carry stable post ids through old and new backend field names."""
    if not isinstance(post, dict):
        return {}
    normalized = dict(post)
    content_id = (
        normalized.get('id')
        or normalized.get('content_id')
        or normalized.get('contentId')
        or normalized.get('contentID')
        or normalized.get('aweme_id')
        or normalized.get('awemeId')
        or ''
    )
    if content_id:
        content_id = str(content_id).strip()
        normalized['id'] = content_id
        normalized['content_id'] = content_id
        normalized['contentId'] = content_id
    if normalized.get('cover_url') and not normalized.get('coverUrl'):
        normalized['coverUrl'] = normalized.get('cover_url')
    return normalized


def _default_response_ok(resp) -> bool:
    if not resp or getattr(resp, 'status_code', 500) >= 400:
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


def report_post_stats_in_batches(
    *,
    account_id: str,
    posts: list,
    send_batch,
    response_ok=None,
    should_abort=None,
    batch_size: int = _POST_STATS_BATCH_SIZE,
    log_prefix: str = '[DC]',
) -> dict:
    """Upload post stats in bounded chunks to avoid 413 payload errors.

    ``send_batch`` receives a list of posts and returns the HTTP response.
    On 413, the failing chunk is split again so large accounts can still sync.
    """
    response_ok = response_ok or _default_response_ok
    posts = [_normalize_post_stat_item(post) for post in list(posts or [])]
    total = len(posts)
    result = {'total': total, 'sent': 0, 'failed': 0, 'cancelled': False, 'errors': []}
    if not total:
        return result

    batch_size = max(1, int(batch_size or _POST_STATS_BATCH_SIZE))
    pending = [(idx, posts[idx:idx + batch_size]) for idx in range(0, total, batch_size)]

    while pending:
        if callable(should_abort) and should_abort():
            result['cancelled'] = True
            result['errors'].append('cancelled')
            print(f'{log_prefix} Post stats upload cancelled for {account_id}: {result["sent"]}/{total} sent')
            break
        start, batch = pending.pop(0)
        end = start + len(batch)
        try:
            resp = send_batch(batch)
            if response_ok(resp):
                result['sent'] += len(batch)
                print(f'{log_prefix} Post stats uploaded {account_id}: {end}/{total} (+{len(batch)})')
                continue

            status_code = getattr(resp, 'status_code', 0)
            body = getattr(resp, 'text', '')[:200]
            if status_code == 413 and len(batch) > 1:
                mid = len(batch) // 2
                print(
                    f'{log_prefix} Post stats batch too large for {account_id}: '
                    f'{start + 1}-{end}, splitting into {mid} + {len(batch) - mid}'
                )
                pending.insert(0, (start + mid, batch[mid:]))
                pending.insert(0, (start, batch[:mid]))
                continue

            result['failed'] += len(batch)
            result['errors'].append(f'{start + 1}-{end} HTTP {status_code} {body}')
        except Exception as e:
            result['failed'] += len(batch)
            result['errors'].append(f'{start + 1}-{end} {type(e).__name__}: {str(e)[:180]}')

    # Phase 2: 同步打点——只有真正发起了上传才记录成功/失败，
    # 没有内容可传（sent=0 且 failed=0）不记录（保持 lastSync 为 null 语义）。
    if result['sent'] > 0 or result['failed'] > 0:
        try:
            from companion_heartbeat import record_sync
            record_sync(
                success=(result['failed'] == 0),
                upload_count=result['sent'],
                error_code='' if result['failed'] == 0 else (str(result['errors'][0])[:80] if result['errors'] else 'UPLOAD_FAIL'),
                kind='post_stats',
                store_id='',
                store_name='',
            )
        except Exception:
            pass

    return result


def _jwt_seconds_remaining(token: str) -> int | None:
    """Return seconds until JWT expiry without requiring PyJWT."""
    try:
        if not token or token.count('.') < 2:
            return None
        payload = token.split('.')[1]
        payload += '=' * (-len(payload) % 4)
        decoded = json.loads(base64.urlsafe_b64decode(payload.encode()).decode('utf-8'))
        exp = int(decoded.get('exp') or 0)
        return int(exp - time.time())
    except Exception:
        return None


def _record_scan_time(platform_key: str):
    """Record last successful scan time for a platform"""
    cfg = _load_config()
    scans = cfg.get('last_scan_times', {})
    scans[platform_key] = time.time()
    cfg['last_scan_times'] = scans
    _save_config(cfg)
    state._CONFIG_CACHE.clear()
    state._CONFIG_CACHE.update(cfg)


def _get_cookie_status() -> dict:
    """Returns dict of platform -> hours since last scan"""
    cfg = _load_config()
    scans = cfg.get('last_scan_times', {})
    now = time.time()
    result = {}
    for platform_key in state.PLATFORMS:
        last = scans.get(platform_key, 0)
        hours = (now - last) / 3600 if last else 999
        result[platform_key] = round(hours, 1)
    return result


def _schedule_next_collection(delay_seconds: int | None = None) -> int:
    """Set the next scheduled full collection timestamp and return delay seconds."""
    interval = int(delay_seconds if delay_seconds is not None else _get_collection_interval())
    interval = max(5, interval)
    state._collector_schedule_interval = interval
    state._collector_next_run_at = time.time() + interval
    return interval


def _has_stale_collectable_accounts(threshold_seconds: int = _STALE_STARTUP_COLLECT_SECONDS) -> bool:
    try:
        from datetime import datetime, timezone
        from local_db import get_all_accounts

        now = time.time()
        accounts = get_all_accounts(include_expired=True)
        for account in accounts:
            status = str(account.get('status') or '').strip().lower()
            if status and status not in {'active', 'online'}:
                continue
            collected_at = str(account.get('last_collected_at') or '').strip()
            if not collected_at:
                return True
            try:
                parsed = datetime.strptime(collected_at, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
                if now - parsed.timestamp() > threshold_seconds:
                    return True
            except Exception:
                return True
    except Exception as exc:
        print(f'[DC] Startup stale check failed: {str(exc)[:120]}')
    return False


def _run_startup_collection_if_stale(delay_seconds: int = 20):
    time.sleep(max(0, int(delay_seconds)))
    if state._collector_running:
        print('[DC] Startup stale collection skipped: collection already running')
        return
    if not _has_stale_collectable_accounts():
        print('[DC] Startup stale collection skipped: recent successful collection exists')
        return
    print('[DC] Startup stale collection triggered')
    _run_collection_once(0, 'full', 'startup_stale')


def _run_collection_once(
    max_posts: int = _DEFAULT_QUICK_MAX_POSTS,
    collection_mode: str = 'full',
    trigger_type: str = 'manual',
    platform_filter=None,
):
    if not state._collector_lock.acquire(blocking=False):
        state._collector_last_error = 'Collection already running'
        print('[DC] Collection already running, skipping duplicate trigger')
        return

    state._collector_running = True
    collection_mode = (collection_mode or 'quick').strip().lower()
    if collection_mode not in {'quick', 'full'}:
        collection_mode = 'quick'
    try:
        max_posts = int(max_posts)
    except Exception:
        max_posts = _DEFAULT_QUICK_MAX_POSTS
    if collection_mode == 'quick':
        max_posts = max_posts if max_posts > 0 else _DEFAULT_QUICK_MAX_POSTS
    else:
        max_posts = max_posts if max_posts >= 0 else 0
    state._collector_progress['mode'] = collection_mode
    state._collector_progress['max_posts'] = max_posts
    run_id = None
    accounts_total = 0
    reported = 0
    video_reported = 0
    report_failures = 0
    platform_aliases = {
        'DOUYIN': 'DOUYIN',
        'DOU_YIN': 'DOUYIN',
        'WECHAT_VIDEO': 'WECHAT_VIDEO',
        'TENCENT': 'WECHAT_VIDEO',
        'WEIXIN': 'WECHAT_VIDEO',
        'WECHAT': 'WECHAT_VIDEO',
        'SHIPINHAO': 'WECHAT_VIDEO',
    }
    if isinstance(platform_filter, str):
        raw_platform_filters = [p.strip() for p in platform_filter.split(',') if p.strip()]
    elif isinstance(platform_filter, (list, tuple, set)):
        raw_platform_filters = [str(p).strip() for p in platform_filter if str(p).strip()]
    else:
        raw_platform_filters = []
    platform_filters = {
        platform_aliases.get(p.upper(), p.upper())
        for p in raw_platform_filters
    }

    def is_suspicious_collected_nickname(value) -> bool:
        text = str(value or '').strip()
        noise_values = {
            '\u89c6\u9891\u53f7',
            '\u89c6\u9891\u53f7\u52a9\u624b',
            '\u5fae\u4fe1',
            '\u5185\u5bb9\u7ba1\u7406',
            '\u6570\u636e\u4e2d\u5fc3',
            '\u5173\u6ce8\u8005',
            '\u6628\u65e5\u6570\u636e',
            '\u7533\u8bf7\u8ba4\u8bc1',
            # 页面 UI 模块/导航标题，绝不能被当作昵称
            '\u6700\u8fd1\u89c6\u9891',
            '\u6700\u8fd1\u4f5c\u54c1',
            '\u89c6\u9891\u6570\u636e',
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
            '\u4f5c\u54c1\u53d1\u5e03',
            '\u53d1\u5e03\u4f5c\u54c1',
            '\u53d1\u5e03\u9ad8\u6e05\u89c6\u9891',
            '\u53d1\u5e03\u5168\u666f\u89c6\u9891',
            '\u53d1\u5e03\u56fe\u6587',
            '\u53d1\u5e03\u6587\u7ae0',
            '\u667a\u80fd\u521b\u4f5c',
            'AI\u5206\u8eab',
            'AI\u5de5\u574a',
            '\u521b\u4f5c\u670d\u52a1',
            '\u521b\u4f5c\u4e2d\u5fc3',
            '\u6536\u5165\u53d8\u73b0',
            '\u6d3b\u52a8\u4e2d\u5fc3',
            '\u901a\u77e5',
            '\u67e5\u770b\u5168\u90e8',
            '\u66f4\u591a',
        }
        if text in noise_values:
            return True
        legal_markers = (
            '有限公司',
            '有限责任公司',
            '股份有限公司',
            '集团有限公司',
            '文化有限公司',
            '科技有限公司',
        )
        return any(marker in text for marker in legal_markers)

    def is_safe_avatar_url(value) -> bool:
        text = str(value or '').strip()
        if not text or len(text) > 2000:
            return False
        lower = text.lower()
        if not (lower.startswith('http://') or lower.startswith('https://')):
            return False
        if (
            'channels.weixin.qq.com/platform' in lower
            or 'finder.video.qq.com/platform' in lower
            or '/data-center' in lower
            or '/post/list' in lower
            or '/statistic/' in lower
        ):
            return False
        image_hosts = (
            'qlogo.cn',
            'qpic.cn',
            'headimg',
            'douyinpic.com',
            'byteimg.com',
            'xhscdn.com',
            'kuaishou.com',
            'kwaicdn.com',
        )
        image_exts = ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif')
        return (
            any(marker in lower for marker in image_hosts)
            or any(lower.split('?')[0].endswith(ext) for ext in image_exts)
            or 'avatar' in lower
            or 'headimage' in lower
            or 'headimgurl' in lower
        )

    print('[DC] Stage 1: lock acquired, loading config', flush=True)
    try:
        cfg = _load_config()
        print(f'[DC] Stage 1a: config loaded, api_url={cfg.get("api_url","?")[:30]}', flush=True)
        state._CONFIG_CACHE.clear()
        state._CONFIG_CACHE.update(cfg)
        api_url = cfg.get('api_url', '').rstrip('/')
        token = cfg.get('token', '')

        if not api_url or not token:
            state._collector_last_error = 'No backend token; running local-only collection'

        if api_url and not token:
            token = _login_with_saved_credentials(cfg)

        from local_db import (
            finish_collection_run,
            get_all_accounts,
            get_current_online_account,
            get_profile_path,
            start_collection_run,
            update_collection_time,
            update_nickname,
        )
        import requests
        # 出站 HTTP 全部直连：requests 默认会读取 Windows 系统代理
        # （Clash/VPN 等），代理节点故障时上传会被 TCP RST 打断。
        _http = requests.Session()
        _http.trust_env = False

        def refresh_backend_token(reason: str = '') -> str:
            nonlocal token, cfg
            fresh = _login_with_saved_credentials(cfg)
            if fresh:
                token = fresh
                cfg['token'] = fresh
                state._CONFIG_CACHE.update(cfg)
                remaining = _jwt_seconds_remaining(fresh)
                print(f'[DC] Backend token refreshed{f" ({reason})" if reason else ""}, remaining={remaining}s')
                return fresh
            print(f'[DC] Backend token refresh failed{f" ({reason})" if reason else ""}')
            return ''

        remaining = _jwt_seconds_remaining(token)
        if api_url and token and remaining is not None and remaining < 15 * 60:
            refresh_backend_token(f'expires in {remaining}s before collection')

        def post_json_with_retry(url, payload, headers=None, timeout=30, attempts=3):
            last_error = None
            for attempt in range(1, attempts + 1):
                try:
                    req_headers = dict(headers or {})
                    if token and 'Authorization' not in req_headers:
                        req_headers['Authorization'] = f'Bearer {token}'
                    resp = _http.post(url, json=payload, headers=req_headers, timeout=timeout)
                    if resp.status_code == 401 and refresh_backend_token('HTTP 401'):
                        req_headers['Authorization'] = f'Bearer {token}'
                        resp = _http.post(url, json=payload, headers=req_headers, timeout=timeout)
                    return resp
                except Exception as e:
                    last_error = e
                    if attempt < attempts:
                        time.sleep(min(2 * attempt, 5))
            raise last_error

        # Get all bound accounts from local DB (including expired)
        local_accounts = get_all_accounts(include_expired=True)
        if platform_filters:
            before_count = len(local_accounts)
            local_accounts = [
                acc for acc in local_accounts
                if (acc.get('platform') or '').strip().upper() in platform_filters
            ]
            print(
                f'[DC] Platform filter {sorted(platform_filters)}: '
                f'{len(local_accounts)}/{before_count} local accounts selected',
                flush=True,
            )
        current_wechat_account_id = get_current_online_account('WECHAT_VIDEO')
        local_account_by_id = {
            (acc.get('id') or '').strip(): acc
            for acc in local_accounts
            if acc.get('id')
        }
        print(f'[DC] Stage 1b: got {len(local_accounts)} local accounts', flush=True)
        if not local_accounts:
            state._collector_last_error = 'No active accounts to collect'
            print('[DC] No active accounts to collect; skipping run record', flush=True)
            return

        run_id = start_collection_run(collection_mode, max_posts, trigger_type)

        backend_account_ids = {}
        print(f'[DC] Stage 2: fetching remote accounts from API...', flush=True)
        if api_url and token:
            def extract_accounts(resp):
                try:
                    body = resp.json()
                except Exception:
                    return []
                inner = body.get('data') if isinstance(body, dict) else body
                if isinstance(inner, dict):
                    return inner.get('accounts') or inner.get('list') or []
                return inner if isinstance(inner, list) else []

            def fetch_remote_accounts(current_token: str):
                headers = {'Authorization': f'Bearer {current_token}'}
                endpoints = (
                    f'{api_url}/platforms/accounts?take=200',
                    f'{api_url}/accounts?limit=200',
                )
                accounts = []
                last_resp = None
                seen_ids = set()
                for url in endpoints:
                    resp = _http.get(url, headers=headers, timeout=15)
                    last_resp = resp
                    if resp.status_code >= 400:
                        print(f'[DC] Remote accounts HTTP {resp.status_code} for {url}')
                        continue
                    for account in extract_accounts(resp):
                        account_id = (account.get('id') or '').strip() if isinstance(account, dict) else ''
                        if account_id and account_id not in seen_ids:
                            seen_ids.add(account_id)
                            accounts.append(account)
                return last_resp, accounts

            try:
                remote_resp, remote_accounts = fetch_remote_accounts(token)
                if remote_resp.status_code == 401:
                    fresh_token = _login_with_saved_credentials(cfg)
                    if fresh_token:
                        token = fresh_token
                        remote_resp, remote_accounts = fetch_remote_accounts(token)

                if remote_resp.status_code < 400:
                    print(f'[DC] Got {len(remote_accounts)} remote accounts for mapping')
                    by_platform_uid = {}
                    by_platform_uid_name = {}
                    by_platform_name = {}
                    for remote in remote_accounts or []:
                        remote_id = (remote.get('id') or '').strip()
                        remote_platform = (remote.get('platform') or '').strip().upper()
                        remote_uid = (remote.get('platformUserId') or '').strip()
                        remote_name = (remote.get('nickname') or '').strip()
                        if remote_id and remote_platform and remote_uid:
                            by_platform_uid[(remote_platform, remote_uid)] = remote_id
                            if remote_name:
                                by_platform_uid_name[(remote_platform, remote_uid)] = remote_name
                        if remote_id and remote_platform and remote_name:
                            by_platform_name.setdefault((remote_platform, remote_name), []).append({
                                'id': remote_id,
                                'uid': remote_uid,
                            })

                    for acc in local_accounts:
                        local_id = (acc.get('id') or '').strip()
                        local_platform = (acc.get('platform') or '').strip().upper()
                        local_uid = (acc.get('platform_uid') or '').strip()
                        local_name = (acc.get('nickname') or '').strip()
                        backend_id = by_platform_uid.get((local_platform, local_uid)) if local_uid else None
                        if not backend_id and local_name:
                            candidates = by_platform_name.get((local_platform, local_name), [])
                            legacy_candidates = [
                                item for item in candidates
                                if _is_local_or_missing_uid(item.get('uid')) and _is_local_or_missing_uid(local_uid)
                            ]
                            if (
                                len(legacy_candidates) == 1
                                and not _is_unsafe_nickname_fallback(local_platform, local_name)
                            ):
                                backend_id = legacy_candidates[0]['id']
                                print(
                                    f'[DC] Legacy nickname mapping allowed for {local_platform} '
                                    f'{local_name}: {local_id} -> {backend_id}'
                                )
                            else:
                                print(
                                    f'[DC] Skip nickname-only backend mapping for {local_platform} '
                                    f'{local_name}; candidates={len(candidates)} legacy={len(legacy_candidates)}'
                                )
                        if backend_id:
                            backend_account_ids[local_id] = backend_id
                            remote_name = by_platform_uid_name.get((local_platform, local_uid))
                            if local_platform == 'WECHAT_VIDEO' and is_suspicious_collected_nickname(remote_name):
                                print(f'[DC] Ignored suspicious remote nickname for {local_id}: {remote_name}')
                                remote_name = ''
                            if remote_name and remote_name != local_name:
                                try:
                                    update_nickname(local_id, remote_name)
                                    acc['nickname'] = remote_name
                                    print(f'[DC] Synced local nickname: {local_name} -> {remote_name}')
                                except Exception as e:
                                    print(f'[DC] Local nickname sync failed for {local_id}: {e}')
                            if backend_id != local_id:
                                print(f'[DC] Mapped local account {local_id} -> backend {backend_id}')
                else:
                    print(f'[DC] Cannot fetch backend accounts: HTTP {remote_resp.status_code}')
            except Exception as e:
                print(f'[DC] Backend account mapping failed: {str(e)[:120]}')

        accounts = []
        for acc in local_accounts:
            aid = acc['id']
            nickname = acc.get('nickname', '')
            if (acc.get('platform') or '').upper() == 'WECHAT_VIDEO':
                if not current_wechat_account_id or aid != current_wechat_account_id:
                    print(
                        f'[DC] Skip WECHAT_VIDEO {nickname or aid}: '
                        f'not current online account ({current_wechat_account_id or "none"})'
                    )
                    continue
            accounts.append({
                'id': aid,
                'platform': acc['platform'],
                'nickname': nickname,
            })
        accounts_total = len(accounts)

        print(
            f'[DC] Stage 3: scraping {len(accounts)} accounts from local profiles '
            f'(mode={collection_mode}, max_posts={max_posts})',
            flush=True,
        )
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            scraped = loop.run_until_complete(_scrape_all(
                accounts,
                max_posts=max_posts,
                collection_mode=collection_mode,
            ))
        finally:
            try:
                loop.run_until_complete(loop.shutdown_asyncgens())
            except Exception as _e:
                print(f'[WARN] {type(_e).__name__}: {_e}')
            loop.close()
            asyncio.set_event_loop(None)

        # Check if any account hit a captcha wall
        captcha_accounts = [item for item in scraped if item.get('captcha')]
        if captcha_accounts:
            captcha_names = [
                local_account_by_id.get(item['accountId'], {}).get('nickname', item['accountId'][:12])
                for item in captcha_accounts
            ]
            state._collector_last_error = f'检测到验证码拦截: {", ".join(captcha_names[:3])}{"..." if len(captcha_names) > 3 else ""}。请稍后重试。'
            print(f'[DC] Captcha detected for {len(captcha_accounts)} accounts: {captcha_names}', flush=True)
            # Set a flag the UI can check
            state._collector_progress['captcha'] = True
            state._collector_progress['captcha_names'] = captcha_names[:5]

        def can_report_to_backend(local_account_id, backend_account_id):
            if not api_url or not token or not backend_account_id:
                return False
            if backend_account_ids.get(local_account_id):
                return True
            return not str(backend_account_id).startswith('local_')

        def has_meaningful_payload(item: dict) -> bool:
            if item.get('expired') or item.get('captcha'):
                return False
            raw_metrics = item.get('metrics') if isinstance(item.get('metrics'), dict) else {}
            transient_keys = {'_nickname', '_avatar', '_history', '_api_extra', '_collectorLogs'}
            meaningful_metrics = any(
                key not in transient_keys and value is not None
                for key, value in raw_metrics.items()
            )
            return meaningful_metrics or bool(item.get('videoStats'))

        def report_session_status(local_account_id: str, backend_account_id: str, status: str, reason: str):
            if not can_report_to_backend(local_account_id, backend_account_id):
                return
            try:
                r = post_json_with_retry(
                    f'{api_url}/platforms/report-session-status',
                    {
                        'accountId': backend_account_id,
                        'status': status,
                        'source': 'collection',
                        'reason': reason,
                    },
                    headers={'Authorization': f'Bearer {token}'},
                    timeout=15,
                    attempts=2,
                )
                if r.status_code >= 400:
                    print(f'[DC] Session status report HTTP {r.status_code} for {backend_account_id}: {r.text[:160]}')
            except Exception as e:
                print(f'[DC] Session status report error for {backend_account_id}: {e}')

        def report_collect_status(local_account_id: str, backend_account_id: str, status: str, message: str = ''):
            if not can_report_to_backend(local_account_id, backend_account_id):
                return
            try:
                r = post_json_with_retry(
                    f'{api_url}/platforms/report-collect-status',
                    {
                        'accountId': backend_account_id,
                        'status': status,
                        'message': message[:500],
                    },
                    headers={'Authorization': f'Bearer {token}'},
                    timeout=15,
                    attempts=2,
                )
                if r.status_code >= 400:
                    print(f'[DC] Collect status report HTTP {r.status_code} for {backend_account_id}: {r.text[:160]}')
            except Exception as e:
                print(f'[DC] Collect status report error for {backend_account_id}: {e}')

        for item in scraped:
            local_account_id = item['accountId']
            backend_account_id = backend_account_ids.get(local_account_id, local_account_id)
            can_report = can_report_to_backend(local_account_id, backend_account_id)
            metrics = item.get('metrics') if isinstance(item.get('metrics'), dict) else {}
            has_payload = has_meaningful_payload(item)
            history = metrics.pop('_history', []) if isinstance(metrics, dict) else []

            if item.get('captcha'):
                report_collect_status(local_account_id, backend_account_id, 'FAILED', '采集遇到验证码阻断')
                report_session_status(local_account_id, backend_account_id, 'blocked', '伴侣采集时遇到验证码阻断')
            elif item.get('expired'):
                report_collect_status(local_account_id, backend_account_id, 'FAILED', '采集时检测到登录态失效')
                report_session_status(local_account_id, backend_account_id, 'offline', '伴侣采集时检测到登录态失效')
            elif has_payload:
                report_collect_status(local_account_id, backend_account_id, 'COLLECTING', '伴侣已采集到数据，正在上报')
                report_session_status(local_account_id, backend_account_id, 'online', '伴侣采集到有效数据')

            if has_payload:
                try:
                    from local_db import update_metrics, save_contents, save_history_snapshot
                    update_metrics(local_account_id, metrics)
                    vstats = item.get('videoStats') or []
                    if vstats:
                        save_contents(local_account_id, vstats)
                    save_history_snapshot(local_account_id)
                    update_collection_time(local_account_id)
                    local_acc = local_account_by_id.get(local_account_id, {})
                    if (local_acc.get('platform') or '').upper() == 'WECHAT_VIDEO':
                        total_videos = metrics.get('videos') or metrics.get('video_count') or metrics.get('posts_count') or 0
                        saved_videos = len(vstats)
                        if total_videos:
                            coverage = saved_videos / max(total_videos, 1)
                            missing = max(int(total_videos) - saved_videos, 0)
                            print(
                                f'[DC] WECHAT_VIDEO completeness {local_acc.get("nickname") or local_account_id}: '
                                f'posts={saved_videos}/{total_videos} coverage={coverage:.1%} missing_est={missing}'
                            )
                        elif saved_videos:
                            print(
                                f'[DC] WECHAT_VIDEO completeness {local_acc.get("nickname") or local_account_id}: '
                                f'posts={saved_videos}, dashboard total unavailable'
                            )
                except Exception as e:
                    print(f'[DC] Local save error {local_account_id}: {e}')
            else:
                report_collect_status(local_account_id, backend_account_id, 'FAILED', '本次采集没有拿到有效数据')
                print(f'[DC] No valid payload for {local_account_id}; collection time not updated')

            nickname = metrics.pop('_nickname', None) if isinstance(metrics, dict) else None
            avatar = metrics.pop('_avatar', None) if isinstance(metrics, dict) else None
            if nickname and is_suspicious_collected_nickname(nickname):
                print(f'[DC] Ignored suspicious collected nickname for {local_account_id}: {nickname}')
                nickname = None
            if avatar and not is_safe_avatar_url(avatar):
                print(f'[DC] Ignored suspicious collected avatar for {local_account_id}: {avatar}')
                avatar = None
            if avatar:
                try:
                    from local_db import update_metrics as update_local_metrics
                    update_local_metrics(local_account_id, {'_avatar': avatar})
                except Exception as e:
                    print(f'[DC] Local avatar save failed for {local_account_id}: {e}')
            if nickname:
                try:
                    update_nickname(local_account_id, nickname)
                except Exception as e:
                    print(f'[DC] Local nickname update failed for {local_account_id}: {e}')

            reportable_metrics = bool(metrics) and (
                any(v for v in metrics.values() if isinstance(v, (int, float)))
                or bool(metrics.get('_periodMetrics'))
                or bool(metrics.get('_collectorLogs'))
            )
            if can_report and reportable_metrics:
                payload = {'accountId': backend_account_id,
                           'metrics': {
                               **metrics,
                               **({'_nickname': nickname} if nickname else {}),
                               **({'_avatar': avatar} if avatar else {}),
                           }}
                try:
                    r = post_json_with_retry(
                        f'{api_url}/platforms/report-metrics',
                        payload,
                        headers={'Authorization': f'Bearer {token}'},
                        timeout=30,
                    )
                    if r.status_code < 400:
                        reported += 1
                        update_collection_time(local_account_id)
                    else:
                        report_failures += 1
                        report_collect_status(local_account_id, backend_account_id, 'FAILED', f'指标上报失败 HTTP {r.status_code}')
                        print(
                            f'[DC] Report HTTP {r.status_code} for '
                            f'{local_account_id}->{backend_account_id}: {r.text[:200]}')
                except Exception as e:
                    report_failures += 1
                    report_collect_status(local_account_id, backend_account_id, 'FAILED', f'指标上报异常: {e}')
                    print(f'[DC] Report error {local_account_id}->{backend_account_id}: {e}')

            if can_report and history:
                for hist_entry in history:
                    hist_date = hist_entry.pop('date', None)
                    if not hist_date:
                        continue
                    try:
                        r = post_json_with_retry(
                            f'{api_url}/platforms/report-metrics',
                            {
                                'accountId': backend_account_id,
                                'metrics': hist_entry,
                                'date': hist_date,
                            },
                            headers={'Authorization': f'Bearer {token}'},
                            timeout=30,
                        )
                        if r.status_code >= 400:
                            report_failures += 1
                            print(
                                f'[DC] History report HTTP {r.status_code} for '
                                f'{local_account_id}->{backend_account_id} {hist_date}: {r.text[:200]}')
                    except Exception as e:
                        report_failures += 1
                        print(f'[DC] History report error {local_account_id}->{backend_account_id} {hist_date}: {e}')

        for item in scraped:
            local_account_id = item['accountId']
            backend_account_id = backend_account_ids.get(local_account_id, local_account_id)
            can_report = can_report_to_backend(local_account_id, backend_account_id)
            vstats = item.get('videoStats') or []
            if not vstats:
                continue
            if not can_report:
                print(f'[DC] Skipping backend video report for local-only account {local_account_id}')
                continue
            try:
                upload_result = report_post_stats_in_batches(
                    account_id=backend_account_id,
                    posts=vstats,
                    send_batch=lambda batch, _backend_account_id=backend_account_id: post_json_with_retry(
                        f'{api_url}/platforms/report-post-stats',
                        {'accountId': _backend_account_id, 'posts': batch},
                        headers={'Authorization': f'Bearer {token}'},
                        timeout=30,
                    ),
                    log_prefix='[DC]',
                )
                video_reported += upload_result['sent']
                if upload_result['failed'] == 0:
                    print(
                        f'[DC] Video report complete for '
                        f'{local_account_id}->{backend_account_id}: {upload_result["sent"]}/{len(vstats)}'
                    )
                else:
                    report_failures += 1
                    print(
                        f'[DC] Video report partial failure for '
                        f'{local_account_id}->{backend_account_id}: '
                        f'sent={upload_result["sent"]} failed={upload_result["failed"]} '
                        f'errors={upload_result["errors"][:3]}'
                    )
            except Exception as e:
                report_failures += 1
                print(f'[DC] Video report error {local_account_id}->{backend_account_id}: {e}')

        for item in scraped:
            local_account_id = item['accountId']
            backend_account_id = backend_account_ids.get(local_account_id, local_account_id)
            can_report = can_report_to_backend(local_account_id, backend_account_id)
            m = item.get('metrics', {})
            m.pop('_nickname', None)
            avatar = m.pop('_avatar', None)
            if avatar and not is_safe_avatar_url(avatar):
                print(f'[DC] Ignored suspicious backend avatar for {local_account_id}: {avatar}')
                avatar = None
            if can_report and avatar:
                try:
                    r = _http.put(
                        f'{api_url}/accounts/{backend_account_id}',
                        json={'avatar': avatar},
                        headers={'Authorization': f'Bearer {token}'},
                        timeout=15,
                    )
                    if r.status_code < 400:
                        print(f'[DC] Synced avatar for {local_account_id}->{backend_account_id}')
                except Exception as e:
                    print(f'[DC] Avatar sync error {local_account_id}->{backend_account_id}: {e}')

        cookies_uploaded = 0
        for item in scraped:
            local_account_id = item['accountId']
            backend_account_id = backend_account_ids.get(local_account_id, local_account_id)
            can_report = can_report_to_backend(local_account_id, backend_account_id)
            fresh_cookies = item.get('freshCookies') or []
            if can_report and fresh_cookies and not str(backend_account_id).startswith('local_'):
                try:
                    cookie_list = [
                        {'name': c.get('name',''), 'value': c.get('value',''), 'domain': c.get('domain',''),
                         'path': c.get('path','/'), 'expires': c.get('expires', -1),
                         'httpOnly': c.get('httpOnly', False), 'secure': c.get('secure', False),
                         'sameSite': c.get('sameSite', 'Lax')}
                        for c in fresh_cookies if c.get('name')
                    ]
                    if cookie_list:
                        r = post_json_with_retry(
                            f'{api_url}/accounts/{backend_account_id}/cookies',
                            {'cookies': cookie_list},
                            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                            timeout=15,
                        )
                        if r.status_code == 200:
                            cookies_uploaded += 1
                        else:
                            report_failures += 1
                            print(f'[DC] Cookie upload HTTP {r.status_code} for {backend_account_id}')
                except Exception as e:
                    report_failures += 1
                    print(f'[DC] Cookie upload error for {backend_account_id}: {e}')
        if cookies_uploaded:
            print(f'[DC] Uploaded cookies for {cookies_uploaded} accounts')

        print('[DC] Stage 4: collection complete, saving results', flush=True)
        state._collector_last_run = time.strftime('%Y-%m-%d %H:%M:%S')
        scraped_payload_ids = {
            item.get('accountId', '')
            for item in scraped
            if has_meaningful_payload(item)
        }
        scraped_payloads = len(scraped_payload_ids)
        missing_payload_accounts = [
            acc for acc in local_accounts
            if acc.get('status') != 'deleted' and acc.get('id') not in scraped_payload_ids
        ]
        run_status = 'success'
        run_error = ''
        if report_failures:
            run_status = 'error'
            run_error = f'{report_failures} backend report/upload requests failed'
        elif missing_payload_accounts:
            run_status = 'error'
            names = [
                (acc.get('nickname') or acc.get('id') or '')[:30]
                for acc in missing_payload_accounts[:8]
            ]
            suffix = '...' if len(missing_payload_accounts) > 8 else ''
            run_error = (
                f'{len(missing_payload_accounts)} account(s) returned no valid collected data: '
                f'{", ".join(names)}{suffix}'
            )
        elif accounts_total and scraped_payloads == 0:
            run_status = 'error'
            run_error = 'No account returned valid collected data'
        elif api_url and token and scraped_payloads and reported == 0 and video_reported == 0:
            run_status = 'error'
            run_error = 'No scraped account data was reported to backend'
        state._collector_last_error = run_error or None
        try:
            from companion_heartbeat import record_collection
            record_collection(
                success=(run_status == 'success'),
                account_count=scraped_payloads,
                error_code=('UPLOAD_FAIL' if report_failures else ('NO_PAYLOAD' if run_status == 'error' else '')),
                message=run_error or '',
            )
        except Exception:
            pass
        finish_collection_run(run_id, run_status, accounts_total, reported, video_reported, run_error)
        platform_map = {'DOUYIN':'douyin','XIAOHONGSHU':'xiaohongshu','KUAISHOU':'kuaishou','WECHAT_VIDEO':'tencent'}
        success_account_ids = set()
        for item in scraped:
            if has_meaningful_payload(item):
                success_account_ids.add(item.get('accountId', ''))
        if success_account_ids:
            for acc in local_accounts:
                if acc.get('id') in success_account_ids:
                    key = platform_map.get(acc.get('platform', ''))
                    if key:
                        _record_scan_time(key)
        print(f'[DC] Done: {reported}/{len(scraped)} reported, status={run_status}')
    except Exception as e:
        state._collector_last_error = str(e)
        print(f'[DC] Fatal: {e}')
        try:
            from companion_heartbeat import record_collection
            record_collection(
                success=False,
                account_count=reported,
                error_code='FATAL',
                message=str(e),
            )
        except Exception:
            pass
        try:
            from local_db import finish_collection_run
            finish_collection_run(run_id, 'error', accounts_total, reported, video_reported, str(e))
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')
    finally:
        state._collector_running = False
        state._collector_lock.release()


def _get_collection_interval() -> int:
    now = time.localtime()
    hour = now.tm_hour
    if 8 <= hour < 20:
        return 30 * 60
    else:
        target = time.struct_time((now.tm_year, now.tm_mon, now.tm_mday, 8, 0, 0,
                                   now.tm_wday, now.tm_yday, now.tm_isdst))
        target_ts = time.mktime(target)
        if hour >= 20:
            target_ts += 86400
        return max(60, int(target_ts - time.mktime(now)))


def _data_collector_loop():
    if _load_config().get('auto_collect_on_start') is not True:
        state._collector_next_run_at = None
        state._collector_paused = True
    elif state._collector_next_run_at is None:
        _schedule_next_collection()
    while True:
        if _load_config().get('auto_collect_on_start') is not True:
            state._collector_next_run_at = None
            state._collector_paused = True
            time.sleep(5)
            continue
        wait_seconds = (state._collector_next_run_at or 0) - time.time()
        if wait_seconds > 0:
            time.sleep(min(5, max(1, wait_seconds)))
            continue
        if state._collector_paused:
            interval = _schedule_next_collection()
            print(f'[DC] 采集已暂停，推迟 {interval // 60} 分钟')
            continue
        try:
            _run_collection_once(
                0,
                'full',
                'scheduled',
            )
        except Exception as e:
            print(f'[DC] Loop error: {e}')
        interval = _schedule_next_collection()
        print(
            f'[DC] Next scheduled full collection '
            f'in {interval // 60} min (hour={time.localtime().tm_hour})'
        )
