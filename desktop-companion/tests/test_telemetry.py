"""日志上传网络通道回归测试。"""

import unittest
from unittest.mock import patch

import companion_telemetry as telemetry


class _Response:
    status_code = 201


class TelemetryTest(unittest.TestCase):
    def test_upload_uses_network_fallback(self):
        with patch.object(telemetry, '_read_tail', return_value=''), \
             patch('companion_config._load_config', return_value={}), \
             patch('companion_network.request_with_network_fallback', return_value=_Response()) as request:
            self.assertTrue(telemetry.upload_logs_once('https://example.test/api/v1', 'token', 'device-1', '3.2.108'))

        self.assertEqual(request.call_count, 1)
        self.assertTrue(request.call_args.args[1].endswith('/platforms/report-logs'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
