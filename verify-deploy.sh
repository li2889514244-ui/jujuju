#!/bin/bash
echo '=== 1. Check dist ==='
ls -la /opt/matrixflow/frontend/dist/index.html 2>&1 | head -2
echo '=== 2. Check PM2 ==='
pm2 status 2>&1 | head -5
echo '=== 3. Health check ==='
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/health 2>&1; echo ''
echo '=== 4. Restart frontend ==='
docker restart matrixflow-frontend 2>&1
echo '=== 5. Verify frontend ==='
curl -s -o /dev/null -w '%{http_code}' http://localhost:80/ 2>&1; echo ''
echo '=== 6. Test new endpoints ==='
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/analytics/likes/trend 2>&1; echo ' (likes/trend)'
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/analytics/monetization 2>&1; echo ' (monetization)'
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/analytics/engagement 2>&1; echo ' (engagement)'
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/analytics/account/Csadf 2>&1; echo ' (account/:id)'
