#!/bin/bash
cat > /tmp/default.conf << 'NGINXEOF'
server {
    listen 80;
    listen [::]:80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://172.17.0.1:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
NGINXEOF
echo "Config written to /tmp/default.conf"
docker cp /tmp/default.conf matrixflow-frontend:/etc/nginx/conf.d/default.conf 2>&1
docker exec matrixflow-frontend nginx -t 2>&1
docker exec matrixflow-frontend nginx -s reload 2>&1
echo "---nginx reloaded---"
sleep 1
echo -n "Frontend: "; curl -s -o /dev/null -w '%{http_code}' http://localhost:80/; echo ""
echo -n "API: "; curl -s -o /dev/null -w '%{http_code}' http://localhost:80/api/v1/health; echo ""
echo -n "monetization: "; curl -s -o /dev/null -w '%{http_code}' http://localhost:80/api/v1/analytics/monetization; echo ""
