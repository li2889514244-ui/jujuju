"""
Static guardrails for Pixingyun Mate process safety.

These tests intentionally fail on patterns that previously caused the companion
to close unrelated user software. They are release gates, not feature tests.
"""

from __future__ import annotations

import ast
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
PROD_PY_FILES = [
    path
    for path in ROOT.rglob("*.py")
    if "tests" not in path.relative_to(ROOT).parts
    and "__pycache__" not in path.relative_to(ROOT).parts
    and not any(
        part.startswith(("build", "release", "dist", ".venv", "venv", "env"))
        for part in path.relative_to(ROOT).parts
    )
]


def _relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def _is_docstring_expr(node: ast.AST, parent: ast.AST | None) -> bool:
    if not isinstance(parent, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return False
    body = getattr(parent, "body", [])
    return bool(body and body[0] is node)


def _iter_string_constants(path: Path):
    tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"), filename=str(path))
    parents: dict[ast.AST, ast.AST] = {}
    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            parents[child] = parent
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            parent = parents.get(node)
            if isinstance(parent, ast.Expr) and _is_docstring_expr(parent, parents.get(parent)):
                continue
            yield node.value, node.lineno


class ProcessGuardrailTest(unittest.TestCase):
    def test_browser_process_types_must_require_profile(self):
        import process_registry

        required = {
            "browser",
            "cdp_browser",
            "scan_login_browser",
            "collector_browser",
            "doudian_browser",
            "pixing_worker_browser",
            "webview_fallback_browser",
        }
        self.assertTrue(
            required.issubset(process_registry.BROWSER_PROCESS_TYPES_REQUIRING_PROFILE),
            "Every browser-like managed process type must require a profile path.",
        )

    def test_no_browser_tree_registration_without_profile_in_production_code(self):
        violations: list[str] = []
        pattern = re.compile(r"register_new_browser_tree\s*\(\s*None\b")
        for path in PROD_PY_FILES:
            text = path.read_text(encoding="utf-8", errors="replace")
            for match in pattern.finditer(text):
                line = text.count("\n", 0, match.start()) + 1
                violations.append(f"{_relative(path)}:{line}")
        self.assertEqual(
            violations,
            [],
            "Browser process registration without profile_path can claim unrelated user browsers.",
        )

    def test_raw_taskkill_is_only_allowed_inside_process_registry(self):
        violations: list[str] = []
        for path in PROD_PY_FILES:
            for value, line in _iter_string_constants(path):
                if value.lower() == "taskkill" and _relative(path) != "process_registry.py":
                    violations.append(f"{_relative(path)}:{line}")
        self.assertEqual(
            violations,
            [],
            "Raw taskkill must remain centralized behind process_registry verification.",
        )

    def test_no_powershell_stop_process_in_production_code(self):
        violations: list[str] = []
        for path in PROD_PY_FILES:
            rel = _relative(path)
            for value, line in _iter_string_constants(path):
                if "Stop-Process" not in value:
                    continue
                violations.append(f"{rel}:{line}")
        self.assertEqual(
            violations,
            [],
            "PowerShell Stop-Process must not be used by the companion; keep termination behind safe handles/registry verification.",
        )

    def test_no_commandline_like_process_sweeps(self):
        violations: list[str] = []
        for path in PROD_PY_FILES:
            for value, line in _iter_string_constants(path):
                if "CommandLine -like" in value or "CommandLine LIKE" in value:
                    violations.append(f"{_relative(path)}:{line}")
        self.assertEqual(
            violations,
            [],
            "Never sweep Win32_Process by CommandLine pattern to decide what to kill.",
        )

    def test_no_direct_browser_close_calls(self):
        violations: list[str] = []
        for path in PROD_PY_FILES:
            tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"), filename=str(path))
            for node in ast.walk(tree):
                call = node.value if isinstance(node, ast.Await) and isinstance(node.value, ast.Call) else node
                if not isinstance(call, ast.Call):
                    continue
                func = call.func
                if (
                    isinstance(func, ast.Attribute)
                    and func.attr == "close"
                    and isinstance(func.value, ast.Name)
                    and func.value.id == "browser"
                ):
                    violations.append(f"{_relative(path)}:{node.lineno}")
        self.assertEqual(
            violations,
            [],
            "Do not call browser.close(); close isolated contexts or registry-verified processes only.",
        )

    def test_startup_other_install_cleanup_stays_opt_in(self):
        text = (ROOT / "companion_app.py").read_text(encoding="utf-8", errors="replace")
        self.assertIn(
            "_load_config().get('cleanup_other_installs_on_start') is True",
            text,
            "Cross-install cleanup must stay disabled unless explicitly opted in.",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
