#!/bin/bash
# Login and collect data
echo "=== Login ==="
RESP=$(curl -sf -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"2889514244@qq.com","password":"123456"}')
echo "Response: ${RESP:0:80}"

TOKEN=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "Trying test user..."
  RESP=$(curl -sf -X POST http://localhost:3001/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"test123456"}')
  TOKEN=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null)
fi

echo "Token exists: $(test -n "$TOKEN" && echo YES || echo NO)"

if [ -n "$TOKEN" ]; then
  echo "=== Collecting data ==="
  curl -sf -X POST http://localhost:3001/api/v1/analytics/collect \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json"
  echo ""
  echo "COLLECT_DONE"
else
  echo "NO_TOKEN"
fi
