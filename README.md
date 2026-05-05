# MatrixFlow ERP

矩阵账号管理平台 — 全栈 ERP 系统，基于 Vue 3 + NestJS + Playwright 架构。

## 架构

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Frontend   │────▶│   Backend    │────▶│  Browser Engine  │
│  Vue 3/Vite  │     │   NestJS     │     │   Playwright     │
│  Nginx/CfP   │     │  Port 3000   │     │   Port 3001      │
└──────────────┘     └──────┬───────┘     └──────────────────┘
                            │
                   ┌────────┴────────┐
                   │                 │
              ┌────▼────┐     ┌─────▼─────┐
              │PostgreSQL│     │   Redis   │
              │ Port 5432│     │ Port 6379 │
              └──────────┘     └───────────┘
```

| 服务 | 技术栈 | 部署方式 |
|------|--------|---------|
| Frontend | Vue 3, Vite, Element Plus | Cloudflare Pages / Nginx (Docker) |
| Backend | NestJS, TypeORM | Docker / Kubernetes (EKS) |
| Browser Engine | Playwright | Docker / Kubernetes |
| Database | PostgreSQL 16 | StatefulSet (K8s) / Docker Compose |
| Cache | Redis 7 | Deployment (K8s) / Docker Compose |

## 快速开始

### 环境要求

- Node.js 20 LTS
- pnpm 8+
- Docker 24+ & Docker Compose
- (可选) Kubernetes 1.27+ & kubectl

### 1. 克隆 & 配置

```bash
git clone https://github.com/matrixflow/erp.git
cd erp

# 复制并编辑环境变量
cp .env.example .env
# ⚠️ 必须修改所有 CHANGE_ME 值！
```

### 2. Docker Compose (本地开发)

```bash
docker compose up -d
```

服务启动后:
- 前端: http://localhost
- 后端 API: http://localhost:3000/api
- 浏览器引擎: http://localhost:3001

### 3. 本地开发 (无 Docker)

```bash
# 安装依赖
pnpm install

# 启动 PostgreSQL & Redis (需要本地安装或 Docker)
docker compose up -d postgres redis

# 启动后端
cd backend && pnpm dev

# 启动前端
cd frontend && pnpm dev
```

## 项目结构

```
├── frontend/          # Vue 3 前端
├── backend/           # NestJS 后端 API
├── browser-engine/    # Playwright 浏览器引擎
├── docker/            # Dockerfiles & Nginx 配置
│   ├── Dockerfile.frontend
│   ├── Dockerfile.backend
│   ├── Dockerfile.browser-engine
│   └── nginx/         # Nginx 配置
├── k8s/               # Kubernetes 清单
│   ├── frontend/
│   ├── backend/
│   ├── browser-engine/
│   ├── postgres/
│   ├── redis/
│   ├── ingress.yaml
│   ├── configmap.yaml
│   └── secrets.yaml   # ⚠️ 模板文件，需替换占位符
├── scripts/           # 运维脚本
│   ├── deploy.sh      # 一键部署
│   ├── health-check.sh
│   ├── backup.sh
│   ├── restore.sh
│   └── security-scan.sh
├── docs/              # 详细文档
├── docker-compose.yml
└── .github/workflows/ # CI/CD
    ├── ci.yml         # Lint, Test, Build, CF Pages Preview
    ├── cd.yml         # Deploy to K8s + Cloudflare Pages
    └── security-scan.yml
```

## 部署

### Cloudflare Pages (前端)

前端自动部署到 Cloudflare Pages:

| 环境 | 分支 | URL |
|------|------|-----|
| Production | `main` | `jujuju-28b.pages.dev` |
| Preview | PR | `jujuju-28b.pages.dev` (branch preview) |

**GitHub Secrets 需要配置:**

| Secret | 说明 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token (Pages 权限) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |

**GitHub Variables 需要配置:**

| Variable | 示例值 |
|----------|--------|
| `VITE_API_BASE_URL` | `https://api.matrixflow.io/api` |
| `VITE_WS_URL` | `wss://api.matrixflow.io` |

### Kubernetes (后端 + 浏览器引擎)

```bash
# 配置密钥 (必须!)
cp k8s/secrets.yaml k8s/secrets.local.yaml
vim k8s/secrets.local.yaml  # 替换所有 <REPLACE_ME>
kubectl apply -f k8s/secrets.local.yaml -n matrixflow

# 一键部署
./scripts/deploy.sh --namespace matrixflow --tag latest
```

详见 [部署指南](docs/deployment-guide.md)。

## CI/CD

### GitHub Actions Secrets

| Secret | 用途 |
|--------|------|
| `AWS_ACCESS_KEY_ID` | AWS EKS 部署 |
| `AWS_SECRET_ACCESS_KEY` | AWS EKS 部署 |
| `AWS_REGION` | AWS 区域 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages 部署 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 |
| `SNYK_TOKEN` | 安全扫描 (可选) |
| `SLACK_WEBHOOK_URL` | Slack 通知 (可选) |

### 流程

```
Push/PR → CI (Lint → Test → Build → CF Pages Preview)
                ↓ (main/develop only)
         CD (K8s Deploy → Blue-Green → Notify)
```

## 运维

```bash
# 健康检查
./scripts/health-check.sh matrixflow

# 数据库备份
./scripts/backup.sh

# 数据库恢复
./scripts/restore.sh backup_file.sql.gz

# 安全扫描
./scripts/security-scan.sh
```

## 安全

- 所有 Docker 容器使用非 root 用户运行
- Kubernetes Pod 设置 `runAsNonRoot` + `securityContext`
- Nginx 配置 CSP、HSTS、X-Frame-Options 等安全头
- JWT 密钥、数据库密码通过 K8s Secrets 管理
- CI 包含 CodeQL、Trivy、Gitleaks 安全扫描

## 文档

- [部署指南](docs/deployment-guide.md)
- [系统架构](docs/architecture/system-architecture.md)
- [API 设计](docs/architecture/api-design.md)
- [安全架构](docs/architecture/security-architecture.md)
- [运维手册](docs/operations-manual.md)
- [故障排除](docs/troubleshooting.md)
