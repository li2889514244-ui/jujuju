r"""
test_process_safety.py — 披星云伴侣进程安全回归测试（P0）

验证铁律：
  1. 未登记进程一律拒绝关闭（SKIP_UNMANAGED_PROCESS）。
  2. create_time 不一致（PID 复用）拒绝关闭。
  3. executable 不一致拒绝关闭。
  4. 按 profile 关闭只影响登记在该 profile 下的进程。
  5. CDP 归属校验：非伴侣浏览器拒绝 attach / close。
  6. launch 前后 diff 只登记新出现的进程。

运行方式（本机无 psutil 时自动走 PowerShell 降级路径，行为一致）：
  .venv\Scripts\python.exe -m unittest tests.test_process_safety -v
"""

import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

# 测试专用隔离目录，绝不污染真实运行中伴侣的 AppData
_GUARD_TMP = tempfile.mkdtemp(prefix="pixingyun-guard-test-")
os.environ["PIXINGYUN_GUARD_DIR"] = _GUARD_TMP

import process_registry as registry  # noqa: E402


def spawn_sleeper(marker: str | None = None, seconds: int = 120) -> subprocess.Popen:
    cmd = [sys.executable, "-c", "import time; time.sleep(3600)"]
    if marker:
        cmd.append(marker)
    return subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


class ProcessSafetyTest(unittest.TestCase):
    def setUp(self):
        registry._registry.clear()
        registry._persisted_records.clear()
        self._children: list[subprocess.Popen] = []

    def tearDown(self):
        for child in self._children:
            try:
                if child.poll() is None:
                    child.kill()
                child.wait(timeout=5)
            except Exception:
                pass
        registry._registry.clear()
        registry._persisted_records.clear()

    def _spawn(self, marker: str | None = None) -> subprocess.Popen:
        child = spawn_sleeper(marker)
        self._children.append(child)
        # 等待 create_time 可读
        deadline = time.time() + 15
        while time.time() < deadline:
            if registry._ps_create_time(child.pid) is not None:
                break
            time.sleep(0.3)
        return child

    def _guard_log_text(self) -> str:
        try:
            return registry._guard_log_file().read_text(encoding="utf-8")
        except Exception:
            return ""

    def test_01_registered_own_process_can_be_terminated(self):
        """披星云自己登记并校验通过的进程允许关闭。"""
        child = self._spawn()
        rec = registry.register_process(
            child.pid, process_type="test", executable=sys.executable
        )
        self.assertIsNotNone(rec)
        result = registry.terminate_managed(child.pid, reason="test cleanup")
        self.assertIn(result["action"], ("killed", "already_gone"))
        self.assertNotIn("skipped", result["action"])
        child.wait(timeout=10)

    def test_02_unregistered_process_never_killed(self):
        """未登记进程：即使显式要求关闭也必须拒绝，进程保持存活。"""
        child = self._spawn()
        result = registry.terminate_managed(child.pid, reason="test attack")
        self.assertEqual(result["action"], "skipped")
        self.assertEqual(result["detail"], "not_in_registry")
        self.assertIsNone(child.poll(), "未登记进程被误杀！")
        self.assertIn("SKIP_UNMANAGED_PROCESS", self._guard_log_text())

    def test_03_pid_reuse_create_time_mismatch_skipped(self):
        """PID 被复用（create_time 与登记不一致）→ 拒绝关闭。"""
        child = self._spawn()
        registry.register_process(
            child.pid, process_type="test", executable=sys.executable
        )
        # 篡改登记记录，模拟 PID 已被其他进程复用
        registry._registry[child.pid]["create_time"] += 99999.0
        result = registry.terminate_managed(child.pid, reason="test")
        self.assertEqual(result["action"], "skipped")
        self.assertIn("create_time", result["detail"])
        self.assertIsNone(child.poll(), "create_time 不一致仍被杀！")
        self.assertIn("SKIP_UNMANAGED_PROCESS", self._guard_log_text())

    def test_04_executable_mismatch_skipped(self):
        """可执行文件与登记不一致 → 拒绝关闭。"""
        child = self._spawn()
        registry.register_process(
            child.pid,
            process_type="test",
            executable=r"C:\Windows\System32\notepad.exe",
        )
        result = registry.terminate_managed(child.pid, reason="test")
        self.assertEqual(result["action"], "skipped")
        self.assertIn("executable", result["detail"])
        self.assertIsNone(child.poll(), "可执行文件不一致仍被杀！")

    def test_05_profile_scoped_termination(self):
        """按 profile 清理：只关闭登记在该 profile 下的进程，其他 profile 不受影响。"""
        profile_a = r"C:\fake\browser-profiles\account_A"
        profile_b = r"C:\fake\browser-profiles\account_B"
        child_a = self._spawn(marker=profile_a)
        child_b = self._spawn(marker=profile_b)
        registry.register_process(
            child_a.pid, process_type="collector_browser",
            profile_path=profile_a, executable=sys.executable,
        )
        registry.register_process(
            child_b.pid, process_type="collector_browser",
            profile_path=profile_b, executable=sys.executable,
        )
        results = registry.terminate_for_profile(profile_a, reason="close account A")
        killed = [r for r in results if r["action"] == "killed"]
        self.assertTrue(any(r["pid"] == child_a.pid for r in killed), "账号A进程未被关闭")
        self.assertTrue(all(r["pid"] != child_b.pid for r in killed), "账号B进程被误杀！")
        self.assertIsNone(child_b.poll(), "账号B进程被误杀！")

    def test_06_dead_pid_reports_already_gone_not_killed(self):
        """PID 已不存在 → 报告 already_gone，不算 killed。"""
        child = self._spawn()
        registry.register_process(child.pid, process_type="test")
        child.kill()
        child.wait(timeout=10)
        result = registry.terminate_managed(child.pid, reason="test")
        self.assertEqual(result["action"], "already_gone")

    def test_07_cdp_owner_refuses_unregistered_browser(self):
        """CDP 端口上是未登记进程（模拟用户 Chrome）→ 拒绝 attach。"""
        child = self._spawn()
        server = self._start_cdp_server(child.pid)
        try:
            owned, pid, detail = registry.verify_cdp_owner(server["url"])
            self.assertFalse(owned, "未登记浏览器居然被允许 attach！")
            self.assertEqual(pid, child.pid)
            self.assertIsNone(child.poll(), "用户浏览器被误杀！")
        finally:
            server["shutdown"]()

    def test_08_cdp_owner_accepts_registered_browser(self):
        """CDP 端口上是披星云登记进程 → 允许 attach（且校验通过）。"""
        profile_marker = r"C:\fake\MatrixFlow\chrome_profile"
        child = self._spawn(marker=profile_marker)
        registry.register_process(child.pid, process_type="cdp_browser", profile_path=profile_marker)
        server = self._start_cdp_server(child.pid)
        try:
            owned, pid, detail = registry.verify_cdp_owner(server["url"])
            self.assertTrue(owned, f"登记进程被误拒: {detail}")
            self.assertEqual(pid, child.pid)
        finally:
            server["shutdown"]()

    def test_09_launch_diff_registers_only_new_processes(self):
        """launch 前后 diff：只登记新出现的进程，launch 前已存在的（用户浏览器）不登记。"""
        pre_existing = self._spawn()
        pre_snapshot = registry.browser_snapshot(name_whitelist={"python.exe", "python"})
        self.assertIn(pre_existing.pid, pre_snapshot)
        profile_marker = r"C:\fake\MatrixFlow\browser-profiles\scan_test"
        launched = self._spawn(marker=profile_marker)
        registered = registry.register_new_browser_tree(
            profile_marker, pre_snapshot,
            process_type="scan_login_browser",
            name_whitelist={"python.exe", "python"},
        )
        registered_pids = [r["pid"] for r in registered]
        self.assertIn(launched.pid, registered_pids, "新启动的进程未被登记")
        self.assertNotIn(pre_existing.pid, registered_pids, "用户已有进程被误登记！")

    def test_10_guard_log_records_kill_prepare(self):
        """保护日志必须记录 KILL_PREPARE 细节。"""
        child = self._spawn()
        registry.register_process(
            child.pid, process_type="test",
            task_id="task-1", profile_path=r"C:\fake\prof\x",
            executable=sys.executable,
        )
        registry.terminate_managed(child.pid, reason="close test task")
        log = self._guard_log_text()
        self.assertIn("KILL_PREPARE", log)
        self.assertIn(f"pid={child.pid}", log)
        self.assertIn("task_id=task-1", log)

    def test_11_stale_cleanup_prunes_dead_records(self):
        """崩溃重启清扫：已退出的登记进程必须从持久化注册表中剪除，不无限累积。"""
        profile_marker = r"C:\fake\MatrixFlow\browser-profiles\stale"
        child = self._spawn(marker=profile_marker)
        registry.register_process(child.pid, process_type="collector_browser", profile_path=profile_marker)
        registry._persist()
        child.kill()
        child.wait(timeout=10)
        # 模拟重启：重新加载持久化记录并清扫
        loaded = registry.load_persisted()
        self.assertGreaterEqual(loaded, 1)
        results = registry.terminate_stale_records(reason="stale cleanup test")
        self.assertTrue(any(r["action"] == "already_gone" for r in results))
        # 清扫后注册表文件不得再包含该死 PID
        persisted = json.loads(registry._persist_file().read_text(encoding="utf-8"))
        persisted_pids = [int(r["pid"]) for r in persisted.get("records", [])]
        self.assertNotIn(child.pid, persisted_pids, "死 PID 未被剪除！")
        self.assertNotIn(child.pid, registry._registry)
        self.assertNotIn(child.pid, registry._persisted_records)

    def test_12_browser_records_without_profile_are_never_registered_or_killed(self):
        """无 profile 的浏览器记录必须拒绝登记；遗留记录也必须拒绝杀，防止误杀用户同时新开的浏览器。"""
        pre_snapshot = registry.browser_snapshot(name_whitelist={"python.exe", "python"})
        child = self._spawn()
        registered = registry.register_new_browser_tree(
            None,
            pre_snapshot,
            process_type="pixing_worker_browser",
            task_id="race-task",
            name_whitelist={"python.exe", "python"},
        )
        self.assertEqual(registered, [])
        self.assertNotIn(child.pid, registry._registry)
        create_time = registry._ps_create_time(child.pid)
        self.assertIsNotNone(create_time)
        registry._registry[child.pid] = {
            "pid": child.pid,
            "create_time": float(create_time),
            "type": "pixing_worker_browser",
            "task_id": "legacy-race-task",
            "account_id": None,
            "store_id": None,
            "profile_path": None,
            "executable": registry._norm_path(sys.executable),
            "parent_pid": os.getpid(),
            "registered_at": time.time(),
        }
        registry._persist()
        registry._registry.clear()
        registry._persisted_records.clear()
        results = registry.terminate_stale_records(reason="legacy no-profile cleanup")
        result = next(r for r in results if r["pid"] == child.pid)
        self.assertEqual(result["action"], "skipped")
        self.assertEqual(result["detail"], "browser_profile_path_required")
        self.assertIsNone(child.poll(), "无 profile 的遗留浏览器记录被误杀！")
        persisted = json.loads(registry._persist_file().read_text(encoding="utf-8"))
        persisted_pids = [int(r["pid"]) for r in persisted.get("records", [])]
        self.assertNotIn(child.pid, persisted_pids, "无 profile 脏记录未被剪除！")

    # ── 辅助 ────────────────────────────────────────────────
    def _start_cdp_server(self, browser_pid: int) -> dict:
        handler = _make_handler(browser_pid)
        server = HTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        port = server.server_address[1]
        def _shutdown():
            server.shutdown()
            server.server_close()
        return {
            "url": f"http://127.0.0.1:{port}",
            "shutdown": _shutdown,
        }


def _make_handler(browser_pid: int):
    class _Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            payload = json.dumps({
                "Browser": "Chrome/126.0",
                "Browser-Pid": browser_pid,
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args):
            pass

    return _Handler


if __name__ == "__main__":
    unittest.main(verbosity=2)
