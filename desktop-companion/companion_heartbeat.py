"""
companion_heartbeat.py — 伴侣监控中心心跳上报

每 45 秒向披星云服务器上报伴侣自身运行状态（设备信息、当前任务、
各平台登录状态、最近采集/同步结果、最近错误、自动更新状态、
自身进程 CPU/内存/运行时长）。

隐私边界（铁律）：
  1. 只上报伴侣自身进程与任务状态；绝不采集用户其他软件、浏览历史、
     网页内容、屏幕内容。
  2. 服务端只做展示与告警；伴侣不提供任何远程杀进程/卸载等控制接口。
"""
import atexit
import getpass
import os
import socket
import threading
import time
import uuid

import companion_state as state

HEARTBEAT_INTERVAL_SECONDS = 45
POST_TIMEOUT_SECONDS = 12
FIRST_HEARTBEAT_DELAY_SECONDS = 10

_lock = threading.Lock()

# ── 上报快照（由采集/同步模块调用更新） ──
_last_collection = {
    'success': None, 'accountCount': 0, 'errorCode': '', 'message': '',
    'startedAt': None, 'endedAt': None,
}
_last_sync = {
    'success': None, 'uploadCount': 0, 'errorCode': '', 'kind': '',
    'storeId': '', 'storeName': '', 'at': None,
}
_last_error = {'errorCode': '', 'message': '', 'at': None}
_http_error_counts = {'count403': 0, 'count404': 0, 'count500': 0}
_process_started_at = time.time()

# 错误增量侦测：跟踪上次看到的采集/抖店错误值，变化时才记录
_last_seen_collector_error = None
_last_seen_doudian_error = None

# 任务起始时间跟踪（idle -> 非idle 切换时打点）
_task_state = {'status': 'idle', 'startedAt': None}

# ── Phase 2: 运行周期 / 进度时间戳 ──
_BOOT_ID = uuid.uuid4().hex      # 每次进程启动生成一次，区分运行周期
_SEQ = 0                          # 心跳序号，本进程内单调递增
_last_progress_at = None          # 任务最近一次有进展的时间（ISO）
_last_seen_task_detail = None     # 上次看到的任务详情快照（用于检测进展）
_shutdown_beacon_registered = False


def _now_iso() -> str:
    return time.strftime('%Y-%m-%dT%H:%M:%S')


def _next_seq() -> int:
    """本进程内单调递增的心跳序号（发送一次 +1，即使发送失败也递增）。"""
    global _SEQ
    with _lock:
        _SEQ += 1
        return _SEQ


def record_collection(success, account_count=0, error_code='', message='', started_at=None):
    """采集结束打点：由采集器在成功/失败收尾时调用。"""
    with _lock:
        _last_collection.update({
            'success': bool(success),
            'accountCount': int(account_count or 0),
            'errorCode': str(error_code or '')[:80],
            'message': str(message or '')[:300],
            'startedAt': started_at,
            'endedAt': _now_iso(),
        })


def record_sync(success, upload_count=0, error_code='', kind='', store_id='', store_name=''):
    """同步/上传结束打点：由抖店同步等模块在成功/失败收尾时调用。"""
    with _lock:
        _last_sync.update({
            'success': bool(success),
            'uploadCount': int(upload_count or 0),
            'errorCode': str(error_code or '')[:80],
            'kind': str(kind or ''),
            'storeId': str(store_id or ''),
            'storeName': str(store_name or '')[:120],
            'at': _now_iso(),
        })


def record_error(error_code, message):
    with _lock:
        _last_error.update({
            'errorCode': str(error_code or '')[:80],
            'message': str(message or '')[:300],
            'at': _now_iso(),
        })


def note_http_error(status_code):
    """服务端响应 403/404/500 计数（install_companion_request_headers 中调用）。"""
    key = 'count' + str(status_code)
    with _lock:
        _http_error_counts[key] = _http_error_counts.get(key, 0) + 1


def get_device_id_cached():
    try:
        from companion_config import get_device_id
        return str(get_device_id() or '')
    except Exception:
        return ''


def get_device_name():
    try:
        return socket.gethostname() or ''
    except Exception:
        return ''


def get_login_user():
    try:
        return getpass.getuser() or ''
    except Exception:
        return ''


def _collect_resources():
    """自身进程资源：只读自己的 PID，绝不扫描系统进程。"""
    info = {
        'pid': os.getpid(),
        'cpuPercent': None,
        'memoryMb': None,
        'processUptimeSeconds': int(time.time() - _process_started_at),
    }
    try:
        import psutil
        proc = psutil.Process(os.getpid())
        info['cpuPercent'] = round(float(proc.cpu_percent(interval=None) or 0), 2)
        info['memoryMb'] = round(float(proc.memory_info().rss) / 1024.0 / 1024.0, 1)
        try:
            info['processUptimeSeconds'] = max(0, int(time.time() - proc.create_time()))
        except Exception:
            pass
    except Exception:
        pass
    return info


def _collect_update_status():
    try:
        from companion_updater import _get_update_status
        status = _get_update_status() or {}
        return {
            'state': str(status.get('phase') or 'idle'),
            'running': bool(status.get('running')),
            'targetVersion': str(status.get('target_version') or ''),
            'error': str(status.get('error') or '')[:200],
        }
    except Exception:
        return {'state': 'idle', 'running': False, 'targetVersion': '', 'error': ''}


def _collect_task():
    """推断当前任务：updating > syncing > collecting > queued(视频剪辑) > idle。"""
    try:
        from companion_updater import _get_update_status
        status = _get_update_status() or {}
        if status.get('running'):
            return 'updating', {'kind': 'auto_update', 'targetVersion': str(status.get('target_version') or '')}
    except Exception:
        pass
    try:
        if state._doudian_sync_lock.locked():
            detail = dict(getattr(state, '_doudian_active_task', None) or {})
            return 'syncing', detail
    except Exception:
        pass
    try:
        if state._collector_running or state._collector_lock.locked():
            progress = dict(getattr(state, '_collector_progress', {}) or {})
            detail = {
                'kind': 'collection',
                'nickname': str(progress.get('nickname') or '')[:60],
                'mode': str(progress.get('mode') or ''),
                'current': int(progress.get('current') or 0),
                'total': int(progress.get('total') or 0),
            }
            return 'collecting', detail
    except Exception:
        pass
    try:
        from pixing_worker import get_status
        if (get_status() or {}).get('running'):
            return 'queued', {'kind': 'video_edit'}
    except Exception:
        pass
    return 'idle', {}


def _collect_platform_summary():
    """各平台登录状态：抖音/快手/小红书/视频号（本地账号）+ 抖店（本地店铺）。"""
    summary = {}
    _ALIAS = {'TENCENT': 'WECHAT_VIDEO', 'WEIXIN': 'WECHAT_VIDEO',
              'DOU_YIN': 'DOUYIN', 'DOUDIAN': 'DOUDIAN'}
    # 1) 账号平台
    try:
        from local_db import get_all_accounts
        accounts = get_all_accounts(include_expired=True) or []
    except Exception:
        accounts = []
    buckets = {}
    for acc in accounts:
        platform = str(acc.get('platform') or '').strip().upper()
        platform = _ALIAS.get(platform, platform)
        if not platform:
            continue
        bucket = buckets.setdefault(platform, {'total': 0, 'active': 0, 'expired': 0})
        bucket['total'] += 1
        acc_status = str(acc.get('status') or '').strip().lower()
        if acc_status in ('expired', 'error', 'disabled'):
            bucket['expired'] += 1
        else:
            bucket['active'] += 1
    for platform_key, bucket in buckets.items():
        if bucket['total'] <= 0:
            continue
        if bucket['active'] > 0:
            status = 'ok'
        elif bucket['expired'] >= bucket['total']:
            status = 'expired'
        else:
            status = 'error'
        summary[platform_key] = {
            'accountCount': bucket['total'],
            'expiredCount': bucket['expired'],
            'status': status,
        }
    # 2) 抖店店铺
    try:
        from companion_config import _get_config_cache
        stores = _get_config_cache().get('doudian_stores') or []
        if not isinstance(stores, list):
            stores = []
    except Exception:
        stores = []
    bucket = {'total': 0, 'active': 0, 'expired': 0}
    for store in stores:
        if not isinstance(store, dict):
            continue
        bucket['total'] += 1
        login_state = str(store.get('login_state') or '').strip().lower()
        if login_state in ('online', 'ok', 'active'):
            bucket['active'] += 1
        else:
            bucket['expired'] += 1
    if bucket['total'] > 0:
        status = 'ok' if bucket['active'] > 0 else 'expired'
        summary['DOUDIAN'] = {
            'accountCount': bucket['total'],
            'expiredCount': bucket['expired'],
            'status': status,
        }
    return summary


def note_task_progress(task, detail):
    """任务进展检测：任务详情快照变化即视为有进展，更新 lastProgressAt。

    由 _build_payload 每次心跳时调用；长时间无进展 = 快照一直不变。
    """
    global _last_progress_at, _last_seen_task_detail
    with _lock:
        if task != 'idle':
            if detail != _last_seen_task_detail:
                _last_progress_at = _now_iso()
                _last_seen_task_detail = detail
        else:
            _last_progress_at = None
            _last_seen_task_detail = None


def _collect_ui_diagnostic():
    """UI 模式与启动诊断：为什么某台电脑以浏览器形式打开。"""
    diagnostic = {
        'uiMode': str(getattr(state, '_ui_mode', 'unknown') or 'unknown'),
        'fallbackReason': str(getattr(state, '_ui_fallback_reason', None) or ''),
        'fallbackAt': str(getattr(state, '_ui_fallback_at', None) or ''),
        'webview2RuntimeVersion': str(getattr(state, '_webview2_runtime_version', None) or ''),
    }
    try:
        from companion_runtime import get_diagnostic
        diagnostic['runtime'] = get_diagnostic()
    except Exception:
        pass
    return diagnostic


def _collect_runtime_diagnostic():
    """Return local transport evidence without collecting unrelated machine data."""
    try:
        from companion_network import get_network_diagnostics
        return get_network_diagnostics()
    except Exception:
        return {}


def _detect_state_errors():
    """侦测采集/抖店错误变化，变化时记录 lastError。"""
    global _last_seen_collector_error, _last_seen_doudian_error
    collector_error = str(getattr(state, '_collector_last_error', None) or '')
    if collector_error and collector_error != _last_seen_collector_error:
        record_error('COLLECT_FAIL', collector_error)
    _last_seen_collector_error = collector_error
    doudian_error = str(getattr(state, '_doudian_last_error', None) or '')
    if doudian_error and doudian_error != _last_seen_doudian_error:
        record_error('DOUDIAN_SYNC_FAIL', doudian_error)
    _last_seen_doudian_error = doudian_error


def _build_payload():
    with _lock:
        collection = dict(_last_collection)
        sync = dict(_last_sync)
        error = dict(_last_error)
        http_errors = dict(_http_error_counts)
    task, detail = _collect_task()
    note_task_progress(task, detail)
    with _lock:
        if task != 'idle':
            if _task_state['status'] == 'idle':
                _task_state['startedAt'] = _now_iso()
        else:
            _task_state['startedAt'] = None
        _task_state['status'] = task
        task_started_at = _task_state['startedAt']
        last_progress_at = _last_progress_at
    return {
        'deviceId': get_device_id_cached(),
        'deviceName': get_device_name(),
        'loginUser': get_login_user(),
        'companionVersion': state.APP_VERSION,
        'startedAt': time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(_process_started_at)),
        'bootId': _BOOT_ID,
        'seq': _next_seq(),
        'taskStatus': task,
        'taskDetail': detail,
        'taskStartedAt': task_started_at,
        'lastProgressAt': last_progress_at,
        'uiMode': str(getattr(state, '_ui_mode', 'unknown') or 'unknown'),
        'startupDiagnostic': _collect_ui_diagnostic(),
        'networkDiagnostic': _collect_runtime_diagnostic(),
        'platformSummary': _collect_platform_summary(),
        'lastCollection': collection,
        'lastSync': sync,
        'lastError': error,
        'update': _collect_update_status(),
        'recentHttpErrors': http_errors,
        'resources': _collect_resources(),
    }


def _load_api():
    try:
        from companion_config import _get_config_cache
        cfg = _get_config_cache()
        return (
            str(cfg.get('api_url') or 'https://ddddkiii.com/api/v1').rstrip('/'),
            str(cfg.get('token') or ''),
        )
    except Exception:
        return ('', '')


def _send_heartbeat():
    api_url, token = _load_api()
    if not api_url:
        return False
    if not token:
        return False
    payload = _build_payload()
    url = api_url + '/companion-monitor/heartbeat'
    try:
        from companion_network import request_with_network_fallback
        resp = request_with_network_fallback(
            'POST', url, channel='heartbeat',
            json=payload,
            headers={'Authorization': 'Bearer ' + token},
            timeout=POST_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        record_error('HEARTBEAT_NETWORK', str(exc)[:200])
        return False
    if resp.status_code in (200, 201):
        try:
            from companion_runtime import mark_phase
            mark_phase('heartbeat_ok', lastHeartbeatAt=_now_iso())
        except Exception:
            pass
        with _lock:
            _http_error_counts.update({'count403': 0, 'count404': 0, 'count500': 0})
            # 心跳网络/鉴权/内部错误都是心跳链路的瞬时错误：心跳恢复成功后清除，
            # 避免监控中心一直显示一条已经自愈的旧错误。采集、同步等业务错误保留。
            if str(_last_error.get('errorCode') or '').startswith('HEARTBEAT_'):
                _last_error.update({'errorCode': '', 'message': '', 'at': None})
        return True
    if resp.status_code == 401:
        record_error('HEARTBEAT_401', '心跳上报未授权，尝试刷新登录态')
        try:
            from companion_auth import _check_and_refresh_token
            _check_and_refresh_token()
        except Exception:
            pass
    elif resp.status_code >= 400:
        record_error('HEARTBEAT_HTTP', f'心跳上报 HTTP {resp.status_code}')
    return False


def send_shutdown_heartbeat():
    """优雅退出信标：进程正常退出前尽力发送最后一次心跳（exitState=clean）。

    崩溃/强杀时 atexit 不会运行 → 服务端据此识别异常退出。
    """
    try:
        with _lock:
            if _SEQ <= 0:
                return  # 一次心跳都没发过（如未登录），不发信标
        api_url, token = _load_api()
        if not api_url or not token:
            return
        payload = _build_payload()
        payload['exitState'] = 'clean'
        from companion_network import request_with_network_fallback
        request_with_network_fallback(
            'POST', api_url + '/companion-monitor/heartbeat', channel='heartbeat_shutdown',
            json=payload,
            headers={'Authorization': 'Bearer ' + token},
            timeout=5,
        )
    except Exception:
        pass


def register_shutdown_beacon():
    """注册优雅退出信标（幂等）。"""
    global _shutdown_beacon_registered
    with _lock:
        if _shutdown_beacon_registered:
            return
        _shutdown_beacon_registered = True
    atexit.register(send_shutdown_heartbeat)


def _heartbeat_loop():
    time.sleep(FIRST_HEARTBEAT_DELAY_SECONDS)
    while True:
        try:
            _detect_state_errors()
            _send_heartbeat()
        except Exception as exc:
            try:
                record_error('HEARTBEAT_INTERNAL', str(exc)[:200])
            except Exception:
                pass
        time.sleep(HEARTBEAT_INTERVAL_SECONDS)


def start_heartbeat_thread():
    """启动心跳线程（daemon，随主进程退出），并注册优雅退出信标。"""
    register_shutdown_beacon()
    thread = threading.Thread(target=_heartbeat_loop, daemon=True, name='CompanionHeartbeat')
    thread.start()
    print('[Heartbeat] 伴侣监控心跳线程已启动（每45秒上报自身状态）')
