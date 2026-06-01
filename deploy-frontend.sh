#!/bin/bash
set -e
cd /opt/matrixflow/frontend

echo "[1/3] npm install..."
npm install --legacy-peer-deps 2>/dev/null

echo "[2/3] vite build (skip type-check)..."
npx vite build

echo "[3/3] Restart frontend container..."
docker compose up -d --build frontend 2>/dev/null || docker-compose up -d --build frontend 2>/dev/null || (docker restart matrixflow-frontend && echo "restarted matrixflow-frontend")

echo "=== FRONTEND DONE ==="
ls -la dist/index.html 2>/dev/null && echo "dist OK"
docker compose ps 2>/dev/null || docker-compose ps 2>/dev/null || docker ps | grep frontend
