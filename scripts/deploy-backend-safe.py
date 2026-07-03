#!/usr/bin/env python3
"""Safe backend deployment entry point for MatrixFlow.

Default mode is --plan and makes no changes. Production is changed only when
--execute is passed. The script does not run git reset on the server and does
not touch frontend files or nginx.
"""

from __future__ import annotations

import argparse
import os
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import textwrap
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
DEFAULT_REMOTE_BACKEND = "/opt/matrixflow/backend"
DEFAULT_PM2_APP = "matrixflow"
DEFAULT_HEALTH_URL = "https://ddddkiii.com/api/v1/health"


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


def run_local(command: list[str], timeout: int = 900) -> None:
    exe = shutil.which(command[0])
    if exe:
        command = [exe, *command[1:]]
    print("+ " + " ".join(command))
    subprocess.run(command, cwd=ROOT, check=True, timeout=timeout)


def connect_ssh(env: dict[str, str]):
    try:
        import paramiko
    except ImportError as exc:
        raise SystemExit("paramiko is required: pip install paramiko") from exc

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


def exec_remote(client, command: str, timeout: int = 900) -> tuple[str, str, int]:
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    return out, err, code


def create_backend_archive() -> Path:
    dist = BACKEND / "dist"
    main = dist / "main.js"
    if not main.exists():
        raise SystemExit("backend/dist/main.js not found. Run backend build first.")

    stamp = time.strftime("%Y%m%d%H%M%S")
    out = ROOT / "scripts" / f"backend-release-{stamp}.tar.gz"
    with tarfile.open(out, "w:gz") as tar:
        tar.add(dist, arcname="dist")
        tar.add(BACKEND / "package.json", arcname="package.json")
        tar.add(BACKEND / "prisma", arcname="prisma")
    print(f"archive={out}")
    return out


def fetch_health(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "MatrixFlowBackendDeployVerify"})
    with urllib.request.urlopen(req, timeout=20) as res:
        body = res.read(500).decode("utf-8", errors="replace")
        return f"HTTP {res.status} {body.strip()}"


def deploy_archive(client, archive: Path, remote_backend: str, pm2_app: str, *, migrate: bool, install_deps: bool) -> None:
    stamp = time.strftime("%Y%m%d%H%M%S")
    remote_tar = f"/tmp/matrixflow-backend-{stamp}.tar.gz"
    sftp = client.open_sftp()
    try:
        sftp.put(str(archive), remote_tar)
    finally:
        sftp.close()

    migrate_cmd = "npx prisma migrate deploy" if migrate else "npx prisma migrate status || true"
    install_cmd = "cd /opt/matrixflow && npm ci --include=dev --ignore-scripts --legacy-peer-deps" if install_deps else "true"
    command = textwrap.dedent(
        f"""
        set -euo pipefail
        STAMP={shlex.quote(stamp)}
        REMOTE_BACKEND={shlex.quote(remote_backend)}
        PM2_APP={shlex.quote(pm2_app)}
        TAR={shlex.quote(remote_tar)}
        TMP=/tmp/matrixflow-backend-release-$STAMP
        BACKUP=/opt/matrixflow/releases/backend/$STAMP

        case "$REMOTE_BACKEND" in
          /opt/matrixflow/backend) ;;
          *) echo "Refusing unexpected backend path: $REMOTE_BACKEND" >&2; exit 2 ;;
        esac

        mkdir -p "$TMP" "$BACKUP"
        tar -xzf "$TAR" -C "$TMP"
        test -f "$TMP/dist/main.js"

        cp -a "$REMOTE_BACKEND/dist" "$BACKUP/dist" 2>/dev/null || true
        cp -a "$REMOTE_BACKEND/prisma" "$BACKUP/prisma" 2>/dev/null || true
        cp -a "$REMOTE_BACKEND/package.json" "$BACKUP/package.json" 2>/dev/null || true

        rm -rf "$REMOTE_BACKEND/dist" "$REMOTE_BACKEND/prisma"
        cp -a "$TMP/dist" "$REMOTE_BACKEND/dist"
        cp -a "$TMP/prisma" "$REMOTE_BACKEND/prisma"
        cp -a "$TMP/package.json" "$REMOTE_BACKEND/package.json"

        {install_cmd}
        cd "$REMOTE_BACKEND"
        npx prisma generate
        {migrate_cmd}
        pm2 restart "$PM2_APP" --update-env
        sleep 5
        curl -sf --max-time 8 http://localhost:3000/api/v1/health
        printf '\\nbackup=%s\\n' "$BACKUP"
        """
    )
    out, err, code = exec_remote(client, command)
    print(out, end="")
    if err.strip():
        print(err, file=sys.stderr)
    if code != 0:
        raise SystemExit(f"Remote backend deploy failed with exit code {code}")


def print_plan(args: argparse.Namespace) -> None:
    print("Backend deployment plan")
    print("1. Build local backend with npm run build --workspace=backend unless --skip-build is used.")
    print("2. Pack backend/dist, backend/package.json, and backend/prisma.")
    print(f"3. Upload archive to {args.remote_backend}.")
    print("4. Backup current remote dist, prisma, and package.json under /opt/matrixflow/releases/backend/<timestamp>.")
    print("5. Replace backend dist/prisma/package.json only.")
    if args.install_deps:
        print("6. Reinstall root dependencies with npm ci --include=dev --ignore-scripts --legacy-peer-deps.")
    else:
        print("6. Keep existing server node_modules.")
    print("7. Run npx prisma generate.")
    print("8. Run prisma migrate deploy only if --migrate is passed; otherwise run migrate status.")
    print(f"9. Restart PM2 app {args.pm2_app}.")
    print(f"10. Verify {args.health_url}.")
    print("")
    print("No production change will happen without --execute.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Safe MatrixFlow backend deployment.")
    parser.add_argument("--plan", action="store_true", help="Print the plan and exit. This is the default.")
    parser.add_argument("--execute", action="store_true", help="Actually deploy to production.")
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--install-deps", action="store_true", help="Run npm ci on the server before restart.")
    parser.add_argument("--migrate", action="store_true", help="Run prisma migrate deploy.")
    parser.add_argument("--remote-backend", default=DEFAULT_REMOTE_BACKEND)
    parser.add_argument("--pm2-app", default=DEFAULT_PM2_APP)
    parser.add_argument("--health-url", default=DEFAULT_HEALTH_URL)
    args = parser.parse_args()

    if not args.execute:
        print_plan(args)
        return 0

    if args.plan:
        print_plan(args)
        return 0

    if not args.skip_build:
        run_local(["npm", "run", "build", "--workspace=backend"])

    archive = create_backend_archive()
    env = parse_env(ROOT / "secrets.env")
    client = connect_ssh(env)
    try:
        deploy_archive(
            client,
            archive,
            args.remote_backend,
            args.pm2_app,
            migrate=args.migrate,
            install_deps=args.install_deps,
        )
    finally:
        client.close()

    print(fetch_health(args.health_url))
    print("BACKEND DEPLOY SUCCESS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
