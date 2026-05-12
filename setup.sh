#!/bin/bash
# MatrixFlow 一键部署 - 阿里云 ECS
# 直接粘贴到远程终端执行

set -e
echo "===== MatrixFlow 部署开始 ====="

# 1. 安装 Docker
echo "[1/4] 安装 Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker --now
fi

# 2. 安装 Docker Compose
echo "[2/4] 安装 Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# 3. 下载部署文件
echo "[3/4] 下载部署配置..."
mkdir -p /opt/matrixflow
cd /opt/matrixflow
curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/li2889514244-ui/jujuju/master/backend/docker-compose.yml

# 4. 创建环境变量
echo "[4/4] 配置环境变量..."
cat > .env << 'ENVEOF'
# 匹配 docker-compose.yml 的 service name (db)
DATABASE_URL=postgresql://postgres:postgres@db:5432/matrixflow
REDIS_URL=redis://redis:6379
JWT_SECRET=CHANGE_ME_RANDOM_32_CHARS_PLEASE
JWT_REFRESH_SECRET=CHANGE_ME_RANDOM_32_CHARS_PLEASE_TOO
COOKIE_ENCRYPTION_KEY=CHANGE_ME_COOKIE_KEY_32_BYTES_
PORT=3000
PYTHON_BRIDGE_URL=http://bridge:8000
ENVEOF

# 5. 启动
echo "启动服务..."
docker-compose up -d

echo ""
echo "===== 部署完成 ====="
echo "查看状态: docker-compose ps"
echo "健康检查: curl http://localhost:3000/api/v1/health"
