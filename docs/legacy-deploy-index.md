# Legacy Deployment Index

Last updated: 2026-07-03

This file lists deployment-related entry points that were unsafe, stale, or ambiguous. The highest-risk files were removed from the runnable repo paths on 2026-07-03 so deployment work starts from the official entry points.

## Official Entry Points

| Purpose              | File                              | Status                                                             |
| -------------------- | --------------------------------- | ------------------------------------------------------------------ |
| Production diagnosis | `scripts/diagnose-production.py`  | Official, read-only by default                                     |
| Frontend deploy      | `scripts/deploy-frontend-fast.py` | Official, deploys only to `/opt/matrixflow/frontend/dist`          |
| Backend deploy       | `scripts/deploy-backend-safe.py`  | Official, plan by default, production change only with `--execute` |

## High-Risk Legacy Entries

These were removed from runnable repo paths on 2026-07-03.

| File                                 | Risk                                                      | Status  |
| ------------------------------------ | --------------------------------------------------------- | ------- |
| `deploy.sh`                          | Remote reset / old all-in-one flow                        | Removed |
| `deploy-full.sh`                     | Mixed git reset, frontend, backend, ports, nginx          | Removed |
| `final-deploy.sh`                    | One-off deployment script                                 | Removed |
| `fix-deploy.sh`                      | Emergency semantics without current topology guard        | Removed |
| `deploy-all.js`                      | All-in-one deployment risk                                | Removed |
| `deploy-full.js`                     | All-in-one deployment risk                                | Removed |
| `deploy-frontend.js`                 | Old `/var/www/matrixflow` path                            | Removed |
| `deploy-frontend-only.js`            | Old frontend deployment assumptions                       | Removed |
| `deploy-frontend.sh`                 | Old frontend deployment assumptions                       | Removed |
| `deploy-clean.sh`                    | Old one-off cleanup/deploy assumptions                    | Removed |
| `deploy-direct.js`                   | Old direct ECS deploy assumptions                         | Removed |
| `deploy-fast.js`                     | Old direct ECS deploy assumptions                         | Removed |
| `deploy-chunk.js`                    | Old chunked ECS deploy assumptions                        | Removed |
| `deploy-ecs.py`                      | Old ECS deploy assumptions                                | Removed |
| `fix-nginx.sh`                       | Old nginx repair assumptions                              | Removed |
| `fix-overview.sh`                    | Old one-off repair assumptions                            | Removed |
| `fix.js`                             | Old hard-reset repair flow                                | Removed |
| `scripts/fix-backend.py`             | Old PM2 delete/recreate repair flow                       | Removed |
| `scripts/fix-ecs.py`                 | Old ECS repair flow with PM2 delete/recreate              | Removed |
| `scripts/fix-nginx.py`               | Old nginx kill/rewrite repair flow                        | Removed |
| `scripts/deploy-via-git.py`          | Remote `git reset --hard`; old `/var/www/matrixflow` path | Removed |
| `scripts/upload-deploy.py`           | Deletes/copies old web root                               | Removed |
| `scripts/check-services.py`          | Checks old `/var/www/matrixflow` path                     | Removed |
| `scripts/deploy-backend-hard.sh`     | Hard backend repair semantics                             | Removed |
| `scripts/deploy-backend-fix-rank.sh` | One-off fix semantics                                     | Removed |
| `scripts/deploy-backend.sh`          | Remote `git reset --hard`                                 | Removed |
| `scripts/deploy-server.sh`           | Remote `git reset --hard`; old `/var/www/matrixflow` path | Removed |
| `scripts/deploy.sh`                  | Old all-in-one deployment flow                            | Removed |
| `.github/workflows/deploy-ecs.yml`   | Legacy ECS remote commands                                | Removed |
| `.github/workflows/cd.yml`           | Legacy deploy via `deploy-ali.js`                         | Removed |
| `.github/workflows/build-deploy.yml` | Partial artifact upload flow                              | Removed |
| `.github/workflows/deploy.cjs`       | Legacy remote executor                                    | Removed |
| `.github/workflows/deploy.mjs`       | Legacy remote executor                                    | Removed |

## Conflicting Infrastructure Artifacts

These may be useful as references, but they are not the current production truth:

- `k8s/`
- `render.yaml`
- `railway.json`
- `backend/railway.toml`
- `docker-compose.yml`
- `backend/docker-compose.yml`
- `nginx-matrixflow.conf`
- `docker/nginx/*.conf`

Treat them as historical or future-migration material until a separate infrastructure migration plan says otherwise.

## Cleanup Policy

1. Keep the official entry points obvious.
2. Keep historical reasons in docs, not runnable scripts.
3. Do not restore removed deployment scripts unless there is a written migration plan.
4. Delete only local repo files; never delete production server files as part of repo cleanup.

Never delete login profiles, data directories, backups, or credentials as part of script cleanup.
