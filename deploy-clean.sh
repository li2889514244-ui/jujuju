#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"2889514244@qq.com","password":"mx2026++"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

echo "[1] Test create group..."
curl -s -X POST http://localhost:3000/api/v1/account-groups \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"IP2","color":"#67c23a"}' | python3 -m json.tool 2>/dev/null

echo ""
echo "[2] List groups..."
curl -s http://localhost:3000/api/v1/account-groups \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>/dev/null | head -20

echo ""
echo "[3] List groups WITHOUT auth (just in case)..."
curl -s http://localhost:3000/api/v1/account-groups | head -c 100

echo ""
echo "=== DONE ==="
