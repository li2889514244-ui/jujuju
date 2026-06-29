#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/matrixflow}"
WEB_ROOT="${WEB_ROOT:-/var/www/matrixflow}"
BRANCH="${BRANCH:-master}"

cd "$APP_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

npm ci
npm run build --workspace=backend
npm run build --workspace=frontend

pm2 restart matrixflow

rm -rf "$WEB_ROOT"/*
cp -r "$APP_DIR"/frontend/dist/* "$WEB_ROOT"/

docker exec matrixflow-frontend nginx -s reload 2>/dev/null || true
echo "DONE"
