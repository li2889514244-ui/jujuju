#!/bin/bash
echo "[$(date)] MatrixFlow starting..."
cd /opt/matrixflow
git pull origin master 2>&1 | tail -1
cd backend
mkdir -p data
npx prisma migrate deploy 2>&1 | tail -1
pm2 delete all 2>/dev/null || true
pm2 start dist/main.js --name matrixflow 2>&1 | tail -1
for i in 1 2 3 4 5; do
  sleep 5
  if curl -sf --max-time 5 http://localhost:3000/api/v1/health > /dev/null 2>&1; then
    echo "HEALTH_OK (attempt $i)"
    docker restart cloudflared 2>/dev/null || true
    exit 0
  fi
  echo "Attempt $i failed"
done
echo "HEALTH_FAIL - emergency direct start"
pm2 delete all 2>/dev/null || true
nohup node dist/main.js > /tmp/app.log 2>&1 &
sleep 10
curl -sf --max-time 5 http://localhost:3000/api/v1/health && echo "DIRECT_OK" || echo "DIRECT_FAIL"
docker restart cloudflared 2>/dev/null || true
