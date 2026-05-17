#!/bin/bash
cd /opt/matrixflow/backend
# Clear Redis cache for analytics overview
docker exec matrixflow-redis redis-cli DEL "cache:analytics:overview:$(docker exec matrixflow-db psql -U postgres -d matrixflow -t -c "SELECT id FROM \"User\" WHERE email='2889514244@qq.com';" 2>/dev/null | tr -d ' ')" 2>/dev/null || true
docker exec matrixflow-redis redis-cli KEYS "cache:analytics:*" 2>/dev/null | xargs -r docker exec matrixflow-redis redis-cli DEL 2>/dev/null || true
echo "Redis cache cleared"

# Restart
pm2 restart matrixflow
sleep 4
curl -sf http://localhost:3001/api/v1/health | head -c 50
echo ""
echo "DONE"
