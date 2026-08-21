# Cloudflare Tunnel Runbook

Production public traffic for `ddddkiii.com` reaches the ECS origin through the
Docker container `matrixflow-tunnel`.

Cloudflare Worker `matrixflow-origin-proxy` is attached to:

- `ddddkiii.com/*`
- `www.ddddkiii.com/*`

The Worker must not resolve directly to the ECS public IP. Direct IP HTTP
requests can be intercepted by the cloud provider's ICP filing block before
they reach Nginx. Keep `origin.ddddkiii.com` as a proxied CNAME to the
production Tunnel target and keep `ORIGIN_RESOLVE_HOST = "origin.ddddkiii.com"`
in `cloudflare/matrixflow-origin-proxy/wrangler.toml`.

## Canonical Credential

Use exactly one production credential source:

```bash
/root/.cloudflared/tunnel-token.env
```

The production tunnel container must be started with that env file:

```bash
cd /opt/matrixflow
docker compose -f docker-compose.yml up -d cloudflared
```

The current stable tunnel command is pinned to Cloudflare's US edge region and
uses Aliyun DNS resolvers:

```bash
tunnel --region us --edge-ip-version 4 --protocol quic run \
  --dns-resolver-addrs 100.100.2.136:53 \
  --dns-resolver-addrs 100.100.2.138:53 \
  --token ${CF_TUNNEL_TOKEN}
```

The ECS host keeps QUIC receive/send buffers high enough for cloudflared:

```bash
net.core.rmem_max=7500000
net.core.wmem_max=7500000
```

Do not add a shell-form Docker healthcheck to this container.
The `cloudflare/cloudflared` image does not include `/bin/sh`, so shell-form
healthchecks report the container as unhealthy even when `cloudflared` starts.
When the container is managed by `docker compose`, use exec-form healthchecks
such as `['CMD', 'cloudflared', '--version']`.

Legacy `config.yml` and credentials JSON files are disabled under
`/root/.cloudflared/backups/legacy-disabled-*` and
`/etc/cloudflared/backups/legacy-disabled-*`.

## Monitoring

The cron file `/etc/cron.d/matrixflow-tunnel-guard` runs every minute:

```bash
/opt/matrixflow/scripts/tunnel-health-check.sh
```

It checks `https://ddddkiii.com/api/v1/health`. After 3 consecutive failures it
checks the ECS origin at `http://127.0.0.1/api/v1/health`.

- Public fails and origin is `200`: Cloudflare Tunnel / edge problem.
- Public fails and origin fails: application or origin problem.
- Tunnel log contains `Invalid tunnel secret`: Cloudflare authorization is required.

For tunnel / edge failures with a healthy origin, the guard reapplies the
cloudflared sysctl buffer limits, removes temporary tunnel connector containers,
and recreates the `cloudflared` service through `/opt/matrixflow/docker-compose.yml`.

Logs:

```bash
/opt/matrixflow/logs/tunnel-health.log
```

## Recovery

Status:

```bash
/opt/matrixflow/scripts/tunnel-recover.sh --status
```

If the log says `Invalid tunnel secret`:

```bash
/opt/matrixflow/scripts/tunnel-recover.sh --login
```

Open the printed Cloudflare URL and authorize the account/domain. After
`/tmp/matrixflow-cf-login/cert.pem` appears, run:

```bash
/opt/matrixflow/scripts/tunnel-recover.sh --apply
```

Then verify:

```bash
curl -sS https://ddddkiii.com/api/v1/health
docker logs --tail 80 matrixflow-tunnel
```
