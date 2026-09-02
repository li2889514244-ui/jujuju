#!/usr/bin/env python3
"""Deploy and verify the MatrixFlow Cloudflare Worker route.

Default mode is read-only: it compiles the Worker with Wrangler dry-run and
checks whether public traffic carries the expected Worker marker header.
Production is changed only when --execute is passed.
"""

from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import tomllib
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKER_DIR = ROOT / "cloudflare" / "matrixflow-origin-proxy"
PUBLIC_HEALTH_URL = "https://ddddkiii.com/api/v1/health"
EXPECTED_HEADER = "x-matrixflow-entry"
EXPECTED_HEADER_VALUE = "cloudflare-worker"


def configure_console_encoding() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="replace")


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


def cloudflare_env() -> dict[str, str]:
    env = os.environ.copy()
    # 与 publish-companion-download.py 保持一致：优先 .env.local（本机可用、无 IP 限制的 token），
    # 其次 secrets.env。secrets.env 里的 cfat_ token 带 IP 白名单，换 IP 后 wrangler 会报 9109。
    local_env = parse_env(ROOT / ".env.local") if (ROOT / ".env.local").exists() else {}
    file_env = parse_env(ROOT / "secrets.env")

    token = (
        env.get("CLOUDFLARE_API_TOKEN")
        or env.get("CF_API_TOKEN")
        or local_env.get("CLOUDFLARE_API_TOKEN")
        or local_env.get("CF_API_TOKEN")
        or file_env.get("CLOUDFLARE_API_TOKEN")
        or file_env.get("CF_API_TOKEN")
    )
    account_id = (
        env.get("CLOUDFLARE_ACCOUNT_ID")
        or env.get("CF_ACCOUNT_ID")
        or local_env.get("CLOUDFLARE_ACCOUNT_ID")
        or local_env.get("CF_ACCOUNT_ID")
        or file_env.get("CLOUDFLARE_ACCOUNT_ID")
        or file_env.get("CF_ACCOUNT_ID")
    )

    if token:
        env["CLOUDFLARE_API_TOKEN"] = token
        env.pop("CF_API_TOKEN", None)
    if account_id:
        env["CLOUDFLARE_ACCOUNT_ID"] = account_id
        env.pop("CF_ACCOUNT_ID", None)

    return env


def worker_vars() -> dict[str, str]:
    config = WORKER_DIR / "wrangler.toml"
    with config.open("rb") as fp:
        data = tomllib.load(fp)
    values = data.get("vars") or {}
    return {str(key): str(value) for key, value in values.items()}


def require_safe_origin_config() -> None:
    values = worker_vars()
    origin_host = values.get("ORIGIN_HOST", "")
    resolve_host = values.get("ORIGIN_RESOLVE_HOST", "")
    if origin_host.replace(".", "").isdigit() and not resolve_host:
        raise SystemExit(
            "Refusing to deploy Worker routes with a direct IP ORIGIN_HOST. "
            "Cloudflare Workers return error 1003 for this production path. "
            "Create a same-zone origin hostname and set ORIGIN_RESOLVE_HOST first."
        )
    if not resolve_host:
        raise SystemExit("Set ORIGIN_RESOLVE_HOST in wrangler.toml before --execute.")
    try:
        socket.getaddrinfo(resolve_host, 80)
    except socket.gaierror as exc:
        raise SystemExit(
            f"ORIGIN_RESOLVE_HOST={resolve_host!r} does not resolve yet. "
            "Create it as a same-zone origin hostname before --execute. "
            "For MatrixFlow production this should resolve through the Cloudflare Tunnel, "
            "not directly to the ECS IP."
        ) from exc


def run_wrangler(args: list[str], *, env: dict[str, str]) -> None:
    if not WORKER_DIR.exists():
        raise SystemExit(f"Missing Worker directory: {WORKER_DIR}")
    npm = shutil.which("npm")
    if not npm:
        raise SystemExit("npm is required to run Wrangler")
    command = [npm, "exec", "--", "wrangler", *args]
    print("+ " + " ".join(command))
    proc = subprocess.run(command, cwd=WORKER_DIR, env=env, check=False, timeout=180)
    if proc.returncode != 0:
        raise SystemExit(
            "Wrangler failed. If this was a deploy, verify CLOUDFLARE_API_TOKEN "
            "and CLOUDFLARE_ACCOUNT_ID have permission to edit Workers scripts and routes."
        )


def fetch_worker_header() -> tuple[int, str | None]:
    request = urllib.request.Request(
        PUBLIC_HEALTH_URL,
        headers={
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "User-Agent": "MatrixFlowWorkerDeployVerify",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, response.headers.get(EXPECTED_HEADER)
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get(EXPECTED_HEADER)


def verify_public_route(*, required: bool) -> bool:
    status, header = fetch_worker_header()
    active = status == 200 and header == EXPECTED_HEADER_VALUE
    print(f"public_health={status}")
    print(f"{EXPECTED_HEADER}={header!r}")
    if active:
        print("WORKER ROUTE ACTIVE")
        return True
    message = (
        f"Worker route is not active; expected {EXPECTED_HEADER}: "
        f"{EXPECTED_HEADER_VALUE} on {PUBLIC_HEALTH_URL}."
    )
    if required:
        raise SystemExit(message)
    print("WARN: " + message)
    return False


def main() -> int:
    configure_console_encoding()
    parser = argparse.ArgumentParser(description="Deploy and verify the MatrixFlow Cloudflare Worker.")
    parser.add_argument("--execute", action="store_true", help="Actually deploy the Worker and routes.")
    parser.add_argument("--skip-dry-run", action="store_true", help="Skip Wrangler dry-run before deploy.")
    parser.add_argument("--verify-only", action="store_true", help="Only check the public Worker marker header.")
    parser.add_argument(
        "--oauth",
        action="store_true",
        help="Use wrangler's cached OAuth login (~/.wrangler/config) instead of the API token; "
        "useful when the API token is IP-allowlisted to a different network.",
    )
    args = parser.parse_args()

    if args.verify_only:
        verify_public_route(required=True)
        return 0

    env = cloudflare_env()
    if args.oauth:
        # OAuth 模式：不注入 API token，wrangler 会用 ~/.wrangler/config/default.toml
        # 里的 OAuth 登录态（自动续期），只保留 ACCOUNT_ID。
        env.pop("CLOUDFLARE_API_TOKEN", None)
        env.pop("CF_API_TOKEN", None)
    if not args.skip_dry_run:
        run_wrangler(["deploy", "--dry-run", "--outdir", "dist-dry-run"], env=env)

    if args.execute:
        if not env.get("CLOUDFLARE_ACCOUNT_ID"):
            raise SystemExit("Set CLOUDFLARE_ACCOUNT_ID before --execute.")
        if not args.oauth and not env.get("CLOUDFLARE_API_TOKEN"):
            raise SystemExit(
                "Set CLOUDFLARE_API_TOKEN before --execute (or pass --oauth to use the cached OAuth login)."
            )
        require_safe_origin_config()
        run_wrangler(["deploy"], env=env)
        verify_public_route(required=True)
    else:
        verify_public_route(required=False)
        print("Dry-run only. Pass --execute after Cloudflare credentials are valid.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
