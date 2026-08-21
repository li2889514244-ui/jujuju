#!/bin/bash
while true; do
  if ! curl -sf --max-time 5 http://localhost:3000/api/v1/health > /dev/null 2>&1; then
    echo "$(date) Starting backend" >> /tmp/keeper.log
    kill $(lsof -ti:3000) 2>/dev/null
    cd /opt/matrixflow/backend
    nohup /usr/local/bin/node dist/index.js >> /tmp/app.log 2>&1 &
    sleep 5
  fi
  sleep 5
done
