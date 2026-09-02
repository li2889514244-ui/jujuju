from __future__ import annotations

import subprocess
import time
from collections.abc import Callable


class CancelledError(RuntimeError):
    pass


class ProcessHandle:
    def __init__(self) -> None:
        self.process: subprocess.Popen | None = None

    def terminate(self, grace_seconds: float = 3.0) -> None:
        proc = self.process
        if not proc or proc.poll() is not None:
            return
        proc.terminate()
        deadline = time.time() + grace_seconds
        while time.time() < deadline:
            if proc.poll() is not None:
                return
            time.sleep(0.1)
        if proc.poll() is None:
            proc.kill()


def _drain_after_stop(proc: subprocess.Popen) -> None:
    try:
        proc.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate(timeout=5)


def run_process(cmd: list[str], timeout: int, handle: ProcessHandle | None = None, should_cancel: Callable[[], bool] | None = None) -> subprocess.CompletedProcess:
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
    if handle is not None:
        handle.process = proc
    start = time.time()
    try:
        while True:
            try:
                stdout, stderr = proc.communicate(timeout=0.2)
                return subprocess.CompletedProcess(cmd, proc.returncode, stdout, stderr)
            except subprocess.TimeoutExpired:
                pass
            if should_cancel and should_cancel():
                if handle is not None:
                    handle.terminate()
                else:
                    proc.terminate()
                _drain_after_stop(proc)
                raise CancelledError("TASK_CANCELLED")
            if timeout and time.time() - start > timeout:
                if handle is not None:
                    handle.terminate()
                else:
                    proc.kill()
                _drain_after_stop(proc)
                raise TimeoutError("PROCESS_TIMEOUT")
    finally:
        if handle is not None:
            handle.process = None
