#!/bin/bash
echo "=== Kill zombie processes ==="
pkill -f "vite build" 2>/dev/null || true
pkill -f "node dist/main" 2>/dev/null || true

echo "=== Git pull latest ==="
cd /opt/matrixflow
git stash 2>/dev/null || true
git fetch origin master 2>&1
git reset --hard origin/master 2>&1
echo "Commit:" $(git log --oneline -1)

echo "=== Check dist ==="
ls -la frontend/dist/index.html 2>&1

echo "=== Start Docker services ==="
cd /opt/matrixflow
docker compose up -d 2>&1 || docker-compose up -d 2>&1
sleep 5
docker ps --format "{{.Names}} {{.Status}}" 2>&1

echo "=== Start PM2 on port 3000 ==="
pm2 delete matrixflow 2>/dev/null || true
cd /opt/matrixflow/backend
PORT=3000 pm2 start dist/main.js --name matrixflow 2>&1
pm2 save 2>&1
sleep 5

echo "=== Health check ==="
curl -s http://localhost:3000/api/v1/health 2>&1
echo ""

echo "=== API check ==="
for ep in likes/trend monetization engagement "account/1"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/analytics/$ep 2>/dev/null)
  echo "  $ep: $code"
done

echo "=== Frontend check ==="
curl -s -o /dev/null -w "Frontend: %{http_code}\n" http://localhost:80/
