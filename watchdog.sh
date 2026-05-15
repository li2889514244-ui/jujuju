#!/bin/bash
# MatrixFlow health monitor - checks every 60 seconds
LOG="/var/log/matrixflow-watchdog.log"
ERROR_LOG="/var/log/matrixflow-errors.log"
while true; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000/api/v1/health)
  if [ "$CODE" != "200" ]; then
    echo "[$(date)] ALERT: Health check returned $CODE, restarting..." >> "$LOG"
    pm2 restart matrixflow
  fi
  # Count 500 errors in recent PM2 logs
  ERROR_COUNT=$(pm2 logs matrixflow --lines 200 --nostream 2>/dev/null | grep -c ' 500 ' || true)
  if [ "$ERROR_COUNT" -gt 0 ]; then
    echo "[$(date)] 500 errors in last 200 log lines: $ERROR_COUNT" >> "$ERROR_LOG"
  fi
  sleep 60
done
