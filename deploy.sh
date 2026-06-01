#!/bin/bash
set -e
echo "[1/5] CD to project dir..."
cd /opt/matrixflow

echo "[2/5] Git fetch & force-reset to latest..."
git fetch origin master
git reset --hard origin/master

echo "[3/5] Rebuild backend dist..."
cd /opt/matrixflow/backend
npm install --legacy-peer-deps 2>/dev/null
npx tsc

echo "[4/5] Restart PM2..."
pm2 restart matrixflow
pm2 save

echo "[5/5] Rebuild & restart frontend Docker..."
cd /opt/matrixflow
docker-compose up -d --build frontend

echo "=== DEPLOY DONE ==="
pm2 status
docker-compose ps | grep frontend
