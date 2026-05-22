# 披星云（MatrixFlow）项目交接文档
## 新 AI 接手必读

---

## 一、项目是什么

多平台矩阵账号管理 SaaS（抖音/快手/小红书/B站/视频号/微博/TikTok）。

- **前端**: Vue 3 + Element Plus，部署在 Cloudflare Pages
- **后端**: NestJS，部署在阿里云 ECS
- **数据库**: PostgreSQL + Redis，运行在 Docker 中
- **目标**: 用户登录网站 → 绑定平台账号 → AI 创作内容 → 一键多平台发布 → 数据分析

---

## 二、核心问题（请先修这个）

### 问题 1: 后端频繁崩溃（最关键）

**现象**: NestJS 启动后几分钟到几小时崩溃，PM2 不断重启（曾达 692 次），用户登录报 "Network Error"。

**根因**:
1. ECS 仅 1.7GB 内存，运行 NestJS + PostgreSQL + Redis + cloudflared 超出容量，OOM Killer 杀进程
2. NestJS 存在循环依赖：`UploaderService` ↔ `ContentService`，NestJS 无法解析导致启动即崩溃
3. `dist/main.js` 多次因 git 冲突变成 0 字节

**已做的修复**:
- `backend/src/modules/content/content.service.ts` — 已移除 `UploaderService` 注入和 `executeImmediatePublish()` 方法
- `backend/src/modules/content/content.module.ts` — 已移除 `UploaderModule` 引用，只保留 `PrismaModule`
- `backend/src/modules/uploader/uploader.module.ts` — 仍有 `forwardRef(() => ContentModule)`，UploaderModule 仍注册在 app.module.ts 中
- ECS 已加 4GB swap

**建议方案**:
- 从 app.module.ts 移除 UploaderModule（ECS 无 Playwright/Chromium，该模块不可用）
- 或用 Docker Compose 部署全部服务，设严格内存限制
- 或升级 ECS 到 4GB+，用 `docker compose up -d` 一键部署

### 问题 2: 服务器重启后服务不自启

`/etc/systemd/system/matrixflow.service` 已创建但 `systemctl` 在该 ECS 上不可用。PM2 的 `startup` 命令也失败。Docker 容器设了 `--restart always` 但有时不生效。

### 问题 3: 扫码绑定需要本地服务

架构设计：扫码绑定不走服务器，用用户本地真实 IP 打开平台登录页（避免阿里云数据中心 IP 被封）。

- 用户下载 `social-auto-upload` 压缩包
- 双击 `setup.bat` 安装 Python + Playwright + Chromium（仅首次）
- 双击 `start.bat` 启动本地 Flask（`localhost:5409`）
- 网页通过 SSE 连接 `localhost:5409`，获取二维码，扫码，Cookie 自动上传云端

---

## 三、服务器信息

| 项目 | 值 |
|------|-----|
| ECS 公网 IP | `8.134.218.39` |
| 地域 | 阿里云广州 |
| 实例 ID | `i-7xvb9wno2duq8msd35l1` |
| 系统 | Linux |
| 内存 | 1.7GB |
| 磁盘 | 80GB ESSD Entry（IOPS 2440，已从 40GB 扩容） |
| SSH | `root` / `YOUR_ECS_PASSWORD`（`^` 号在 shell 中需转义） |
| 项目路径 | `/opt/matrixflow/` |
| Node.js 版本 | v24.14.1（注意：奇数版本，不稳定） |

### ECS 上运行的服务

```
PM2:
  └── matrixflow (dist/main.js)

Docker:
  ├── matrixflow-db (postgres:16-alpine)
  ├── matrixflow-redis (redis:7-alpine)
  └── cloudflared (cloudflare/cloudflared:latest, --network host)
```

### ECS 上的文件

```
/opt/matrixflow/
├── backend/
│   ├── dist/main.js          ← 预构建的 NestJS 入口
│   ├── src/                  ← 源代码（git 同步）
│   ├── .env                  ← 环境变量（含 DB_PASS, JWT_SECRET 等）
│   └── docker-compose.yml    ← Docker 编排文件
├── frontend/                  ← Vue 3 前端源码
└── social-auto-upload/        ← 本地扫码 Flask 服务
```

---

## 四、域名和网络

| 项目 | 值 |
|------|-----|
| 前端地址 | `https://ddddkiii.com` |
| 后端 API | `https://ddddkiii.com/api/v1` |
| Cloudflare Zone ID | `cc90c0bdeda3504ed06bafa09a4312c4` |
| Cloudflare Account ID | `b47f88a1b8b3837796143701fbdf5d43` |
| Cloudflare API Token | `YOUR_CLOUDFLARE_API_TOKEN` |
| Cloudflare Tunnel ID | `750c57ed-6785-4c69-90c9-772c9043d96e` |
| Cloudflare Tunnel Token | `YOUR_CLOUDFLARE_TUNNEL_TOKEN` |
| DNS | `ddddkiii.com` CNAME → `750c57ed-6785-4c69-90c9-772c9043d96e.cfargotunnel.com`（proxy: true） |
| SSL 模式 | Flexible（Cloudflare ↔ 浏览器 HTTPS，Cloudflare ↔ Tunnel HTTP） |

### 网络架构

```
https://ddddkiii.com (Nginx on ECS)
    ↓ API 调用
https://ddddkiii.com/api/v1
    ↓ CNAME → Tunnel
Cloudflare Tunnel (QUIC 加密)
    ↓
ECS cloudflared → localhost:3000
    ↓
NestJS → PostgreSQL + Redis (Docker)
```

---

## 五、GitHub

| 项目 | 值 |
|------|-----|
| 仓库 | `https://github.com/li2889514244-ui/jujuju` |
| 分支 | `master` |
| Personal Access Token | `YOUR_GITHUB_PAT` |
| GitHub Secrets | `ECS_ACCESS_KEY`, `ECS_SECRET_KEY`（阿里云凭证，用于自动部署） |

### GitHub Actions

- `.github/workflows/deploy-ecs.yml` — 监听 `backend/**` 变更，触发 ECS 自动部署
- `.github/workflows/ci.yml` — CI 流水线（可能因 Node 版本问题失败，不影响部署）

---

## 六、阿里云凭证

```
AccessKey: YOUR_ALIBABA_ACCESS_KEY
SecretKey: YOUR_ALIBABA_SECRET_KEY
```

用于：ECS API 远程执行命令（当 SSH 不可用时）、磁盘扩容等。

### Node.js 调用示例（`@alicloud/pop-core`）

```javascript
const Core = require('@alicloud/pop-core');
const client = new Core({
  accessKeyId: 'YOUR_ALIBABA_ACCESS_KEY',
  accessKeySecret: 'YOUR_ALIBABA_SECRET_KEY',
  endpoint: 'https://ecs.cn-guangzhou.aliyuncs.com',
  apiVersion: '2014-05-26',
});

// 远程执行命令
async function exec(cmd) {
  const b64 = Buffer.from('#!/bin/bash\n' + cmd).toString('base64');
  const c = await client.request('CreateCommand', {
    RegionId: 'cn-guangzhou', Name: 'cmd', Type: 'RunShellScript',
    CommandContent: b64, ContentEncoding: 'Base64', Timeout: '300',
    WorkingDir: '/opt/matrixflow',
  });
  const inv = await client.request('InvokeCommand', {
    RegionId: 'cn-guangzhou', CommandId: c.CommandId,
    'InstanceId.1': 'i-7xvb9wno2duq8msd35l1', Timed: false,
  });
  // 轮询 DescribeInvocationResults 获取结果
}
```

---

## 七、部署方式

### 当前方式（手动）

```bash
# Windows 本地构建
cd C:\Users\EDY\jujuju\backend
npm install --ignore-scripts
npx prisma generate
npx nest build

# 推送到 GitHub
git add -f backend/dist/main.js
git commit -m "..."
git push

# ECS 上拉取并启动
cd /opt/matrixflow
git fetch origin master && git reset --hard origin/master
docker start matrixflow-db matrixflow-redis
cd backend
pm2 delete all
pm2 start dist/main.js --name matrixflow
docker run -d --restart always --name cloudflared --network host cloudflare/cloudflared:latest tunnel run --token <TOKEN>
```

### 理想方式（Docker Compose）

`backend/docker-compose.yml` 已配置好 PostgreSQL + Redis + Nginx + NestJS + cloudflared。但 `docker compose up -d` 时 `npm install` 极慢（ECS 磁盘 IO 低），需在 GitHub Actions 中构建镜像并推送到容器仓库，ECS 直接拉取镜像。

---

## 八、API 端点清单（已验证 72/72 全通）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/v1/health | 健康检查（无需认证） |
| POST | /api/v1/auth/register | 注册 |
| POST | /api/v1/auth/login | 登录 |
| POST | /api/v1/auth/refresh | 刷新 token |
| POST | /api/v1/auth/logout | 登出 |
| GET | /api/v1/auth/me | 当前用户 |
| POST | /api/v1/auth/profile | 更新资料 |
| GET | /api/v1/accounts | 账号列表 |
| POST | /api/v1/accounts | 添加账号（含 Cookie 加密） |
| GET | /api/v1/accounts/:id | 账号详情 |
| GET | /api/v1/accounts/:id/cookies | 解密 Cookie |
| GET | /api/v1/account-groups | 账号分组 |
| GET | /api/v1/content | 内容列表 |
| POST | /api/v1/content | 创建内容 |
| POST | /api/v1/content/batch-publish | 一键分发 |
| GET | /api/v1/content/scheduled | 定时队列 |
| GET | /api/v1/analytics/overview | 数据概览 |
| GET | /api/v1/analytics/platforms | 平台数据 |
| GET | /api/v1/analytics/report | 数据报表 |
| GET | /api/v1/analytics/views-ranking | 排行榜 |
| GET | /api/v1/ai/capabilities | AI 能力 |
| GET | /api/v1/ai/providers | AI 供应商 |
| POST | /api/v1/ai/content/titles | AI 标题 |
| POST | /api/v1/ai/content/tags | AI 标签 |
| POST | /api/v1/ai/content/generate | AI 生成 |
| POST | /api/v1/ai/publish/best-time | 最佳时间 |
| POST | /api/v1/ai/trend/predict | 趋势预测 |
| POST | /api/v1/ai/anomaly/detect | 异常检测 |
| POST | /api/v1/ai/review | 内容审核 |
| GET | /api/v1/platforms | 平台列表 |
| GET | /api/v1/competitors | 竞对列表 |
| GET | /api/v1/notifications | 通知 |
| POST | /api/v1/content-review/review | 内容过审 |
| POST | /api/v1/content-review/quick-check | 快速审核 |

---

## 九、已知 Bug / 技术债

1. **AI 助手显示"暂未接入"**: 有两个 `onMounted` 互相覆盖状态。`AIAssistantView.vue` 中第一个 onMounted 设 `connected`，第二个设 `providers[0]`（值为 `mock`）。已在本地修复但 CF Pages 可能未部署。
2. **Dashboard 数据全是 0**: 新账号无数据时正常，但前端应显示"添加账号开始使用"而非空图表。
3. **UploaderModule 循环依赖**: 核心问题，见上文。
4. **ECS Node.js 版本**: v24.14.1 是奇数不稳定版，应考虑降级到 v22 LTS。
5. **dist/main.js 依赖 git 传输**: 易损坏（曾变成 0 字节），应用 Docker 镜像替代。
6. **前端 mock 数据**: AnalyticsView 和 DashboardView 的图表已接真实 API，但数据空时显示不佳。
7. **`nest build` 在 ECS 上失败**: `@nestjs/cli` 在 `node_modules/.bin/` 缺失，需用 `npx nest build` 本地构建。

---

## 十、常用 ECS 运维命令

```bash
# 查看状态
pm2 list
docker ps
free -m
netstat -tlnp | grep 3000
curl -s http://localhost:3000/api/v1/health

# 重启后端
cd /opt/matrixflow/backend
pm2 delete all
pm2 start dist/main.js --name matrixflow

# 重启 Tunnel
docker restart cloudflared

# 同步最新代码
cd /opt/matrixflow
git fetch origin master && git reset --hard origin/master

# 查看日志
pm2 logs matrixflow
tail -f /tmp/deploy.log
tail -f /tmp/watchdog.log
```

---

## 十一、本地开发

```
C:\Users\EDY\jujuju\
├── backend/                # NestJS 后端
│   ├── src/
│   │   ├── app.module.ts
│   │   └── modules/
│   ├── prisma/schema.prisma
│   └── dist/main.js       # 预构建（需 git add -f 推送）
├── frontend/               # Vue 3 前端
│   ├── src/
│   │   ├── views/         # 页面组件
│   │   ├── api/           # API 调用层
│   │   ├── components/    # 通用组件
│   │   └── router/
│   └── .env.production    # VITE_API_BASE_URL=https://ddddkiii.com/api/v1
├── social-auto-upload/     # 扫码绑定本地服务（不在 git 中，需单独分发）
│   ├── start.bat           # 启动脚本
│   ├── setup.bat           # 安装脚本
│   ├── sau_backend.py      # Flask SSE 服务器
│   └── conf.py             # 配置（有头浏览器）
└── .github/workflows/
    ├── deploy-ecs.yml      # 自动部署
    └── ci.yml              # CI
```

---

## 十二、给新 AI 的建议优先级

1. **修后端崩溃** — 从 app.module.ts 移除 UploaderModule，或升级 ECS 内存到 4GB+
2. **用 Docker Compose 部署** — 避免 git 传输 dist 文件，镜像构建一次即可
3. **Node.js 降级到 v22 LTS** — v24 不稳定
4. **修 AI 助手 onMounted 冲突** — 删掉 `AIAssistantView.vue` 中第二个 onMounted（约第 594 行）
5. **确认 Cloudflare Tunnel 自启** — 加入 systemd 或 rc.local
