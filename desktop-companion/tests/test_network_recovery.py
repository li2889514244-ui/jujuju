import unittest
from unittest.mock import patch

import companion_network as network
import startup_manager


class _Response:
    def __init__(self, status_code=200):
        self.status_code = status_code


class _Session:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.closed = False

    def request(self, *args, **kwargs):
        if self.error:
            raise self.error
        return self.response

    def close(self):
        self.closed = True


class NetworkRecoveryTest(unittest.TestCase):
    def setUp(self):
        network.reset_network_diagnostics()

    def test_direct_success_does_not_touch_proxy(self):
        direct = _Session(response=_Response())
        proxy = _Session(response=_Response())
        with patch('companion_network._new_session', side_effect=[direct, proxy]) as factory:
            response = network.request_with_network_fallback('POST', 'https://example.test', channel='heartbeat')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(factory.call_count, 1)
        self.assertEqual(network.get_network_diagnostics()['lastRoute'], 'direct')

    def test_transport_failure_falls_back_to_system_proxy(self):
        direct = _Session(error=ConnectionError('direct route unavailable'))
        proxy = _Session(response=_Response())
        with patch('companion_network._new_session', side_effect=[direct, proxy]):
            response = network.request_with_network_fallback('POST', 'https://example.test', channel='heartbeat')
        self.assertEqual(response.status_code, 200)
        diagnostic = network.get_network_diagnostics()
        self.assertEqual(diagnostic['lastRoute'], 'system_proxy')
        self.assertEqual(diagnostic['consecutiveFailures'], 0)

    def test_http_error_is_not_retried_through_proxy(self):
        direct = _Session(response=_Response(status_code=401))
        proxy = _Session(response=_Response())
        with patch('companion_network._new_session', side_effect=[direct, proxy]) as factory:
            response = network.request_with_network_fallback('POST', 'https://example.test', channel='auth')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(factory.call_count, 1)


class StartupRecoveryTest(unittest.TestCase):
    def test_task_xml_has_logon_and_restart_policy(self):
        xml = startup_manager._recovery_task_xml()
        self.assertIn('<LogonTrigger>', xml)
        self.assertIn('<RestartOnFailure>', xml)
        self.assertIn('<Interval>PT1M</Interval>', xml)
        self.assertIn('--startup', xml)

    def test_non_windows_status_is_safe(self):
        with patch.object(startup_manager, '_is_windows', return_value=False):
            status = startup_manager.get_startup_status()
        self.assertFalse(status['supported'])
        self.assertFalse(status['enabled'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
