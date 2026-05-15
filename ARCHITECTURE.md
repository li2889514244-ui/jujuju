# MatrixFlow Architecture

## Stack
- Frontend: Vue 3 + Pinia + Element Plus + ECharts, built with Vite
- Backend: NestJS (Node.js 22), Express adapter
- Database: PostgreSQL 16 (Docker, port 5432)
- Cache: Redis 7 (Docker, port 6379)
- Tunnel: Cloudflare Tunnel (Docker)
- Process: PM2 (fork mode, matrixflow app)

## Directory Structure
- frontend/          Vue 3 source (build with `npx vite build`)
- backend/           NestJS source + compiled dist
- desktop-companion/ Python/Flask desktop app for local publishing
- backups/           PostgreSQL daily backups (7-day rotation)

## Key Config
- .env               Backend environment variables (JWT, DB, Redis)
- prisma/schema.prisma   Database schema
- watchdog.sh        Health check + auto-restart daemon

## Common Operations
- Restart: `pm2 restart matrixflow`
- Build frontend: `cd frontend && npx vite build --outDir ../backend/public`
- DB backup: `/opt/matrixflow/backup-db.sh`
- View logs: `pm2 logs matrixflow`

## Extending
- New API modules go in backend/src/modules/
- New frontend pages in frontend/src/views/
- New database tables via prisma/schema.prisma -> `npx prisma db push`
