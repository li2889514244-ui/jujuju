# MatrixFlow ERP - 部署架构设计

## 1. 部署架构总览

```mermaid
graph TB
    subgraph Internet["互联网"]
        USER["用户浏览器"]
        CDN["CDN<br/>静态资源"]
    end

    subgraph LB["负载均衡层"]
        NGINX["Nginx / Traefik<br/>反向代理 + SSL"]
    end

    subgraph K8S["Kubernetes 集群"]
        subgraph Ingress["Ingress"]
            ING["Ingress Controller"]
        end

        subgraph AppNS["namespace: matrixflow-app"]
            WEB_POD["Web Pod<br/>Vue3 SPA"]
            API_POD["API Pod<br/>NestJS"]
            WS_POD["WebSocket Pod"]
        end

        subgraph SvcNS["namespace: matrixflow-svc"]
            AUTH_POD["Auth Service"]
            ACCT_POD["Account Service"]
            PUB_POD["Publish Service"]
            STAT_POD["Stats Service"]
            TEAM_POD["Team Service"]
            BROWSER_POD["Browser Service"]
            NOTIFY_POD["Notify Service"]
        end

        subgraph InfraNS["namespace: matrixflow-infra"]
            PG_POD["PostgreSQL<br/>主从"]
            REDIS_POD["Redis<br/>Sentinel"]
            MINIO_POD["MinIO<br/>对象存储"]
        end
    end

    subgraph Storage["持久化存储"]
        PV_PG["PV: PostgreSQL Data"]
        PV_MINIO["PV: MinIO Data"]
        PV_BROWSER["PV: Browser Profiles"]
    end

    USER --> CDN
    CDN --> NGINX
    NGINX --> ING
    ING --> WEB_POD
    ING --> API_POD
    ING --> WS_POD
    API_POD --> AUTH_POD
    API_POD --> ACCT_POD
    API_POD --> PUB_POD
    API_POD --> STAT_POD
    API_POD --> TEAM_POD
    PUB_POD --> BROWSER_POD
    PUB_POD --> NOTIFY_POD
    AUTH_POD --> PG_POD
    AUTH_POD --> REDIS_POD
    PUB_POD --> MINIO_POD
    PG_POD --> PV_PG
    MINIO_POD --> PV_MINIO
    BROWSER_POD --> PV_BROWSER
```

## 2. 环境规划

| 环境 | 用途 | 基础设施 | 规格 |
|------|------|----------|------|
| dev | 本地开发 | Docker Compose | 单机 |
| staging | 预发布测试 | K8s (单节点) | 2C4G |
| production | 生产环境 | K8s (多节点) | 按需扩缩 |

## 3. Docker 配置

### 3.1 Docker Compose (开发环境)

```yaml
# docker-compose.yml
version: '3.9'

services:
  # ---- 前端 ----
  web:
    build:
      context: .
      dockerfile: docker/Dockerfile.web
    ports:
      - "3000:80"
    volumes:
      - ./apps/web/src:/app/src
    environment:
      - VITE_API_BASE_URL=http://localhost:4000/api/v1
    depends_on:
      - api

  # ---- 后端 ----
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    ports:
      - "4000:4000"
    volumes:
      - ./apps/api/src:/app/src
    environment:
      - DATABASE_URL=postgresql://matrix:matrix@postgres:5432/matrixflow
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=dev-jwt-secret-change-in-prod
      - JWT_REFRESH_SECRET=dev-refresh-secret-change-in-prod
      - ENCRYPTION_KEY=dev-encryption-key-32bytes!!
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  # ---- 数据库 ----
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: matrixflow
      POSTGRES_USER: matrix
      POSTGRES_PASSWORD: matrix
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U matrix -d matrixflow"]
      interval: 5s
      timeout: 3s
      retries: 5

  # ---- 缓存 ----
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # ---- 对象存储 ----
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - miniodata:/data
    command: server /data --console-address ":9001"

volumes:
  pgdata:
  redisdata:
  miniodata:
```

### 3.2 Dockerfile - 前端

```dockerfile
# docker/Dockerfile.web
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci
COPY . .
RUN npm run build -w @matrixflow/web

FROM nginx:alpine
COPY --from=builder /apps/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### 3.3 Dockerfile - 后端

```dockerfile
# docker/Dockerfile.api
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build -w @matrixflow/api

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
EXPOSE 4000
CMD ["node", "dist/main.js"]
```

## 4. Kubernetes 部署

### 4.1 Namespace 配置

```yaml
# k8s/base/namespaces.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: matrixflow-app
---
apiVersion: v1
kind: Namespace
metadata:
  name: matrixflow-svc
---
apiVersion: v1
kind: Namespace
metadata:
  name: matrixflow-infra
```

### 4.2 API Deployment

```yaml
# k8s/base/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: matrixflow-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: registry.matrixflow.com/api:latest
          ports:
            - containerPort: 4000
          envFrom:
            - secretRef:
                name: api-secrets
            - configMapRef:
                name: api-config
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 1000m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 4000
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 4000
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: matrixflow-app
spec:
  selector:
    app: api
  ports:
    - port: 4000
      targetPort: 4000
```

### 4.3 HPA 自动扩缩

```yaml
# k8s/base/api-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
  namespace: matrixflow-app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### 4.4 Browser Service Deployment

```yaml
# k8s/base/browser-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: browser-service
  namespace: matrixflow-svc
spec:
  replicas: 1
  selector:
    matchLabels:
      app: browser-service
  template:
    metadata:
      labels:
        app: browser-service
    spec:
      containers:
        - name: browser
          image: registry.matrixflow.com/browser-service:latest
          ports:
            - containerPort: 4001
          envFrom:
            - secretRef:
                name: browser-secrets
          resources:
            requests:
              cpu: 500m
              memory: 1Gi
            limits:
              cpu: 2000m
              memory: 4Gi
          volumeMounts:
            - name: browser-profiles
              mountPath: /data/profiles
      volumes:
        - name: browser-profiles
          persistentVolumeClaim:
            claimName: browser-profiles-pvc
```

## 5. CI/CD 流水线

### 5.1 GitHub Actions 工作流

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  # ---- 代码检查 ----
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  # ---- 单元测试 ----
  test:
    runs-on: ubuntu-latest
    needs: lint
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: matrixflow_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/matrixflow_test
      - run: npm run test:ci
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/matrixflow_test
          REDIS_URL: redis://localhost:6379

  # ---- 构建镜像 ----
  build:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    strategy:
      matrix:
        service: [web, api]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: registry.matrixflow.com
          username: ${{ secrets.REGISTRY_USER }}
          password: ${{ secrets.REGISTRY_PASS }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile.${{ matrix.service }}
          push: true
          tags: |
            registry.matrixflow.com/${{ matrix.service }}:${{ github.sha }}
            registry.matrixflow.com/${{ matrix.service }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ---- 部署 staging ----
  deploy-staging:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/develop'
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: azure/k8s-set-context@v3
        with:
          kubeconfig: ${{ secrets.KUBE_CONFIG_STAGING }}
      - run: |
          kubectl set image deployment/api \
            api=registry.matrixflow.com/api:${{ github.sha }} \
            -n matrixflow-app
          kubectl rollout status deployment/api -n matrixflow-app

  # ---- 部署生产 ----
  deploy-production:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: azure/k8s-set-context@v3
        with:
          kubeconfig: ${{ secrets.KUBE_CONFIG_PROD }}
      - run: |
          kubectl set image deployment/api \
            api=registry.matrixflow.com/api:${{ github.sha }} \
            -n matrixflow-app
          kubectl rollout status deployment/api -n matrixflow-app
```

## 6. 监控与可观测性

### 6.1 监控栈

```yaml
monitoring:
  metrics:
    tool: Prometheus
    exporters:
      - node-exporter    # 节点指标
      - postgres-exporter # 数据库指标
      - redis-exporter    # Redis 指标
    grafana:
      enabled: true
      dashboards:
        - system-overview
        - api-performance
        - business-metrics

  logging:
    tool: Loki + Promtail
    format: JSON (structured)
    levels: error > warn > info > debug
    retention: 30 days

  tracing:
    tool: OpenTelemetry + Jaeger
    sampling: 10% (production)
    exporters:
      - jaeger
      - prometheus
```

### 6.2 关键告警规则

| 告警 | 条件 | 级别 |
|------|------|------|
| API 5xx 错误率 | > 1% 持续 5min | Critical |
| API 响应时间 P99 | > 2s 持续 5min | Warning |
| CPU 使用率 | > 85% 持续 10min | Warning |
| 内存使用率 | > 90% 持续 5min | Critical |
| 磁盘使用率 | > 80% | Warning |
| 数据库连接数 | > 80% 最大连接 | Warning |
| 浏览器实例失败率 | > 10% 持续 5min | Critical |
| Pod 重启次数 | > 3 次 / 15min | Critical |

## 7. 备份策略

| 数据 | 方式 | 频率 | 保留 |
|------|------|------|------|
| PostgreSQL | pg_dump 全量 + WAL 增量 | 每日全量 + 持续归档 | 30天 |
| Redis | RDB + AOF | RDB 每小时 | 7天 |
| MinIO | 跨区域同步 | 实时 | 永久 |
| 浏览器 Profile | PV 快照 | 每日 | 7天 |

## 8. 灾难恢复

```yaml
disaster_recovery:
  rpo: 1小时    # 恢复点目标
  rto: 30分钟   # 恢复时间目标

  strategy:
    database:
      - 主从复制 (同步)
      - 每日全量备份到远程存储
      - WAL 归档到 S3

    application:
      - K8s 多副本部署
      - 跨可用区分布
      - 自动故障转移

    storage:
      - MinIO 跨区域复制
      - 静态资源 CDN 缓存
```
