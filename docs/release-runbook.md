# MatrixFlow Release Runbook

This runbook is for the website/backend release. It does not deploy the desktop companion.

## Preflight

1. Build from a clean checkout of the release commit.
2. Back up the production PostgreSQL database and verify the backup before changing containers.
3. Confirm the production values exist for `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`,
   `JWT_REFRESH_SECRET`, `COOKIE_ENCRYPTION_KEY`, `TOKEN_ENCRYPTION_KEY`,
   `MCP_PUBLIC_BASE_URL`, and `MCP_OAUTH_REDIRECT_HOSTS`.

## Release order

The current production topology is PM2 for the backend and a Docker Nginx container for the
frontend. The Dockerfiles are CI image smoke tests; they are not a replacement for the official
production entry points below.

1. Run the read-only preflight:

   ```sh
   py -3 scripts/diagnose-production.py --remote --require-worker-route
   ```

2. Deploy the backend with the official safe script. Use `--migrate` only after the database
   backup has been verified:

   ```sh
   py -3 scripts/deploy-backend-safe.py --plan
   py -3 scripts/deploy-backend-safe.py --execute --migrate
   ```

3. Deploy the frontend with the official frontend script. It creates a remote dist backup before
   replacement:

   ```sh
   py -3 scripts/deploy-frontend-fast.py --plan
   py -3 scripts/deploy-frontend-fast.py --execute
   ```

4. Verify `/api/v1/health`, the MCP discovery endpoints, a read-only MCP request, and the public
   frontend bundle.

The application Docker images intentionally do not run migrations during normal startup. This
keeps database changes explicit and makes a failed application rollout observable before any
further database action is taken.

## Rollback

1. Restore the previous backend `dist`, `prisma`, and package manifest from the timestamped
   directory under `/opt/matrixflow/releases/backend/`, then restart PM2 and verify health.
2. Restore the previous frontend dist from the timestamped
   `/tmp/matrixflow-frontend-dist-backup-*` directory and reload the frontend Nginx container.
3. Verify health and read-only MCP behavior.
4. Do not invent a reverse Prisma migration. The MCP OAuth migration is additive; if it must be
   undone, use the verified database backup or a separately reviewed forward migration.
