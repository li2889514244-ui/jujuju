#!/bin/bash
echo '=== Docker containers ==='
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>&1 | head -10
echo '=== Docker compose ==='
cd /opt/matrixflow && (docker compose ps 2>&1 || docker-compose ps 2>&1)
echo '=== Project files ==='
ls -la /opt/matrixflow/ 2>&1 | head -5
echo '=== Frontend dist ==='
ls -la /opt/matrixflow/frontend/dist/ 2>&1 | head -5
echo '=== Git log ==='
cd /opt/matrixflow && git log --oneline -3 2>&1
echo '=== Backend process ==='
curl -s http://localhost:3000/api/v1/health 2>&1
echo ''
echo '=== PM2 logs ==='
pm2 logs matrixflow --lines 5 --nostream 2>&1
