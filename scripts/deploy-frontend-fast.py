#!/usr/bin/env python3
"""Deploy the built frontend to the current production Docker nginx mount.

This intentionally deploys only frontend/dist to /opt/matrixflow/frontend/dist.
It does not run git reset on the server and does not touch the backend.
"""

from __future__ import annotations

import argparse
import os
import re
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
DEFAULT_TARGET = "/opt/matrixflow/frontend/dist"
DEFAULT_CONTAINER = "matrixflow-frontend"
DEFAULT_PUBLIC_URL = "https://ddddkiii.com"


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def run_local(command: list[str]) -> None:
    executable = shutil.which(command[0])
    if executable:
        command = [executable, *command[1:]]
    print("+ " + " ".join(command))
    subprocess.run(command, cwd=ROOT, check=True)


def dirty_frontend_source() -> list[str]:
    proc = subprocess.run(
        ["git", "status", "--short", "--", "frontend/src", "frontend/package.json", "frontend/vite.config.ts"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    return [line for line in proc.stdout.splitlines() if line.strip()]


def build_archive() -> Path:
    dist = ROOT / "frontend" / "dist"
    index = dist / "index.html"
    if not index.exists():
        raise SystemExit("frontend/dist/index.html not found. Run the build first.")

    out = ROOT / "scripts" / "dist.tar.gz"
    with tarfile.open(out, "w:gz") as tar:
        tar.add(dist, arcname="dist")
    print(f"archive={out}")
    return out


def read_index_ref_from_file(index: Path) -> str:
    text = index.read_text(encoding="utf-8", errors="replace")
    match = re.search(r"assets/js/index-[^\" ]+", text)
    if not match:
        raise SystemExit(f"Could not find index asset ref in {index}")
    return match.group(0)


def fetch_public_ref(public_url: str) -> str:
    url = public_url.rstrip("/") + f"/?codex={int(time.time())}"
    request = urllib.request.Request(
        url,
        headers={
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "User-Agent": "Mozilla/5.0 CodexDeployVerify",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        text = response.read().decode("utf-8", errors="replace")
    match = re.search(r"assets/js/index-[^\" ]+", text)
    if not match:
        raise RuntimeError("Could not find public index asset ref")
    return match.group(0)


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


def exec_remote(client, command: str, timeout: int = 180) -> tuple[str, str, int]:
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    return out, err, code


def deploy_archive(client, archive: Path, target: str, container: str) -> str:
    stamp = time.strftime("%Y%m%d%H%M%S")
    remote_tar = f"/tmp/matrixflow-frontend-fast-{stamp}.tar.gz"

    sftp = client.open_sftp()
    try:
        sftp.put(str(archive), remote_tar)
    finally:
        sftp.close()

    command = textwrap.dedent(
        f"""
        set -euo pipefail
        STAMP={shlex.quote(stamp)}
        TAR={shlex.quote(remote_tar)}
        TMP=/tmp/matrixflow-release-fast-$STAMP
        TARGET={shlex.quote(target)}
        CONTAINER={shlex.quote(container)}
        BACKUP=/tmp/matrixflow-frontend-dist-backup-$STAMP

        case "$TARGET" in
          /opt/matrixflow/frontend/dist) ;;
          *) echo "Refusing unexpected target: $TARGET" >&2; exit 2 ;;
        esac

        rm -rf "$TMP"
        mkdir -p "$TMP" "$TARGET" "$BACKUP"
        tar -xzf "$TAR" -C "$TMP"
        test -f "$TMP/dist/index.html"

        if [ -d "$TARGET" ]; then
          cp -a "$TARGET/." "$BACKUP/" || true
          find "$TARGET" -mindepth 1 -maxdepth 1 -exec rm -rf {{}} +
        fi

        cp -a "$TMP/dist/." "$TARGET/"
        chmod -R a+rX "$TARGET"

        if docker ps --format '{{{{.Names}}}}' | grep -qx "$CONTAINER"; then
          docker exec "$CONTAINER" nginx -s reload >/tmp/nginx-reload-$STAMP.log 2>&1 || docker restart "$CONTAINER"
        fi

        printf 'remote_ref='
        grep -o 'assets/js/index-[^" ]*' "$TARGET/index.html" | head -1
        printf 'origin_ref='
        curl -s --max-time 8 -H 'Host: ddddkiii.com' http://127.0.0.1/ | grep -o 'assets/js/index-[^" ]*' | head -1 || true
        printf 'backup=%s\\n' "$BACKUP"
        """
    )
    out, err, code = exec_remote(client, command)
    print(out, end="")
    if err.strip():
        print(err, file=sys.stderr)
    if code != 0:
        raise SystemExit(f"Remote deploy failed with exit code {code}")
    match = re.search(r"remote_ref=(assets/js/index-[^\s]+)", out)
    if not match:
        raise SystemExit("Remote deploy succeeded but remote_ref was not found")
    return match.group(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy frontend/dist to production nginx Docker mount.")
    parser.add_argument("--skip-typecheck", action="store_true")
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--skip-public-verify", action="store_true")
    parser.add_argument("--allow-dirty-source", action="store_true")
    parser.add_argument("--target", default=DEFAULT_TARGET)
    parser.add_argument("--container", default=DEFAULT_CONTAINER)
    parser.add_argument("--public-url", default=DEFAULT_PUBLIC_URL)
    args = parser.parse_args()

    if args.skip_typecheck and args.skip_build:
        raise SystemExit("Refusing to skip both typecheck and build. Build from source or adjust the script intentionally.")

    dirty = dirty_frontend_source()
    if dirty and not args.allow_dirty_source:
        print("Dirty frontend source detected:")
        for line in dirty[:30]:
            print(f"  {line}")
        if len(dirty) > 30:
            print(f"  ... {len(dirty) - 30} more")
        raise SystemExit("Pass --allow-dirty-source only after recording the change in docs/project-change-log.md.")

    if not args.skip_typecheck:
        run_local(["npm", "run", "typecheck", "--workspace=frontend"])
    if not args.skip_build:
        run_local(["npm", "run", "build", "--workspace=frontend"])

    local_ref = read_index_ref_from_file(ROOT / "frontend" / "dist" / "index.html")
    print(f"local_ref={local_ref}")
    archive = build_archive()

    env = parse_env(ROOT / "secrets.env")
    client = connect_ssh(env)
    try:
        remote_ref = deploy_archive(client, archive, args.target, args.container)
    finally:
        client.close()

    if remote_ref != local_ref:
        raise SystemExit(f"Remote ref mismatch: local={local_ref}, remote={remote_ref}")

    if not args.skip_public_verify:
        public_ref = fetch_public_ref(args.public_url)
        print(f"public_ref={public_ref}")
        if public_ref != local_ref:
            raise SystemExit(f"Public ref mismatch: local={local_ref}, public={public_ref}")

    print("DEPLOY SUCCESS")


if __name__ == "__main__":
    main()
