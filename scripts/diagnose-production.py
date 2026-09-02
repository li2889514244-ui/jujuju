#!/usr/bin/env python3
"""Read-only production diagnostics for MatrixFlow.

Default mode checks local repo state and public health only. Use --remote to
run read-only SSH checks on the Aliyun ECS host. This script never writes to the
server and never restarts services.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_URL = "https://ddddkiii.com"
HEALTH_URL = PUBLIC_URL + "/api/v1/health"
COMPANION_DOWNLOAD_URL = PUBLIC_URL + "/downloads/pixingyun-mate-setup.exe"
COMPANION_DOWNLOAD_MAGIC = b"MZ"
COMPANION_DOWNLOAD_KIND = "Windows installer"
SENSITIVE_REMOTE_PORTS = (5432, 6379)
EXPECTED_WORKER_HEADER = "x-matrixflow-entry"
EXPECTED_WORKER_HEADER_VALUE = "cloudflare-worker"


DATA_SANITY_SQL = """
SELECT 'accounts=' || count(*) FROM "Account";
SELECT 'daily_stats=' || count(*) FROM "DailyStats";
SELECT 'doudian_stores=' || count(*) FROM "DoudianStore";
SELECT 'wechat_stores=' || count(*) FROM "WechatStore";
SELECT 'doudian_orders=' || count(*) FROM "DoudianStoreOrder";
SELECT 'doudian_products=' || count(*) FROM "DoudianStoreProduct";
SELECT 'doudian_aftersales=' || count(*) FROM "DoudianStoreAftersale";
SELECT 'negative_account_rows=' || count(*) FROM "Account"
  WHERE followers < 0 OR likes < 0 OR following < 0;
SELECT 'negative_daily_stats_rows=' || count(*) FROM "DailyStats"
  WHERE followers < 0 OR views < 0 OR likes < 0 OR comments < 0 OR shares < 0
     OR revenue < 0 OR gmv < 0 OR orders < 0 OR commission < 0
     OR "buyerCount" < 0 OR "productCount" < 0;
SELECT 'orphan_daily_stats=' || count(*)
  FROM "DailyStats" ds
  LEFT JOIN "Account" a ON a.id = ds."accountId"
  WHERE a.id IS NULL;
SELECT 'orphan_posts=' || count(*)
  FROM "Post" p
  LEFT JOIN "Account" a ON a.id = p."accountId"
  WHERE a.id IS NULL;
SELECT 'orphan_post_stats=' || count(*)
  FROM "PostStats" ps
  LEFT JOIN "Post" p ON p.id = ps."postId"
  WHERE p.id IS NULL;
SELECT 'future_daily_stats=' || count(*)
  FROM "DailyStats"
  WHERE date > now() + interval '1 day';
SELECT 'blank_account_nicknames=' || count(*)
  FROM "Account"
  WHERE trim(nickname) = '';
SELECT 'negative_doudian_order_rows=' || count(*)
  FROM "DoudianStoreOrder"
  WHERE "payAmount" < 0 OR "postAmount" < 0 OR "productCount" < 0;
SELECT 'orphan_doudian_orders=' || count(*)
  FROM "DoudianStoreOrder" o
  LEFT JOIN "DoudianStore" s ON s.id = o."storeId"
  WHERE s.id IS NULL;
-- 订单/售后表唯一键漂移保护：出现重复行会直接让 总订单=有效+退款 失真
SELECT 'doudian_duplicate_orders=' || count(*) FROM (
  SELECT "storeId", "orderId" FROM "DoudianStoreOrder"
  GROUP BY "storeId", "orderId" HAVING count(*) > 1
) t;
SELECT 'doudian_duplicate_aftersales=' || count(*) FROM (
  SELECT "storeId", "afterSaleId" FROM "DoudianStoreAftersale"
  GROUP BY "storeId", "afterSaleId" HAVING count(*) > 1
) t;
SELECT 'wechat_duplicate_orders=' || count(*) FROM (
  SELECT "storeId", "orderId" FROM "WechatStoreOrder"
  GROUP BY "storeId", "orderId" HAVING count(*) > 1
) t;
SELECT 'wechat_duplicate_aftersales=' || count(*) FROM (
  SELECT "storeId", "afterSaleOrderId" FROM "WechatStoreAftersale"
  GROUP BY "storeId", "afterSaleOrderId" HAVING count(*) > 1
) t;
-- 无主售后行：店铺不存在时按订单日归集退款会静默丢数
SELECT 'orphan_doudian_aftersales=' || count(*)
  FROM "DoudianStoreAftersale" a
  LEFT JOIN "DoudianStore" s ON s.id = a."storeId"
  WHERE s.id IS NULL;
SELECT 'orphan_wechat_orders=' || count(*)
  FROM "WechatStoreOrder" o
  LEFT JOIN "WechatStore" s ON s.id = o."storeId"
  WHERE s.id IS NULL;
SELECT 'orphan_wechat_aftersales=' || count(*)
  FROM "WechatStoreAftersale" a
  LEFT JOIN "WechatStore" s ON s.id = a."storeId"
  WHERE s.id IS NULL;
-- 订单日为 0 的行无法按天归集（退款会归错天）
SELECT 'doudian_orders_zero_create_time=' || count(*)
  FROM "DoudianStoreOrder" WHERE "createTime" <= 0;
SELECT 'wechat_orders_zero_create_time=' || count(*)
  FROM "WechatStoreOrder" WHERE "createTime" <= 0;
-- 负金额售后行
SELECT 'negative_doudian_aftersale_rows=' || count(*)
  FROM "DoudianStoreAftersale" WHERE "amount" < 0;
SELECT 'negative_wechat_aftersale_rows=' || count(*)
  FROM "WechatStoreAftersale" WHERE "amount" < 0;
-- 信息性指标：跨日退款数量（退款发生日晚于订单日，口径应归订单日，非错误）
SELECT 'cross_day_doudian_refunds=' || count(*)
  FROM "DoudianStoreAftersale" a
  JOIN "DoudianStoreOrder" o
    ON o."storeId" = a."storeId" AND o."orderId" = a."orderId"
  WHERE a.status IN (12, 27)
    AND (to_timestamp(a."updateTime") AT TIME ZONE 'Asia/Shanghai')::date
      > (to_timestamp(o."createTime") AT TIME ZONE 'Asia/Shanghai')::date;
"""


API_CONSISTENCY_SQL = """
SELECT 'accounts_total=' || count(*) FROM "Account";
SELECT 'accounts_active=' || count(*) FROM "Account" WHERE status = 'ACTIVE';
SELECT 'total_followers=' || COALESCE(sum(followers), 0) FROM "Account";
SELECT 'total_likes=' || COALESCE(sum(likes), 0) FROM "Account";
SELECT 'posts_total=' || count(*) FROM "Post";
SELECT 'posts_published=' || count(*) FROM "Post" WHERE status = 'PUBLISHED';
SELECT 'doudian_stores=' || count(*) FROM "DoudianStore";
"""


API_CONSISTENCY_NODE = r"""
const crypto = require('crypto');

const expected = Object.fromEntries(
  process.env.EXPECTED_LINES
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [key, value] = line.split('=');
      return [key, Number(value)];
    }),
);

const [sub, email, role] = process.env.USER_ROW.split('|');
function b64url(input) {
  return Buffer.from(input).toString('base64url');
}
const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const payload = b64url(JSON.stringify({ sub, email, role, iat: now, exp: now + 300 }));
const signature = crypto
  .createHmac('sha256', process.env.JWT_SECRET)
  .update(`${header}.${payload}`)
  .digest('base64url');
const token = `${header}.${payload}.${signature}`;

async function getJson(path) {
  const response = await fetch(`http://localhost:3000${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const body = JSON.parse(text);
  if (body.code !== 0) {
    throw new Error(`${path} returned non-success body: ${text.slice(0, 200)}`);
  }
  return body.data;
}

(async () => {
  const failures = [];
  const overview = await getJson('/api/v1/analytics/overview');
  const accounts = await getJson('/api/v1/accounts?page=1&limit=1');
  const doudianStores = await getJson('/api/v1/doudian-browser/stores');

  const checks = [
    ['overview.accounts.total', overview.accounts?.total, expected.accounts_total],
    ['overview.accounts.active', overview.accounts?.active, expected.accounts_active],
    ['overview.accounts.totalFollowers', overview.accounts?.totalFollowers, expected.total_followers],
    ['overview.accounts.totalLikes', overview.accounts?.totalLikes, expected.total_likes],
    ['overview.posts.total', overview.posts?.total, expected.posts_total],
    ['overview.posts.published', overview.posts?.published, expected.posts_published],
    ['accounts.total', accounts.total, expected.accounts_total],
    ['doudianStores.length', Array.isArray(doudianStores) ? doudianStores.length : -1, expected.doudian_stores],
  ];

  for (const [name, actual, wanted] of checks) {
    console.log(`${name}=${actual}`);
    if (actual !== wanted) {
      failures.push(`${name}: api=${actual} db=${wanted}`);
    }
  }

  if (Array.isArray(doudianStores) && doudianStores.some((store) => 'profilePath' in store)) {
    failures.push('doudianStores leaked profilePath');
  }

  // 口径恒等式（总订单 = 有效订单 + 退款订单）：对每家抖店抽查最近 30 天汇总。
  const nowSec = Math.floor(Date.now() / 1000);
  const rangeStart = nowSec - 30 * 86400;
  let doudianInvariantViolations = 0;
  if (Array.isArray(doudianStores)) {
    for (const store of doudianStores) {
      if (!store || !store.id) continue;
      try {
        const summary = await getJson(
          '/api/v1/doudian-browser/shop/summary?store_id=' + encodeURIComponent(store.id) +
            '&start=' + rangeStart + '&end=' + nowSec + '&mode=month',
        );
        const total = summary?.totalOrderCount;
        const valid = summary?.validOrderCount;
        const refunded = summary?.refundedOrderCount;
        if (typeof total === 'number' && typeof valid === 'number' && typeof refunded === 'number') {
          if (total !== valid + refunded) {
            doudianInvariantViolations += 1;
            failures.push(
              'doudian invariant: store=' + store.id + ' total=' + total + ' valid=' + valid + ' refunded=' + refunded,
            );
          }
        } else {
          failures.push('doudian summary missing counts for store=' + store.id);
        }
      } catch (error) {
        failures.push('doudian summary check failed for store=' + store.id + ': ' + error.message);
      }
    }
  }
  console.log('doudian_invariant_violations=' + doudianInvariantViolations);

  if (failures.length) {
    console.error('API_CONSISTENCY_FAILED');
    for (const failure of failures) {
      console.error(failure);
    }
    process.exit(1);
  }

  console.log('api_consistency=ok');
})().catch((error) => {
  console.error('API_CONSISTENCY_FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
"""


def configure_console_encoding() -> None:
    """Keep Windows terminals from crashing on PM2/Docker Unicode output."""
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


def fetch_with_headers(
    url: str,
    timeout: int = 15,
    method: str = "GET",
    data: bytes | None = None,
    extra_headers: dict[str, str] | None = None,
) -> tuple[int, str, dict[str, str]]:
    headers = {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "User-Agent": "MatrixFlowProductionDiagnose",
    }
    if extra_headers:
        headers.update(extra_headers)
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(
        url,
        method=method,
        data=data,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            body = res.read(500).decode("utf-8", errors="replace")
            response_headers = {k.lower(): v for k, v in res.headers.items()}
            return res.status, body.strip(), response_headers
    except urllib.error.HTTPError as exc:
        body = exc.read(500).decode("utf-8", errors="replace")
        response_headers = {k.lower(): v for k, v in exc.headers.items()}
        return exc.code, body.strip(), response_headers
    except Exception as exc:  # noqa: BLE001
        return 0, repr(exc), {}


def fetch(url: str, timeout: int = 15, method: str = "GET", data: bytes | None = None) -> tuple[int, str]:
    status, body, _headers = fetch_with_headers(url, timeout=timeout, method=method, data=data)
    return status, body


def fetch_binary_prefix(url: str, size: int = 16, timeout: int = 20) -> tuple[int, bytes, dict[str, str]]:
    headers = {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Range": f"bytes=0-{max(size - 1, 0)}",
        "User-Agent": "MatrixFlowProductionDiagnose",
    }
    req = urllib.request.Request(url, method="GET", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            response_headers = {k.lower(): v for k, v in res.headers.items()}
            return res.status, res.read(size), response_headers
    except urllib.error.HTTPError as exc:
        response_headers = {k.lower(): v for k, v in exc.headers.items()}
        return exc.code, exc.read(size), response_headers
    except Exception as exc:  # noqa: BLE001
        return 0, repr(exc).encode("utf-8", errors="replace"), {}


def find_public_sensitive_port_binds(output: str) -> list[str]:
    findings: list[str] = []
    public_bind_pattern = r"(?:0\.0\.0\.0|\[::\]|::|\*)"
    for line in output.splitlines():
        if not line.strip():
            continue
        for port in SENSITIVE_REMOTE_PORTS:
            if re.search(rf"{public_bind_pattern}:{port}\b", line):
                findings.append(line.strip())
                break
    return findings


def probe_tcp(host: str, port: int, timeout: float = 5.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


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


def parse_key_values(output: str) -> dict[str, int]:
    values: dict[str, int] = {}
    for raw in output.splitlines():
        line = raw.strip()
        if not line or "=" not in line:
            continue
        key, value = line.split("=", 1)
        try:
            values[key] = int(value)
        except ValueError:
            continue
    return values


def evaluate_data_sanity(output: str) -> list[str]:
    values = parse_key_values(output)
    failures: list[str] = []
    zero_required = [
        "negative_account_rows",
        "negative_daily_stats_rows",
        "orphan_daily_stats",
        "orphan_posts",
        "orphan_post_stats",
        "future_daily_stats",
        "blank_account_nicknames",
        "negative_doudian_order_rows",
        "orphan_doudian_orders",
        "doudian_duplicate_orders",
        "doudian_duplicate_aftersales",
        "wechat_duplicate_orders",
        "wechat_duplicate_aftersales",
        "orphan_doudian_aftersales",
        "orphan_wechat_orders",
        "orphan_wechat_aftersales",
        "doudian_orders_zero_create_time",
        "wechat_orders_zero_create_time",
        "negative_doudian_aftersale_rows",
        "negative_wechat_aftersale_rows",
    ]

    for key in zero_required:
        if values.get(key, 0) != 0:
            failures.append(f"{key}={values.get(key, 'missing')} expected 0")
    return failures


def build_data_sanity_command() -> str:
    return (
        "docker exec -i matrixflow-db psql -U postgres -d matrixflow "
        "-v ON_ERROR_STOP=1 -At <<'SQL'\n"
        + DATA_SANITY_SQL.strip()
        + "\nSQL"
    )


def build_api_consistency_command() -> str:
    return (
        "set -euo pipefail\n"
        "cd /opt/matrixflow/backend\n"
        "JWT_SECRET=\"$(grep '^JWT_SECRET=' .env | tail -1 | cut -d= -f2-)\"\n"
        "USER_ROW=\"$(docker exec -i matrixflow-db psql -U postgres -d matrixflow -Atc "
        "\"SELECT id || '|' || email || '|' || role FROM \\\"User\\\" "
        "WHERE status='ACTIVE' "
        "ORDER BY CASE WHEN role IN ('SUPER_ADMIN','OWNER','ADMIN') THEN 0 ELSE 1 END, \\\"createdAt\\\" "
        "LIMIT 1\")\"\n"
        "EXPECTED_LINES=\"$(docker exec -i matrixflow-db psql -U postgres -d matrixflow "
        "-v ON_ERROR_STOP=1 -At <<'SQL'\n"
        + API_CONSISTENCY_SQL.strip()
        + "\nSQL\n"
        ")\"\n"
        "export JWT_SECRET USER_ROW EXPECTED_LINES\n"
        "node <<'NODE'\n"
        + API_CONSISTENCY_NODE.strip()
        + "\nNODE"
    )


def section(title: str) -> None:
    print(f"\n== {title} ==")


def main() -> int:
    configure_console_encoding()

    parser = argparse.ArgumentParser(description="Read-only MatrixFlow production diagnostics.")
    parser.add_argument("--remote", action="store_true", help="Run read-only checks on the ECS server.")
    parser.add_argument(
        "--require-worker-route",
        action="store_true",
        help="Fail if public traffic is not passing through matrixflow-origin-proxy.",
    )
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
    else:
        try:
            health = json.loads(body)
            health_status = (health.get("data") or {}).get("status")
            if health_status != "ok":
                print(f"health data.status is {health_status!r}, expected 'ok'")
                failures += 1
        except Exception as exc:  # noqa: BLE001
            print(f"health JSON parse failed: {exc}")
            failures += 1

    status_code, body = fetch(PUBLIC_URL)
    print(f"{PUBLIC_URL}: HTTP {status_code}, body bytes sample={len(body)}")
    if status_code != 200:
        failures += 1

    section("Cloudflare Worker Route")
    status_code, _body, headers = fetch_with_headers(HEALTH_URL)
    worker_header = headers.get(EXPECTED_WORKER_HEADER)
    print(f"{HEALTH_URL}: HTTP {status_code}, {EXPECTED_WORKER_HEADER}={worker_header!r}")
    if worker_header == EXPECTED_WORKER_HEADER_VALUE:
        print("Worker route is active for public health traffic.")
    else:
        message = (
            "Worker route is not active for public health traffic; expected "
            f"{EXPECTED_WORKER_HEADER}: {EXPECTED_WORKER_HEADER_VALUE}."
        )
        if args.require_worker_route:
            print("ERROR: " + message)
            failures += 1
        else:
            print("WARN: " + message)

    section("Companion Download")
    status_code, prefix, download_headers = fetch_binary_prefix(COMPANION_DOWNLOAD_URL)
    content_type = download_headers.get("content-type", "")
    content_range = download_headers.get("content-range", "")
    content_length = download_headers.get("content-length", "")
    print(
        f"{COMPANION_DOWNLOAD_URL}: HTTP {status_code}, "
        f"content-type={content_type!r}, content-length={content_length!r}, "
        f"content-range={content_range!r}, first4={prefix[:4].hex()}"
    )
    if status_code not in (200, 206) or not prefix.startswith(COMPANION_DOWNLOAD_MAGIC):
        print(f"  expected a real {COMPANION_DOWNLOAD_KIND}, not an HTML fallback or error page.")
        failures += 1

    section("Anonymous Business Data Guard")
    anonymous_checks = [
        ("GET", PUBLIC_URL + "/api/v1/doudian-browser/stores", None),
        ("POST", PUBLIC_URL + "/api/v1/doudian-browser/stores", b'{"name":"probe"}'),
        ("POST", PUBLIC_URL + "/api/v1/doudian-browser/stores/probe/upload", b"{}"),
        ("GET", PUBLIC_URL + "/api/v1/doudian-browser/shop/products?store_id=probe", None),
        (
            "GET",
            PUBLIC_URL + "/api/v1/doudian-browser/shop/summary?store_id=probe&start=1&end=1&mode=today",
            None,
        ),
        ("POST", PUBLIC_URL + "/api/v1/accounts/probe/cookies", b'{"cookies":[{"name":"probe"}]}'),
    ]
    for method, url, data in anonymous_checks:
        status_code, body = fetch(url, method=method, data=data)
        print(f"{method} {url}: HTTP {status_code}")
        if status_code not in (401, 403):
            print(f"  expected 401/403; body sample={body[:120]}")
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
                "frontend ref": "docker exec matrixflow-frontend sh -lc \"grep -o 'assets/js/index-[A-Za-z0-9_-]*[.]js' /usr/share/nginx/html/index.html | head -1\" 2>/dev/null || curl -fsS -H 'Host: ddddkiii.com' http://127.0.0.1/ | grep -o 'assets/js/index-[A-Za-z0-9_-]*[.]js' | head -1 || true",
                "migrations": "cd /opt/matrixflow/backend && npx prisma migrate status 2>&1 | tail -30 || true",
                "data sanity": build_data_sanity_command(),
                "api consistency": build_api_consistency_command(),
            }
            remote_output = ""
            for name, command in remote_checks.items():
                code, out = exec_remote(client, command)
                print(f"\n-- {name} (exit {code}) --")
                print(out[:3000] or "(empty)")
                if code != 0 and name == "data sanity":
                    failures += 1
                if name == "data sanity":
                    data_failures = evaluate_data_sanity(out)
                    if data_failures:
                        print("\n-- data sanity failures --")
                        for finding in data_failures:
                            print(f"  {finding}")
                        failures += len(data_failures)
                if code != 0 and name == "api consistency":
                    failures += 1
                if name in {"docker", "ports"}:
                    remote_output += "\n" + out
            public_binds = find_public_sensitive_port_binds(remote_output)
            if public_binds:
                print("\n-- remote exposure guard --")
                print("PostgreSQL/Redis are still listening on public interfaces:")
                for line in public_binds:
                    print(f"  {line}")
                host = env.get("ECS_HOST") or env.get("ECS_IP") or "8.134.218.39"
                reachable_ports = [
                    port for port in SENSITIVE_REMOTE_PORTS if probe_tcp(host, port)
                ]
                if reachable_ports:
                    print(
                        "External TCP probe can connect to sensitive ports: "
                        + ", ".join(str(port) for port in reachable_ports)
                    )
                    failures += 1
                else:
                    print(
                        "External TCP probe could not connect to 5432/6379; "
                        "source compose still pins future DB/Redis binds to 127.0.0.1."
                    )
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
