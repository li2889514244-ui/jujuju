# MatrixFlow ERP 部署指南

## 目录

- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [Docker 本地部署](#docker-本地部署)
- [Kubernetes 部署](#kubernetes-部署)
- [CI/CD 配置](#cicd-配置)
- [监控部署](#监控部署)
- [域名与证书](#域名与证书)

---

## 环境要求

### 基础设施

| 组件 | 最低配置 | 推荐配置 |
|------|---------|---------|
| Kubernetes | 1.27+ | 1.29+ |
| CPU | 8 cores | 16+ cores |
| 内存 | 16 GB | 32+ GB |
| 存储 | 100 GB SSD | 500+ GB SSD (gp3) |

### 工具版本

| 工具 | 版本 |
|------|------|
| Docker | 24.0+ |
| kubectl | 1.27+ |
| Helm | 3.12+ |
| Node.js | 20 LTS |
| pnpm | 8+ |

---

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/matrixflow/erp.git
cd erp
```

### 2. 配置密钥

```bash
# 复制密钥模板
cp k8s/secrets.yaml k8s/secrets.local.yaml

# 编辑并填入真实值
vim k8s/secrets.local.yaml

# 应用密钥
kubectl apply -f k8s/secrets.local.yaml -n matrixflow
```

### 3. 一键部署

```bash
# 部署到 production
./scripts/deploy.sh --namespace matrixflow --tag latest

# 部署到 staging
./scripts/deploy.sh --namespace matrixflow-staging --tag develop
```

---

## Docker 本地部署

### 构建镜像

```bash
# 前端
docker build -f docker/Dockerfile.frontend -t matrixflow/frontend:local .

# 后端
docker build -f docker/Dockerfile.backend -t matrixflow/backend:local .
```

### Docker Compose (本地开发)

```yaml
# docker-compose.yml
version: '3.8'
services:
  frontend:
    build:
      context: .
      dockerfile: docker/Dockerfile.frontend
    ports:
      - "8080:80"
    depends_on:
      - backend

  backend:
    build:
      context: .
      dockerfile: docker/Dockerfile.backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/matrixflow
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: matrixflow
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## Kubernetes 部署

### 命名空间

```bash
# 创建命名空间
kubectl apply -f k8s/namespace.yaml
```

### 存储配置

```bash
# 创建 PVC
kubectl apply -f k8s/postgres/pvc.yaml -n matrixflow
```

### 数据库

```bash
# 部署 PostgreSQL (StatefulSet)
kubectl apply -f k8s/postgres/statefulset.yaml -n matrixflow
kubectl apply -f k8s/postgres/service.yaml -n matrixflow

# 等待就绪
kubectl rollout status statefulset/postgres -n matrixflow --timeout=300s
```

### Redis

```bash
kubectl apply -f k8s/redis/deployment.yaml -n matrixflow
kubectl apply -f k8s/redis/service.yaml -n matrixflow
```

### 应用服务

```bash
# ConfigMap
kubectl apply -f k8s/configmap.yaml -n matrixflow

# 前端
kubectl apply -f k8s/frontend/deployment.yaml -n matrixflow
kubectl apply -f k8s/frontend/service.yaml -n matrixflow

# 后端
kubectl apply -f k8s/backend/deployment.yaml -n matrixflow
kubectl apply -f k8s/backend/service.yaml -n matrixflow
kubectl apply -f k8s/backend/hpa.yaml -n matrixflow

```

### Ingress

```bash
# 确保已安装 nginx-ingress-controller
kubectl apply -f k8s/ingress.yaml -n matrixflow
```

### 验证部署

```bash
# 运行健康检查
./scripts/health-check.sh matrixflow

# 查看所有资源
kubectl get all -n matrixflow
```

---

## CI/CD 配置

### GitHub Actions Secrets

在 GitHub 仓库 Settings > Secrets 中配置：

| Secret | 说明 |
|--------|------|
| `AWS_ACCESS_KEY_ID` | AWS 访问密钥 |
| `AWS_SECRET_ACCESS_KEY` | AWS 密钥 |
| `AWS_REGION` | AWS 区域 (ap-northeast-1) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token (需要 Pages 权限) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |
| `SNYK_TOKEN` | Snyk 安全扫描 Token (可选) |
| `SLACK_WEBHOOK_URL` | Slack 通知 Webhook (可选) |

### GitHub Actions Variables

在 GitHub 仓库 Settings > Variables 中配置：

| Variable | 说明 | 示例值 |
|----------|------|--------|
| `VITE_API_BASE_URL` | 后端 API 地址 | `https://api.matrixflow.io/api` |
| `VITE_WS_URL` | WebSocket 地址 | `wss://api.matrixflow.io` |

### Cloudflare Pages 前端部署

前端通过 Cloudflare Pages 自动部署：

1. **PR 触发**: CI 流水线自动生成 Preview 部署
2. **main 分支合并**: CD 流水线自动部署到 Production

**Cloudflare Pages 项目配置:**
- 项目名: `matrixflow-erp`
- 构建命令: (留空，CI 中执行)
- 输出目录: `frontend/dist`
- SPA 路由: 通过 `frontend/public/_redirects` 文件处理

**首次设置步骤:**
1. 在 Cloudflare Dashboard 创建 Pages 项目
2. 获取 API Token (权限: Cloudflare Pages:Edit)
3. 获取 Account ID
4. 在 GitHub Secrets 中配置上述两个值

### 环境配置

在 GitHub Settings > Environments 创建：

- `staging` - 自动部署，无需审批
- `production` - 需要审批，配置保护分支

---

## 监控部署

### Prometheus + Grafana

```bash
# 使用 Helm 部署
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f docker/monitoring/values.yaml
```

### 导入 Dashboard

1. 访问 Grafana: `http://grafana.monitoring:3000`
2. 导入 `docker/monitoring/grafana/dashboards/matrixflow.json`
3. 数据源已通过 provisioning 自动配置

---

## 域名与证书

### DNS 配置

| 记录 | 类型 | 值 |
|------|------|-----|
| erp.matrixflow.io | A | Ingress IP |
| api.matrixflow.io | A | Ingress IP |
| staging.erp.matrixflow.io | A | Ingress IP |
| staging-api.matrixflow.io | A | Ingress IP |

### TLS 证书 (cert-manager)

```bash
# 安装 cert-manager
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set installCRDs=true

# 创建 ClusterIssuer
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@matrixflow.io
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
```

---

## 蓝绿部署

生产环境使用蓝绿部署策略：

1. **蓝环境** — 当前运行版本
2. **绿环境** — 新版本部署
3. **健康检查** — 绿环境通过后切换流量
4. **回滚** — 失败时自动切回蓝环境

```bash
# 触发蓝绿部署
gh workflow run cd.yml -f environment=production -f image_tag=v1.2.3
```
