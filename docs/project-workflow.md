# Project Workflow

Last updated: 2026-07-03

This is the operating agreement for MatrixFlow / Pixingyun work. It exists because deployment failures came from unclear ownership, too many old entry points, missing records, and AI agents repeating old mistakes.

## Source Of Truth

Read these files before deployment or production troubleshooting:

1. `LATEST_DEPLOYMENT.md`
2. `docs/deployment-retrospective-ai-handoff.md`
3. `docs/deployment-remediation-plan.md`
4. `docs/deployment-log.md`
5. `docs/project-change-log.md`
6. `docs/legacy-deploy-index.md`

If files conflict, trust `LATEST_DEPLOYMENT.md` first and update stale docs.

## Production Rules

- Diagnose before deploying.
- Do not deploy from memory.
- Do not deploy from old scripts that reference `/var/www/matrixflow`.
- Do not run `git reset --hard` on production during normal deployment.
- Do not combine frontend, backend, Prisma migration, nginx/tunnel, and desktop companion changes in one action.
- Do not delete files, profiles, backups, or database state without an explicit user request.
- Do not assume PM2, Docker, Kubernetes, Render, or Railway is active just because a config exists.

## Official Production Model

- Frontend: Docker nginx container `matrixflow-frontend`
- Frontend path: `/opt/matrixflow/frontend/dist`
- Backend: PM2 app `matrixflow`
- Backend path: `/opt/matrixflow/backend`
- Backend port: `3000`
- Public domain: `https://ddddkiii.com`
- Health endpoint: `https://ddddkiii.com/api/v1/health`

## Required Records

Every project change must update `docs/project-change-log.md`.

Every deployment, failed deployment, production fix, or production incident must update `docs/deployment-log.md`.

Every new deployment lesson must update one of:

- `docs/deployment-retrospective-ai-handoff.md`
- `docs/deployment-remediation-plan.md`
- `docs/legacy-deploy-index.md`

## Change Workflow

1. Identify the change type.
2. Read the source-of-truth files.
3. Run or plan diagnostics.
4. Make the smallest safe change.
5. Verify locally.
6. If production is involved, verify public health.
7. Update the required logs.
8. Summarize what changed, what was verified, and what remains risky.

## Change Types

| Type           | Examples                                   | Required path                                   |
| -------------- | ------------------------------------------ | ----------------------------------------------- |
| Frontend only  | Vue views, API client, styles              | `scripts/deploy-frontend-fast.py`               |
| Backend only   | NestJS service/controller/module           | `scripts/deploy-backend-safe.py`                |
| Prisma         | `backend/prisma/schema.prisma`, migrations | backend deploy with backup and migration record |
| Infrastructure | nginx, tunnel, Docker, PM2, CI             | diagnose first; document plan before execution  |
| Documentation  | runbooks, retrospectives, README           | update project change log                       |
| Cleanup        | gitignore, legacy scripts, generated files | list candidates first; do not delete blindly    |

## Deployment Workflow

Frontend:

1. `python scripts/diagnose-production.py`
2. Check `frontend/src` changes and update `docs/project-change-log.md`.
3. `python scripts/deploy-frontend-fast.py`
4. Verify public page and health.
5. Add a row to `docs/deployment-log.md`.

Backend:

1. `python scripts/diagnose-production.py --remote`
2. Check backend changes and migration status.
3. `python scripts/deploy-backend-safe.py --plan`
4. Run `scripts/deploy-backend-safe.py --execute` only after explicit approval.
5. Verify PM2, local health, origin health, and public health.
6. Add a row to `docs/deployment-log.md`.

## Cleanup Workflow

Cleanup must be staged in small batches:

1. Inventory files.
2. Classify as source, documentation, generated artifact, profile/login state, secret, backup, or legacy script.
3. Add ignore rules first.
4. Remove from Git index only after confirming the file is generated or unsafe to track.
5. Delete physical files only after the user explicitly approves that exact category.

## Definition Of Done

A task is done only when:

- The change is implemented.
- Relevant checks were run or explicitly skipped with a reason.
- Production was not changed unless intended.
- Logs/docs were updated.
- The final answer states changed files and verification results.
