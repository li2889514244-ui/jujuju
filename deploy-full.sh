#!/bin/bash
set -e

echo "=== [1/6] Git pull ==="
cd /opt/matrixflow
git fetch origin master
git reset --hard origin/master
echo "Latest commit: $(git log -1 --oneline)"

echo ""
echo "=== [2/6] Install frontend deps ==="
cd /opt/matrixflow/frontend
npm install 2>&1 | tail -3

echo ""
echo "=== [3/6] Build frontend ==="
npx vite build 2>&1 | tail -5
echo "Build done: $(ls dist/index.html 2>/dev/null && echo OK || echo FAIL)"

echo ""
echo "=== [4/6] Deploy frontend to /var/www ==="
rm -rf /var/www/matrixflow
mkdir -p /var/www/matrixflow
cp -r dist/* /var/www/matrixflow/
echo "Files: $(ls /var/www/matrixflow | wc -l)"

echo ""
echo "=== [5/6] Setup nginx + move backend to 3001 ==="
# Kill everything
pm2 delete matrixflow 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true
sleep 2

# Update backend port
cd /opt/matrixflow/backend
sed -i "s/^PORT=.*/PORT=3001/" .env 2>/dev/null
grep -q "^PORT=" .env || echo "PORT=3001" >> .env
export PORT=3001

# Start NestJS on 3001
pm2 start dist/main.js --name matrixflow
sleep 4

# Setup nginx
apt-get install -y -qq nginx 2>/dev/null || true
cat > /etc/nginx/sites-available/matrixflow << 'NGINXEOF'
server {
    listen 3000;
    root /var/www/matrixflow;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/matrixflow /etc/nginx/sites-enabled/matrixflow
rm -f /etc/nginx/sites-enabled/default

echo ""
echo "=== [6/6] Start nginx ==="
nginx -t && (systemctl restart nginx 2>/dev/null || nginx -s reload 2>/dev/null || nginx)
sleep 2

echo ""
echo "=== Verify ==="
curl -sf -o /dev/null -w "Frontend: HTTP %{http_code}\n" http://localhost:3000/
curl -sf http://localhost:3000/api/v1/health
echo ""
echo "=== DEPLOY COMPLETE ==="
