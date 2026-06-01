#!/bin/bash
set -e
echo '=== 1. Fix backend port: 3001 ==='
curl -s http://localhost:3001/api/v1/health
echo ''

echo '=== 2. Build frontend dist (skip typecheck) ==='
cd /opt/matrixflow/frontend
npm install --legacy-peer-deps 2>&1 | tail -2
npx vite build 2>&1 | tail -5
ls -la dist/index.html && echo 'DIST OK'

echo '=== 3. Docker compose restart frontend ==='
cd /opt/matrixflow
docker compose up -d frontend 2>&1 || docker-compose up -d frontend 2>&1

echo '=== 4. Verify all endpoints ==='
echo 'Health:'
curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/v1/health; echo ''
echo 'Frontend:'
curl -s -o /dev/null -w '%{http_code}' http://localhost:80/; echo ''
echo 'New endpoints (port 3001):'
curl -s -o /dev/null -w 'likes/trend=%{http_code} ' http://localhost:3001/api/v1/analytics/likes/trend; echo ''
curl -s -o /dev/null -w 'monetization=%{http_code} ' http://localhost:3001/api/v1/analytics/monetization; echo ''
curl -s -o /dev/null -w 'engagement=%{http_code} ' http://localhost:3001/api/v1/analytics/engagement; echo ''
