#!/bin/bash
# MatrixFlow 一键部署 - 阿里云 ECS
# 在阿里云控制台「远程连接」执行或 SSH 登录后运行

set -e
echo "===== MatrixFlow 部署开始 ====="

# 1. 更新系统
apt update -y && apt upgrade -y

# 2. 安装 Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 3. 安装 Git
apt install -y git

# 4. 克隆项目
cd /opt
git clone https://github.com/li2889514244-ui/jujuju.git matrixflow
cd matrixflow

# 5. 写环境变量
cat > .env << 'ENVEOF'
DATABASE_URL=postgresql://postgres:postgres@db:5432/matrixflow
JWT_SECRET=CHANGEME_RANDOM_32_CHARS_PLEASE_REPLACE
JWT_REFRESH_SECRET=CHANGEME_RANDOM_32_CHARS_PLEASE_REPLACE
COOKIE_ENCRYPTION_KEY=CHANGEME_RANDOM_32_CHARS_PLEASE_REPLACE
TOKEN_ENCRYPTION_KEY=CHANGEME_RANDOM_32_CHARS_PLEASE_REPLACE
REDIS_URL=redis://redis:6379
NODE_ENV=production
PORT=3000
ENVEOF

# 6. 生成随机密钥
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH=$(openssl rand -hex 32)
COOKIE_KEY=$(openssl rand -hex 32)
TOKEN_KEY=$(openssl rand -hex 32)
DB_PASS=$(openssl rand -hex 16)

sed -i "s/CHANGEME_RANDOM_32_CHARS_PLEASE_REPLACE/$JWT_SECRET/" .env
sed -i "0,/CHANGEME_RANDOM_32_CHARS_PLEASE_REPLACE/s//$JWT_REFRESH/" .env
sed -i "0,/CHANGEME_RANDOM_32_CHARS_PLEASE_REPLACE/s//$COOKIE_KEY/" .env
sed -i "0,/CHANGEME_RANDOM_32_CHARS_PLEASE_REPLACE/s//$TOKEN_KEY/" .env

# 7. 启动（Docker Compose）
cd backend
docker compose up -d --build

# 8. 等待启动
sleep 10
echo "===== 部署完成 ====="
echo "访问: http://8.134.218.39:3000/api/v1/health"
curl -s http://localhost:3000/api/v1/health
