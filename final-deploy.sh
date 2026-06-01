#!/bin/bash
set -e

echo "=== 1. Git pull latest ==="
cd /opt/matrixflow
git fetch origin master 2>&1
git reset --hard origin/master 2>&1
echo "commit:" $(git log --oneline -1)

echo "=== 2. Check frontend dist ==="
ls -la frontend/dist/index.html 2>&1 && echo "DIST OK" || echo "DIST MISSING"

echo "=== 3. Fix PM2 to port 3000 ==="
pm2 delete matrixflow 2>/dev/null || true
cd /opt/matrixflow/backend
PORT=3000 pm2 start dist/main.js --name matrixflow --log /root/.pm2/logs/matrixflow-out.log --error /root/.pm2/logs/matrixflow-error.log 2>&1
pm2 save 2>&1
sleep 3

echo "=== 4. Verify backend ==="
curl -s http://localhost:3000/api/v1/health 2>&1

echo "=== 5. Restart frontend container ==="
docker restart matrixflow-frontend 2>&1 || (cd /opt/matrixflow && docker compose up -d frontend 2>&1) || echo "CONTAINER WARN"

echo "=== 6. Verify endpoints ==="
echo -n "likes/trend:"
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/analytics/likes/trend
echo ""
echo -n "monetization:"
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/analytics/monetization
echo ""
echo -n "engagement:"
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/analytics/engagement
echo ""
echo -n "frontend:"
curl -s -o /dev/null -w '%{http_code}' http://localhost:80/
echo ""

echo "=== 7. Docker status ==="
docker ps --format "{{.Names}} {{.Status}}" 2>&1 | head -10
echo "=== PM2 status ==="
pm2 status 2>&1
