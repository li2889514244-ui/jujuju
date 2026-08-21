#!/usr/bin/env python3
"""Install MatrixFlow Cloudflare Tunnel guard scripts on production.

The guard keeps one credential source, checks the public health endpoint every
minute, distinguishes app/origin failures from Cloudflare Tunnel failures, and
prints a clear recovery path when the tunnel secret is invalid.
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
import textwrap
from io import BytesIO
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEPLOY_SCRIPT = ROOT / "scripts" / "deploy-backend-safe.py"
REMOTE_DIR = "/opt/matrixflow/scripts"
REMOTE_HEALTH = f"{REMOTE_DIR}/tunnel-health-check.sh"
REMOTE_RECOVER = f"{REMOTE_DIR}/tunnel-recover.sh"
REMOTE_STATE = "/opt/matrixflow/runtime/tunnel-health-failures"
REMOTE_LOG = "/opt/matrixflow/logs/tunnel-health.log"
CRON_FILE = "/etc/cron.d/matrixflow-tunnel-guard"
TUNNEL_COMMAND = (
    "tunnel --region us --edge-ip-version 4 --protocol quic run "
    "--dns-resolver-addrs 100.100.2.136:53 "
    "--dns-resolver-addrs 100.100.2.138:53 "
    "--token ${CF_TUNNEL_TOKEN}"
)


HEALTH_SCRIPT = r"""#!/usr/bin/env bash
set -u

PUBLIC_URL="${PUBLIC_URL:-https://ddddkiii.com/api/v1/health}"
SECONDARY_URL="${SECONDARY_URL:-https://www.ddddkiii.com/api/v1/health}"
ORIGIN_URL="${ORIGIN_URL:-http://127.0.0.1/api/v1/health}"
STATE_FILE="${STATE_FILE:-/opt/matrixflow/runtime/tunnel-health-failures}"
LAST_RECREATE_FILE="${LAST_RECREATE_FILE:-/opt/matrixflow/runtime/tunnel-last-recreate}"
LOG_FILE="${LOG_FILE:-/opt/matrixflow/logs/tunnel-health.log}"
MAX_FAILURES="${MAX_FAILURES:-3}"
RECREATE_COOLDOWN_SECONDS="${RECREATE_COOLDOWN_SECONDS:-900}"
AUTO_RECOVER="${AUTO_RECOVER:-false}"

mkdir -p "$(dirname "$STATE_FILE")" "$(dirname "$LAST_RECREATE_FILE")" "$(dirname "$LOG_FILE")"
touch "$STATE_FILE" "$LAST_RECREATE_FILE" "$LOG_FILE"

ts() { date '+%Y-%m-%d %H:%M:%S %z'; }
log() { printf '%s %s\n' "$(ts)" "$*" >> "$LOG_FILE"; }
status_code() {
  curl -k -sS -o /tmp/matrixflow-health-body.$$ -w '%{http_code}' --max-time 20 "$1" 2>/tmp/matrixflow-health-error.$$ || true
}
tunnel_recreate() {
  now="$(date +%s)"
  last="$(cat "$LAST_RECREATE_FILE" 2>/dev/null || echo 0)"
  case "$last" in ''|*[!0-9]*) last=0 ;; esac
  age=$((now - last))
  if [ "$age" -lt "$RECREATE_COOLDOWN_SECONDS" ]; then
    log "SKIP tunnel_recreate_cooldown age=${age}s cooldown=${RECREATE_COOLDOWN_SECONDS}s"
    return 0
  fi
  echo "$now" > "$LAST_RECREATE_FILE"
  cat >/etc/sysctl.d/99-cloudflared-quic.conf <<'EOF'
net.core.rmem_max=7500000
net.core.wmem_max=7500000
EOF
  sysctl --system >> "$LOG_FILE" 2>&1 || true
  for n in 2 3 4; do
    docker rm -f "matrixflow-tunnel-$n" >> "$LOG_FILE" 2>&1 || true
  done
  cd /opt/matrixflow && docker compose -f docker-compose.yml up -d --force-recreate cloudflared >> "$LOG_FILE" 2>&1 || true
}

public_code="$(status_code "$PUBLIC_URL")"
if [ "$public_code" = "200" ]; then
  if [ -n "$SECONDARY_URL" ]; then
    secondary_code="$(status_code "$SECONDARY_URL")"
    if [ "$secondary_code" = "200" ]; then
      log "OK public=200 secondary=200"
    else
      log "WARN public=200 secondary=$secondary_code"
    fi
  else
    log "OK public=200"
  fi
  echo 0 > "$STATE_FILE"
  rm -f /tmp/matrixflow-health-body.$$ /tmp/matrixflow-health-error.$$
  exit 0
fi

failures="$(cat "$STATE_FILE" 2>/dev/null || echo 0)"
case "$failures" in ''|*[!0-9]*) failures=0 ;; esac
failures=$((failures + 1))
echo "$failures" > "$STATE_FILE"
log "WARN public=$public_code consecutive_failures=$failures"

if [ "$failures" -lt "$MAX_FAILURES" ]; then
  rm -f /tmp/matrixflow-health-body.$$ /tmp/matrixflow-health-error.$$
  exit 0
fi

origin_code="$(status_code "$ORIGIN_URL")"
tunnel_status="$(docker ps --filter name=matrixflow-tunnel --format '{{.Names}} {{.Status}}' 2>/dev/null | head -1)"
tunnel_errors="$(docker logs --since 10m matrixflow-tunnel 2>&1 | grep -E 'Invalid tunnel secret|Unauthorized: Invalid tunnel secret|Registered tunnel connection|TLS handshake|Unable to establish connection' | tail -20 || true)"

if [ "$origin_code" = "200" ]; then
  log "ALERT tunnel_or_edge_failure public=$public_code origin=200 tunnel=${tunnel_status:-missing}"
  if printf '%s\n' "$tunnel_errors" | grep -q 'Invalid tunnel secret'; then
    log "ACTION_REQUIRED invalid_tunnel_secret: run /opt/matrixflow/scripts/tunnel-recover.sh --login, authorize Cloudflare, then run /opt/matrixflow/scripts/tunnel-recover.sh --apply"
  else
    if [ "$AUTO_RECOVER" = "true" ]; then
      log "ACTION tunnel_recreate_attempt"
      tunnel_recreate
      sleep 90
      retry_code="$(status_code "$PUBLIC_URL")"
      log "AFTER_RECREATE public=$retry_code"
      [ "$retry_code" = "200" ] && echo 0 > "$STATE_FILE"
    else
      log "ACTION_REQUIRED tunnel_or_edge_failure_autorecover_disabled"
    fi
  fi
else
  log "ALERT app_or_origin_failure public=$public_code origin=$origin_code tunnel=${tunnel_status:-missing}"
fi

rm -f /tmp/matrixflow-health-body.$$ /tmp/matrixflow-health-error.$$
"""


RECOVER_SCRIPT = r"""#!/usr/bin/env bash
set -euo pipefail

TUNNEL_ID="${TUNNEL_ID:-750c57ed-6785-4c69-90c9-772c9043d96e}"
CF_DIR="/root/.cloudflared"
LOGIN_DIR="/tmp/matrixflow-cf-login"

usage() {
  cat <<EOF
Usage:
  $0 --status
  $0 --login
  $0 --apply

Recovery flow for Invalid tunnel secret:
  1. $0 --login
  2. Open the printed Cloudflare URL and authorize the account/domain.
  3. Wait until /tmp/matrixflow-cf-login/cert.pem exists.
  4. $0 --apply
EOF
}

status() {
  echo "--- public health ---"
  curl -sS -o /tmp/matrixflow-public-health -w 'public=%{http_code}\n' --max-time 20 https://ddddkiii.com/api/v1/health || true
  cat /tmp/matrixflow-public-health 2>/dev/null || true
  echo
  echo "--- origin health ---"
  curl -sS -H 'Host: ddddkiii.com' -o /tmp/matrixflow-origin-health -w 'origin=%{http_code}\n' --max-time 10 http://127.0.0.1/api/v1/health || true
  cat /tmp/matrixflow-origin-health 2>/dev/null || true
  echo
  echo "--- tunnel container ---"
  docker ps --filter name=matrixflow-tunnel --format '{{.Names}} {{.Status}} {{.Image}}' || true
  echo "--- tunnel log hints ---"
  docker logs --tail 80 matrixflow-tunnel 2>&1 | grep -E 'Invalid tunnel secret|Registered tunnel connection|ERR|WRN' | tail -40 || true
}

login() {
  docker rm -f matrixflow-cloudflared-login >/dev/null 2>&1 || true
  rm -rf "$LOGIN_DIR"
  mkdir -p "$LOGIN_DIR"
  chmod 777 "$LOGIN_DIR"
  docker run -d --name matrixflow-cloudflared-login \
    -v "$LOGIN_DIR:/home/nonroot/.cloudflared" \
    cloudflare/cloudflared:latest tunnel login >/dev/null
  sleep 4
  docker logs matrixflow-cloudflared-login 2>&1 | tail -40
  echo
  echo "After authorization, check: ls -l $LOGIN_DIR/cert.pem"
}

apply_token() {
  test -f "$LOGIN_DIR/cert.pem" || { echo "Missing $LOGIN_DIR/cert.pem. Run --login and authorize first." >&2; exit 2; }
  mkdir -p "$CF_DIR/backups"
  install -m 600 "$LOGIN_DIR/cert.pem" "$CF_DIR/cert.pem"
  docker run --rm -u root -v "$CF_DIR:/root/.cloudflared" \
    cloudflare/cloudflared:latest \
    --origincert "$CF_DIR/cert.pem" tunnel token "$TUNNEL_ID" > "$CF_DIR/tunnel-token.new"

  python3 - <<'PY'
from pathlib import Path
import base64, hashlib, json
p = Path('/root/.cloudflared/tunnel-token.new')
t = p.read_text().strip()
d = json.loads(base64.b64decode(t + '=' * ((4 - len(t) % 4) % 4)))
print('new_token_len=' + str(len(t)))
print('new_token_sha=' + hashlib.sha256(t.encode()).hexdigest()[:16])
print('new_tunnel_id=' + str(d.get('t')))
PY

  stamp="$(date +%Y%m%d%H%M%S)"
  cp -a "$CF_DIR/tunnel-token.env" "$CF_DIR/backups/tunnel-token.env.$stamp" 2>/dev/null || true
  cp -a "$CF_DIR/tunnel-token.txt" "$CF_DIR/backups/tunnel-token.txt.$stamp" 2>/dev/null || true
  token="$(cat "$CF_DIR/tunnel-token.new")"
  printf 'TUNNEL_TOKEN=%s\n' "$token" > "$CF_DIR/tunnel-token.env"
  printf '%s\n' "$token" > "$CF_DIR/tunnel-token.txt"
  chmod 600 "$CF_DIR/tunnel-token.env" "$CF_DIR/tunnel-token.txt"
  rm -f "$CF_DIR/tunnel-token.new"

  python3 - <<'PY'
from pathlib import Path
token = Path('/root/.cloudflared/tunnel-token.txt').read_text().strip()
for filename in ['/opt/matrixflow/.env', '/opt/matrixflow/backend/.env']:
    p = Path(filename)
    if not p.exists():
        continue
    lines = p.read_text(errors='replace').splitlines()
    out = []
    replaced = False
    for line in lines:
        if line.startswith('CF_TUNNEL_TOKEN='):
            out.append('CF_TUNNEL_TOKEN=' + token)
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.append('CF_TUNNEL_TOKEN=' + token)
    p.write_text('\n'.join(out) + '\n')
PY

  cd /opt/matrixflow
  docker compose -f docker-compose.yml up -d --force-recreate cloudflared >/dev/null
  sleep 25
  status
  docker rm -f matrixflow-cloudflared-login >/dev/null 2>&1 || true
}

case "${1:-}" in
  --status) status ;;
  --login) login ;;
  --apply) apply_token ;;
  *) usage; exit 2 ;;
esac
"""


def load_deploy_module():
    spec = importlib.util.spec_from_file_location("deploy_backend_safe", DEPLOY_SCRIPT)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Cannot load {DEPLOY_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def install(client, deploy_module, *, execute: bool) -> None:
    if not execute:
        print("Install plan")
        print(f"- Write {REMOTE_HEALTH}")
        print(f"- Write {REMOTE_RECOVER}")
        print(f"- Install cron file {CRON_FILE} to run every minute")
        print("- Verify canonical /root/.cloudflared/tunnel-token.env and run one health check")
        return

    out, err, code = deploy_module.exec_remote(
        client,
        "set -euo pipefail; mkdir -p /opt/matrixflow/scripts /opt/matrixflow/runtime /opt/matrixflow/logs",
        timeout=60,
    )
    if code != 0:
        print(out, end="")
        if err.strip():
            print(err, file=sys.stderr)
        raise SystemExit(f"Remote directory setup failed with exit code {code}")

    sftp = client.open_sftp()
    try:
        uploads = {
            REMOTE_HEALTH: HEALTH_SCRIPT,
            REMOTE_RECOVER: RECOVER_SCRIPT,
            CRON_FILE: textwrap.dedent(
                f"""\
                SHELL=/bin/bash
                PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
                * * * * * root {REMOTE_HEALTH}
                """
            ),
        }
        for remote_path, content in uploads.items():
            data = content.encode("utf-8")
            with sftp.file(remote_path, "wb") as remote_file:
                remote_file.write(data)
        sftp.chmod(REMOTE_HEALTH, 0o755)
        sftp.chmod(REMOTE_RECOVER, 0o755)
        sftp.chmod(CRON_FILE, 0o644)
    finally:
        sftp.close()

    command = f"""
set -euo pipefail
test -f /root/.cloudflared/tunnel-token.env
grep -q '^TUNNEL_TOKEN=' /root/.cloudflared/tunnel-token.env
cat > /root/.cloudflared/README.matrixflow <<'EOF'
MatrixFlow Cloudflare Tunnel canonical credential source:

  /root/.cloudflared/tunnel-token.env

The production container must be started with:

  docker compose -f /opt/matrixflow/docker-compose.yml up -d cloudflared

Current stable command:

  {TUNNEL_COMMAND}

Legacy config.yml and credentials JSON files should stay under backups/legacy-disabled-* to avoid accidentally starting the tunnel with stale secrets.
Use /opt/matrixflow/scripts/tunnel-recover.sh for recovery.
EOF
STAMP="$(date +%Y%m%d%H%M%S)"
mkdir -p "/root/.cloudflared/backups/legacy-disabled-$STAMP" "/etc/cloudflared/backups/legacy-disabled-$STAMP"
for f in /root/.cloudflared/750c57ed-6785-4c69-90c9-772c9043d96e.json /root/.cloudflared/config.yml /root/.cloudflared/config.yml.bak.20260713114239; do
  [ -f "$f" ] && mv "$f" "/root/.cloudflared/backups/legacy-disabled-$STAMP/"
done
for f in /etc/cloudflared/config.yml; do
  [ -f "$f" ] && mv "$f" "/etc/cloudflared/backups/legacy-disabled-$STAMP/"
done
rm -f /root/.cloudflared/tunnel-token.new
if docker inspect matrixflow-tunnel >/dev/null 2>&1; then
  docker inspect matrixflow-tunnel --format '{{{{json .HostConfig.NetworkMode}}}} {{{{json .HostConfig.RestartPolicy.Name}}}}' | cat
  docker inspect matrixflow-tunnel --format '{{{{json .Config.Env}}}} {{{{json .Config.Cmd}}}}' | grep -Eq 'CF_TUNNEL_TOKEN|--token'
fi
{REMOTE_HEALTH}
echo INSTALLED {REMOTE_HEALTH} {REMOTE_RECOVER} {CRON_FILE}
"""
    out, err, code = deploy_module.exec_remote(client, command, timeout=120)
    print(out, end="")
    if err.strip():
        print(err, file=sys.stderr)
    if code != 0:
        raise SystemExit(f"Remote install failed with exit code {code}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Install production Cloudflare Tunnel guard.")
    parser.add_argument("--execute", action="store_true", help="Actually install on production.")
    parser.add_argument("--plan", action="store_true", help="Print the install plan.")
    args = parser.parse_args()

    deploy_module = load_deploy_module()
    if not args.execute:
        install(None, deploy_module, execute=False)
        return 0

    env = deploy_module.parse_env(ROOT / "secrets.env")
    client = deploy_module.connect_ssh(env)
    try:
        install(client, deploy_module, execute=True)
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
