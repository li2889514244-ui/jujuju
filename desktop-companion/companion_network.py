"""Network resilience and last-known transport diagnostics for the companion.

The companion used to force every request through a direct-only session.  That
is useful on machines where a broken system proxy is injected globally, but it
also makes the companion fail on managed networks where HTTPS egress is only
available through the configured corporate proxy.  Requests now use a
direct-first policy and fall back to the system-configured proxy only when the
direct attempt fails at the transport layer.  HTTP responses are never retried
through another route, so authentication and server errors remain visible.
"""

from __future__ import annotations

import threading
import time
from typing import Any


_LOCK = threading.Lock()
_DIAGNOSTIC = {
    'lastAttemptAt': '',
    'lastSuccessAt': '',
    'lastFailureAt': '',
    'consecutiveFailures': 0,
    'lastRoute': '',
    'lastChannel': '',
    'lastErrorCode': '',
    'lastErrorMessage': '',
    'lastHttpStatus': None,
}


def _now_iso() -> str:
    return time.strftime('%Y-%m-%dT%H:%M:%S')


def classify_network_error(exc: BaseException) -> str:
    """Return a stable, privacy-safe transport error category."""
    name = type(exc).__name__.lower()
    text = str(exc).lower()
    if 'proxy' in name or 'proxy' in text:
        return 'NETWORK_PROXY'
    if 'ssl' in name or 'certificate' in text or 'tls' in text:
        return 'NETWORK_TLS'
    if 'timeout' in name or 'timed out' in text or 'timeout' in text:
        return 'NETWORK_TIMEOUT'
    if 'connection' in name or 'connection' in text or 'dns' in text or 'name or service' in text:
        return 'NETWORK_CONNECT'
    return 'NETWORK_TRANSPORT'


def _record_attempt(channel: str, route: str) -> None:
    with _LOCK:
        _DIAGNOSTIC.update({
            'lastAttemptAt': _now_iso(),
            'lastChannel': str(channel or '')[:40],
            'lastRoute': str(route or '')[:24],
        })


def record_success(channel: str, route: str, status_code: int | None = None) -> None:
    with _LOCK:
        _DIAGNOSTIC.update({
            'lastAttemptAt': _now_iso(),
            'lastSuccessAt': _now_iso(),
            'consecutiveFailures': 0,
            'lastRoute': str(route or '')[:24],
            'lastChannel': str(channel or '')[:40],
            'lastErrorCode': '',
            'lastErrorMessage': '',
            'lastHttpStatus': status_code,
        })


def record_failure(channel: str, route: str, exc: BaseException, status_code: int | None = None) -> None:
    with _LOCK:
        _DIAGNOSTIC.update({
            'lastAttemptAt': _now_iso(),
            'lastFailureAt': _now_iso(),
            'consecutiveFailures': int(_DIAGNOSTIC.get('consecutiveFailures') or 0) + 1,
            'lastRoute': str(route or '')[:24],
            'lastChannel': str(channel or '')[:40],
            'lastErrorCode': classify_network_error(exc),
            'lastErrorMessage': str(exc or '')[:200],
            'lastHttpStatus': status_code,
        })


def get_network_diagnostics() -> dict[str, Any]:
    with _LOCK:
        return dict(_DIAGNOSTIC)


def reset_network_diagnostics() -> None:
    """Test helper; production code never needs to call this."""
    with _LOCK:
        _DIAGNOSTIC.update({
            'lastAttemptAt': '',
            'lastSuccessAt': '',
            'lastFailureAt': '',
            'consecutiveFailures': 0,
            'lastRoute': '',
            'lastChannel': '',
            'lastErrorCode': '',
            'lastErrorMessage': '',
            'lastHttpStatus': None,
        })


def _new_session(use_system_proxy: bool):
    import requests

    session = requests.Session()
    session.trust_env = bool(use_system_proxy)
    return session


def request_with_network_fallback(method: str, url: str, *, channel: str, **kwargs):
    """Issue one request direct-first, then once via the system proxy.

    Only transport exceptions trigger the second route.  A response with any
    HTTP status is returned as-is so 401/403/5xx remain actionable and are not
    mislabeled as a connectivity problem.
    """
    last_exc: BaseException | None = None
    for route, use_system_proxy in (('direct', False), ('system_proxy', True)):
        _record_attempt(channel, route)
        session = _new_session(use_system_proxy)
        try:
            response = session.request(method, url, **kwargs)
            record_success(channel, route, getattr(response, 'status_code', None))
            return response
        except Exception as exc:
            last_exc = exc
            record_failure(channel, route, exc)
        finally:
            try:
                session.close()
            except Exception:
                pass
    assert last_exc is not None
    raise last_exc
