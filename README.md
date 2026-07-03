# MatrixFlow / Pixingyun

This repository contains the MatrixFlow / Pixingyun frontend, backend, deployment scripts, and desktop companion code.

## Read This First

The current production site is not deployed by the old `/var/www/matrixflow`, Kubernetes, Render, Railway, or Cloudflare Pages paths.

Current production truth:

- Public URL: `https://ddddkiii.com`
- Public path: Cloudflare Tunnel -> Aliyun ECS -> `localhost:80`
- Frontend: Docker container `matrixflow-frontend`
- Frontend files: `/opt/matrixflow/frontend/dist`
- Backend: PM2 app `matrixflow`
- Backend entry: `/opt/matrixflow/backend/dist/main.js`
- Backend health: `https://ddddkiii.com/api/v1/health`

Before changing deployment behavior, read these files in order:

1. `LATEST_DEPLOYMENT.md`
2. `docs/deployment-retrospective-ai-handoff.md`
3. `docs/deployment-remediation-plan.md`
4. `docs/project-workflow.md`
5. `docs/legacy-deploy-index.md`

## Official Commands

Use these entry points only.

```bash
# Diagnose without changing production
python scripts/diagnose-production.py

# Deploy frontend only, after local checks
python scripts/deploy-frontend-fast.py

# Prepare or execute backend deployment
python scripts/deploy-backend-safe.py --plan
```

`scripts/deploy-backend-safe.py` does not change production unless `--execute` is passed.

## Work Rules

- Do not run legacy `deploy-all`, `deploy-full`, `final-deploy`, `fix-deploy`, or `/var/www/matrixflow` scripts.
- Do not run `git reset --hard` on the production server as part of normal deployment.
- Do not mix frontend, backend, Prisma migration, nginx, tunnel, and desktop companion changes in one deployment.
- Do not delete browser profiles, login state, database files, or production backups unless the user explicitly asks.
- Every project change must update `docs/project-change-log.md`.
- Every deployment or production incident must update `docs/deployment-log.md`.
- Every new deployment lesson must be added to `docs/deployment-retrospective-ai-handoff.md` or `docs/deployment-remediation-plan.md`.

## Change Types

| Change type             | Official path                         | Required record              |
| ----------------------- | ------------------------------------- | ---------------------------- |
| Frontend source         | `scripts/deploy-frontend-fast.py`     | `docs/deployment-log.md`     |
| Backend source          | `scripts/deploy-backend-safe.py`      | `docs/deployment-log.md`     |
| Prisma schema           | backend deploy with migration section | `docs/deployment-log.md`     |
| Documentation           | direct edit                           | `docs/project-change-log.md` |
| Cleanup or repo hygiene | plan first, then small batches        | `docs/project-change-log.md` |
| Incident response       | diagnose first, fix second            | both logs                    |

## Local Development

```bash
npm install
npm run dev:frontend
npm run dev:backend
```

Build checks:

```bash
npm run build:frontend
npm run build:backend
```

## Production Safety

The repository is intentionally conservative now. Some legacy files remain for historical context, but they are not official deployment entry points. If a script or document conflicts with `LATEST_DEPLOYMENT.md`, treat `LATEST_DEPLOYMENT.md` as the source of truth and update the stale file instead of following it.
