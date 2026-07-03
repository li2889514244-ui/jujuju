#!/usr/bin/env python3
"""Read-only production diagnostics for MatrixFlow.

Default mode checks local repo state and public health only. Use --remote to
run read-only SSH checks on the Aliyun ECS host. This script never writes to the
server and never restarts services.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_URL = "https://ddddkiii.com"
HEALTH_URL = PUBLIC_URL + "/api/v1/health"


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def run_local(command: list[str], timeout: int = 30) -> tuple[int, str]:
    exe = shutil.which(command[0])
    if exe:
        command = [exe, *command[1:]]
    proc = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
    )
    return proc.returncode, (proc.stdout or "").strip()


def fetch(url: str, timeout: int = 15) -> tuple[int, str]:
    req = urllib.request.Request(
        url,
        headers={
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "User-Agent": "MatrixFlowProductionDiagnose",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            body = res.read(500).decode("utf-8", errors="replace")
            return res.status, body.strip()
    except urllib.error.HTTPError as exc:
        body = exc.read(500).decode("utf-8", errors="replace")
        return exc.code, body.strip()
    except Exception as exc:  # noqa: BLE001
        return 0, repr(exc)


def connect_ssh(env: dict[str, str]):
    try:
        import paramiko
    except ImportError as exc:
        raise SystemExit("paramiko is required for --remote: pip install paramiko") from exc

    host = env.get("ECS_HOST") or env.get("ECS_IP") or "8.134.218.39"
    user = env.get("ECS_SSH_USER") or env.get("ECS_USER") or "root"
    password = env.get("ECS_SSH_PASSWORD") or env.get("ECS_PASSWORD")
    key_path = env.get("ECS_KEY_PATH")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    kwargs = {
        "hostname": host,
        "username": user,
        "timeout": 30,
        "banner_timeout": 90,
        "auth_timeout": 30,
    }
    if key_path:
        kwargs["key_filename"] = key_path
    elif password:
        kwargs["password"] = password
    else:
        raise SystemExit("Missing ECS SSH credential in secrets.env")
    client.connect(**kwargs)
    return client


def exec_remote(client, command: str, timeout: int = 60) -> tuple[int, str]:
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    return code, (out + err).strip()


def section(title: str) -> None:
    print(f"\n== {title} ==")


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only MatrixFlow production diagnostics.")
    parser.add_argument("--remote", action="store_true", help="Run read-only checks on the ECS server.")
    args = parser.parse_args()

    failures = 0

    section("Local Repo")
    for cmd in (["git", "branch", "--show-current"], ["git", "rev-parse", "--short", "HEAD"]):
        code, out = run_local(cmd)
        print(f"{' '.join(cmd)}: {out or '(empty)'}")
        failures += int(code != 0)
    code, status = run_local(["git", "status", "--short"], timeout=60)
    lines = [line for line in status.splitlines() if line.strip()]
    print(f"git dirty entries: {len(lines)}")
    for line in lines[:30]:
        print(f"  {line}")
    if len(lines) > 30:
        print(f"  ... {len(lines) - 30} more")

    section("Public Health")
    status_code, body = fetch(HEALTH_URL)
    print(f"{HEALTH_URL}: HTTP {status_code} {body[:200]}")
    if status_code != 200:
        failures += 1

    status_code, body = fetch(PUBLIC_URL)
    print(f"{PUBLIC_URL}: HTTP {status_code}, body bytes sample={len(body)}")
    if status_code != 200:
        failures += 1

    section("Known Risk Markers")
    for pattern in ("git reset --hard", "/var/www/matrixflow", "pm2 restart all"):
        code, out = run_local(["rg", "-n", pattern, "scripts", ".github", "docs", "README.md"], timeout=60)
        count = len([line for line in out.splitlines() if line.strip()])
        print(f"{pattern}: {count} matches")

    if args.remote:
        section("Remote ECS Read-Only Checks")
        env = parse_env(ROOT / "secrets.env")
        client = connect_ssh(env)
        try:
            remote_checks = {
                "uptime": "uptime",
                "pm2": "pm2 status matrixflow --no-color || true",
                "docker": "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'",
                "ports": "ss -ltnp | grep -E ':(80|3000|5432|6379) ' || true",
                "local health": "curl -sS -m 8 -i http://localhost:3000/api/v1/health | head -20 || true",
                "origin health": "curl -sS -m 8 -i -H 'Host: ddddkiii.com' http://127.0.0.1/api/v1/health | head -20 || true",
                "frontend ref": "grep -o 'assets/js/index-[^\" ]*' /opt/matrixflow/frontend/dist/index.html | head -1 || true",
                "migrations": "cd /opt/matrixflow/backend && npx prisma migrate status 2>&1 | tail -30 || true",
            }
            for name, command in remote_checks.items():
                code, out = exec_remote(client, command)
                print(f"\n-- {name} (exit {code}) --")
                print(out[:3000] or "(empty)")
        finally:
            client.close()

    section("Result")
    if failures:
        print(f"DIAGNOSE FAILED: {failures} blocking public/local checks failed.")
        return 1
    print("DIAGNOSE OK: no blocking public/local failure detected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
