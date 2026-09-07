"""日志上传网络通道回归测试。"""

import unittest
from unittest.mock import patch

import companion_telemetry as telemetry


class _Response:
    status_code = 201


class _Session:
    def __init__(self):
        self.calls = []

    def post(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return _Response()


class TelemetryTest(unittest.TestCase):
    def test_upload_uses_no_proxy_session(self):
        session = _Session()
        with patch.object(telemetry, '_read_tail', return_value=''), \
             patch('companion_config._load_config', return_value={}), \
             patch('companion_auth._no_proxy_session', return_value=session):
            self.assertTrue(telemetry.upload_logs_once('https://example.test/api/v1', 'token', 'device-1', '3.2.108'))

        self.assertEqual(len(session.calls), 1)
        self.assertTrue(session.calls[0][0][0].endswith('/platforms/report-logs'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
