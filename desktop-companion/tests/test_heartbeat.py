"""
test_heartbeat.py — 伴侣监控中心心跳 Phase 2 回归测试

覆盖：
  1. bootId 进程内稳定、seq 单调递增（防旧心跳覆盖的服务端前置条件）
  2. record_sync 成功/失败打点（含 success=false 的失败路径语义）
  3. record_collection 打点
  4. 任务进展检测（快照变化即更新 lastProgressAt；无变化不更新）
  5. Phase 2 载荷字段（bootId/seq/uiMode/startupDiagnostic/lastProgressAt）
  6. UI 降级原因透传（浏览器模式原因）
  7. 403/404/500 计数
  8. 优雅退出信标在未发过心跳时不发网络请求

运行：py -3 -m unittest tests.test_heartbeat -v （在 desktop-companion 目录下）
"""

import time
import unittest
from unittest.mock import patch

import companion_heartbeat as hb
import companion_state as state


def _reset_heartbeat_state():
    with hb._lock:
        hb._last_collection.update({
            'success': None, 'accountCount': 0, 'errorCode': '', 'message': '',
            'startedAt': None, 'endedAt': None,
        })
        hb._last_sync.update({
            'success': None, 'uploadCount': 0, 'errorCode': '', 'kind': '',
            'storeId': '', 'storeName': '', 'at': None,
        })
        hb._last_error.update({'errorCode': '', 'message': '', 'at': None})
        hb._http_error_counts.update({'count403': 0, 'count404': 0, 'count500': 0})
        hb._last_progress_at = None
        hb._last_seen_task_detail = None
        hb._task_state.update({'status': 'idle', 'startedAt': None})
        hb._SEQ = 0
    state._ui_mode = 'unknown'
    state._ui_fallback_reason = None
    state._ui_fallback_at = None
    state._webview2_runtime_version = None


class HeartbeatPhase2Test(unittest.TestCase):
    def setUp(self):
        _reset_heartbeat_state()

    def test_boot_id_stable_and_seq_monotonic(self):
        payload1 = hb._build_payload()
        payload2 = hb._build_payload()
        self.assertEqual(payload1['bootId'], payload2['bootId'])
        self.assertEqual(payload1['seq'] + 1, payload2['seq'])
        self.assertGreater(len(payload1['bootId']), 8)

    def test_record_sync_failure_sets_false(self):
        hb.record_sync(success=False, upload_count=0, error_code='E_NETWORK', kind='doudian')
        payload = hb._build_payload()
        self.assertIs(payload['lastSync']['success'], False)
        self.assertEqual(payload['lastSync']['errorCode'], 'E_NETWORK')

        hb.record_sync(success=True, upload_count=12, kind='doudian')
        payload = hb._build_payload()
        self.assertIs(payload['lastSync']['success'], True)
        self.assertEqual(payload['lastSync']['uploadCount'], 12)

    def test_record_sync_null_semantics_initial(self):
        payload = hb._build_payload()
        self.assertIsNone(payload['lastSync']['success'])

    def test_record_collection_sets_fields(self):
        hb.record_collection(success=False, account_count=2, error_code='FATAL', message='boom')
        payload = hb._build_payload()
        self.assertIs(payload['lastCollection']['success'], False)
        self.assertEqual(payload['lastCollection']['accountCount'], 2)
        self.assertEqual(payload['lastCollection']['errorCode'], 'FATAL')

    def test_task_progress_detection(self):
        # 空闲：无进展时间戳
        hb.note_task_progress('idle', {})
        self.assertIsNone(hb._last_progress_at)
        # 进入任务：快照首次出现 → 记进展
        hb.note_task_progress('collecting', {'current': 1, 'total': 10})
        first = hb._last_progress_at
        self.assertIsNotNone(first)
        time.sleep(1.05)
        # 同一快照：无新进展 → 时间戳不变
        hb.note_task_progress('collecting', {'current': 1, 'total': 10})
        self.assertEqual(hb._last_progress_at, first)
        time.sleep(1.05)
        # 快照变化：更新进展时间戳
        hb.note_task_progress('collecting', {'current': 2, 'total': 10})
        self.assertNotEqual(hb._last_progress_at, first)
        # 回到空闲：清空
        hb.note_task_progress('idle', {})
        self.assertIsNone(hb._last_progress_at)

    def test_payload_contains_phase2_fields(self):
        payload = hb._build_payload()
        for key in ('bootId', 'seq', 'uiMode', 'startupDiagnostic', 'lastProgressAt'):
            self.assertIn(key, payload)
        self.assertEqual(payload['uiMode'], 'unknown')
        self.assertIsNone(payload['lastProgressAt'])

    def test_ui_fallback_reason_reported(self):
        state._ui_mode = 'browser'
        state._ui_fallback_reason = 'edgechromium-deps-missing'
        state._webview2_runtime_version = '128.0.2739.113'
        payload = hb._build_payload()
        self.assertEqual(payload['uiMode'], 'browser')
        self.assertEqual(payload['startupDiagnostic']['fallbackReason'], 'edgechromium-deps-missing')
        self.assertEqual(payload['startupDiagnostic']['webview2RuntimeVersion'], '128.0.2739.113')

    def test_http_error_counts(self):
        hb.note_http_error(403)
        hb.note_http_error(403)
        hb.note_http_error(500)
        payload = hb._build_payload()
        self.assertEqual(payload['recentHttpErrors']['count403'], 2)
        self.assertEqual(payload['recentHttpErrors']['count500'], 1)
        self.assertEqual(payload['recentHttpErrors']['count404'], 0)

    def test_record_error_fields(self):
        hb.record_error('HEARTBEAT_NETWORK', 'timeout')
        payload = hb._build_payload()
        self.assertEqual(payload['lastError']['errorCode'], 'HEARTBEAT_NETWORK')
        self.assertEqual(payload['lastError']['message'], 'timeout')

    def test_shutdown_beacon_noop_without_token_or_sends(self):
        # 未发过心跳 / 无 api 配置 → 信标直接返回，不抛异常、不发网络请求
        hb._SEQ = 0
        hb.send_shutdown_heartbeat()
        hb._SEQ = 5
        saved = hb._load_api
        hb._load_api = lambda: ('', '')
        try:
            hb.send_shutdown_heartbeat()
        finally:
            hb._load_api = saved

    def test_successful_heartbeat_clears_transient_heartbeat_error(self):
        class _Response:
            status_code = 200

        class _Session:
            def post(self, *args, **kwargs):
                return _Response()

        hb.record_error('HEARTBEAT_NETWORK', 'temporary timeout')
        with patch.object(hb, '_load_api', return_value=('https://example.test/api/v1', 'token')), \
             patch('companion_auth._no_proxy_session', return_value=_Session()):
            self.assertTrue(hb._send_heartbeat())

        payload = hb._build_payload()
        self.assertEqual(payload['lastError']['errorCode'], '')
        self.assertEqual(payload['lastError']['message'], '')

    def test_successful_heartbeat_preserves_business_error(self):
        class _Response:
            status_code = 200

        class _Session:
            def post(self, *args, **kwargs):
                return _Response()

        hb.record_error('COLLECT_FAIL', 'no active accounts')
        with patch.object(hb, '_load_api', return_value=('https://example.test/api/v1', 'token')), \
             patch('companion_auth._no_proxy_session', return_value=_Session()):
            self.assertTrue(hb._send_heartbeat())

        self.assertEqual(hb._build_payload()['lastError']['errorCode'], 'COLLECT_FAIL')


if __name__ == '__main__':
    unittest.main(verbosity=2)
