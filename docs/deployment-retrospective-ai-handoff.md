# MatrixFlow / jujuju 部署复盘与 AI 交接指南

更新时间：2026-07-03

这份文档给任何后续接手的 AI 或工程师使用。目标是先判断“生产现在到底跑在哪”，再部署，避免继续被历史脚本、旧路径和构建产物误导。

配套整改路线图见：`docs/deployment-remediation-plan.md`

## 一句话结论

当前生产站点是 `https://ddddkiii.com`。公网流量经 Cloudflare Tunnel 进入阿里云 ECS 的 `localhost:80`，当前主要由 Docker 容器 `matrixflow-frontend` 承接前端静态文件；后端是 PM2 进程 `matrixflow` 运行 `/opt/matrixflow/backend/dist/main.js`。

部署反复出问题的核心原因不是单点 bug，而是仓库里同时存在多套历史部署方案：

- 前端有的脚本部署到 `/opt/matrixflow/frontend/dist`，有的部署到 `/var/www/matrixflow`。
- 后端有的脚本用 PM2，有的试图用 Docker Compose 里的 backend/app。
- Nginx 有主机 Nginx、Docker 前端容器 Nginx、`backend/docker-compose.yml` 里的 `matrixflow-nginx` 多套配置。
- 很多脚本会 `git reset --hard origin/master`，本地未提交改动不会进入线上。
- Prisma schema 改动后，经常只重启后端，忘了在服务器上 `npx prisma generate` 或迁移。
- Git 中混入了大量 `dist`、截图、浏览器 profile、临时脚本，导致很难判断当前有效产物。

## 当前生产拓扑

已知生产信息：

- 域名：`https://ddddkiii.com`
- 云厂商：阿里云 ECS
- 区域：`cn-guangzhou`
- 服务器项目目录：`/opt/matrixflow`
- 前端生产静态目录：`/opt/matrixflow/frontend/dist`
- 前端容器：`matrixflow-frontend`
- 后端 PM2 应用名：`matrixflow`
- 后端目录：`/opt/matrixflow/backend`
- 后端入口：`dist/main.js`
- 数据库容器：`matrixflow-db`
- Redis 容器：`matrixflow-redis`
- Tunnel 容器：`matrixflow-tunnel`

最近一次资源检查显示 ECS 很轻：约 1.6GiB 内存、系统盘约 79G，磁盘占用约 22%。这意味着前端和普通后端改动可以继续部署，但不要在这台机器上叠加重型服务。

## 先读哪些文件

后续 AI 接手部署前，按这个顺序读：

1. `LATEST_DEPLOYMENT.md`
2. `docs/deployment-retrospective-ai-handoff.md`
3. `docs/frontend-deploy-runbook.md`
4. `scripts/deploy-frontend-fast.py`
5. `ARCHITECTURE.md`
6. 需要后端时再读 `backend/package.json`、`backend/prisma/schema.prisma`、`backend/src/app.module.ts`

不要先读一堆旧 `deploy*.sh/js/py` 就直接执行。很多脚本是历史救火脚本。

## 推荐部署方式

### 前端：推荐

用：

```powershell
python scripts/deploy-frontend-fast.py
```

它的优点：

- 本地先跑 `npm run typecheck --workspace=frontend`
- 本地构建 `npm run build --workspace=frontend`
- 打包 `frontend/dist`
- 通过 SSH 上传到 ECS
- 覆盖 `/opt/matrixflow/frontend/dist`
- reload `matrixflow-frontend` 容器里的 Nginx
- 校验本地、远程、公网 HTML 引用的 `assets/js/index-*.js` 是否一致

如果已经本地构建过，只重发当前 `frontend/dist`：

```powershell
python scripts/deploy-frontend-fast.py --skip-typecheck --skip-build
```

前端部署后必须验证：

```powershell
curl.exe -L -s "https://ddddkiii.com/?codex=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
```

从 HTML 里确认 `assets/js/index-*.js` 是最新 hash。

### 后端：推荐原则

后端部署不要盲目跑旧脚本。先判断改动类型：

- 只改 TypeScript 业务逻辑：构建 `backend/dist`，上传/更新服务器后 `pm2 restart matrixflow`
- 改 Prisma schema：必须在服务器执行 `npx prisma generate`；有 migration 时再执行 `npx prisma migrate deploy`
- 新增 Nest module/controller/service：确认 `dist/app.module.js` 中确实引入了新模块
- 改环境变量：更新服务器 `/opt/matrixflow/backend/.env` 后 `pm2 restart matrixflow --update-env`

后端最小验证：

```bash
pm2 status
pm2 logs matrixflow --lines 50 --nostream
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/v1/health
curl -s -o /dev/null -w '%{http_code}\n' https://ddddkiii.com/api/v1/health
```

如果接口公网 404，但本地源码有路由，通常是线上 `dist` 不是最新，或者 PM2 没重启到新构建。

## 慎用或不要直接用的脚本

这些脚本可能仍有参考价值，但不要不读内容就执行：

- `deploy.sh`
- `deploy-full.sh`
- `final-deploy.sh`
- `scripts/deploy-server.sh`
- `scripts/deploy-backend.sh`
- `scripts/deploy-backend-hard.sh`
- `scripts/deploy-via-git.py`
- `scripts/upload-deploy.py`
- `.github/workflows/deploy-ecs.yml`
- `.github/workflows/cd.yml`
- `.github/workflows/deploy.cjs`
- `.github/workflows/deploy.mjs`

主要风险：

- 会在服务器上 `git reset --hard origin/master`
- 会把前端复制到旧路径 `/var/www/matrixflow`
- 会假设后端在 `localhost:3001` 或 `localhost:3000`，但不同历史阶段端口不一致
- 会操作主机 Nginx，而当前公网入口更多依赖 Docker 前端容器和 Cloudflare Tunnel
- 某些脚本里存在硬编码服务器信息或密钥痕迹，不能继续扩散

## 常见问题与解决办法

### 1. 前端部署后公网不变

表现：

- 本地 `frontend/dist` 已经更新
- 线上页面还是旧 UI
- `/var/www/matrixflow/index.html` 是新的，但公网不是新的

原因：

- 当前公网入口不读 `/var/www/matrixflow`
- `ddddkiii.com -> Cloudflare Tunnel -> ECS localhost:80 -> matrixflow-frontend`
- `matrixflow-frontend` 的静态文件来自 `/opt/matrixflow/frontend/dist`

解决：

- 使用 `scripts/deploy-frontend-fast.py`
- 验证三个 hash 一致：

```bash
grep -o 'assets/js/index-[^" ]*' /opt/matrixflow/frontend/dist/index.html | head -1
docker exec matrixflow-frontend sh -c 'grep -o "assets/js/index-[^\" ]*" /usr/share/nginx/html/index.html | head -1'
curl -s -H 'Host: ddddkiii.com' http://127.0.0.1/ | grep -o 'assets/js/index-[^" ]*' | head -1
```

### 2. 新接口返回 404

原因通常是：

- 服务器后端 `dist` 没有新模块
- `app.module.ts` 改了，但服务器没重新构建
- PM2 仍在跑旧进程

解决：

```bash
cd /opt/matrixflow/backend
npx nest build
pm2 restart matrixflow
pm2 logs matrixflow --lines 50 --nostream
```

并确认：

```bash
grep -R "新模块名或路由关键字" dist/ | head
```

### 3. Prisma 报 `Cannot read properties of undefined (reading 'findMany')`

原因：

- `schema.prisma` 已新增 model，但服务器上的 Prisma Client 未重新生成

解决：

```bash
cd /opt/matrixflow/backend
npx prisma generate
pm2 restart matrixflow
```

如果有正式 migration：

```bash
npx prisma migrate deploy
```

### 4. 健康检查端口混乱

历史脚本里出现过 `3000` 和 `3001` 两套后端端口。当前先按生产实际验证，不要按脚本文字猜。

排查：

```bash
ss -tlnp | grep -E ':80|:3000|:3001'
pm2 status
pm2 env matrixflow | grep PORT
curl -s -o /dev/null -w '3000=%{http_code}\n' http://localhost:3000/api/v1/health
curl -s -o /dev/null -w '3001=%{http_code}\n' http://localhost:3001/api/v1/health
```

### 5. Docker Compose 名称不一致

仓库里至少有两套 Compose：

- 根目录 `docker-compose.yml`：本地/通用 compose，容器名可能是 `matrixflow-postgres`、`matrixflow-backend`、`matrixflow-frontend`
- `backend/docker-compose.yml`：历史阿里云生产 compose，容器名是 `matrixflow-db`、`matrixflow-redis`、`matrixflow-tunnel`、`matrixflow-backend`

实际线上曾看到：

- `matrixflow-frontend`
- `matrixflow-tunnel`
- `matrixflow-redis`
- `matrixflow-db`
- 后端由 PM2 `matrixflow` 跑，不一定是 Docker `matrixflow-backend`

所以不要只看 compose 文件判断生产状态，必须用：

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
pm2 status
```

### 6. Cloudflare / Tunnel 相关问题

如果公网访问异常，但服务器本机 `curl http://localhost:80/` 正常：

```bash
docker ps | grep tunnel
docker logs --tail 80 matrixflow-tunnel
curl -s -H 'Host: ddddkiii.com' http://127.0.0.1/ | head
```

不要优先改 DNS、Nginx 或证书。先确认 Tunnel 容器还活着。

### 7. GitHub Actions 可能覆盖手工部署

`.github/workflows/deploy-ecs.yml` 等流水线会在 push 后通过阿里云云助手执行：

- `git fetch`
- `git reset --hard origin/master`
- build backend/frontend
- `pm2 restart`
- 复制 `frontend/dist` 到 `/var/www/matrixflow`

这和当前推荐前端部署路径不完全一致。若 push 后线上回退或不生效，要检查 GitHub Actions 是否刚跑过。

## 部署前检查清单

部署前先问自己：

- 当前改动是否已经提交，还是只在本地工作区？
- 要部署的是前端、后端、数据库 schema，还是桌面 companion？
- 是否需要保留服务器上的本地改动？
- 是否有 migration？
- 是否会触发 GitHub Actions 自动部署？
- 目标路径是 `/opt/matrixflow/frontend/dist`，不是旧的 `/var/www/matrixflow` 吗？
- 是否需要 `pm2 restart matrixflow --update-env`？
- 是否有密钥出现在脚本或输出里？

## 部署后验证清单

前端：

```bash
curl -s -H 'Host: ddddkiii.com' http://127.0.0.1/ | grep -o 'assets/js/index-[^" ]*' | head -1
curl -L -s 'https://ddddkiii.com/?codex=TIMESTAMP' | grep -o 'assets/js/index-[^" ]*' | head -1
```

后端：

```bash
pm2 status
pm2 logs matrixflow --lines 50 --nostream
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/v1/health
curl -s -o /dev/null -w '%{http_code}\n' https://ddddkiii.com/api/v1/health
```

数据库：

```bash
docker exec matrixflow-db pg_isready -U postgres
cd /opt/matrixflow/backend && npx prisma migrate status
```

容器：

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker stats --no-stream
```

## 给后续 AI 的工作规则

1. 不要执行任何含 `git reset --hard` 的部署脚本，除非用户明确同意并确认服务器上没有要保留的改动。
2. 不要把密钥、AccessKey、SSH 密码写入新文件或最终回复。
3. 不要只看 `/var/www/matrixflow` 判断前端是否上线。
4. 不要把 `frontend/dist`、`backend/dist`、`desktop-companion/dist` 的脏状态当作源码改动。
5. 部署前先读 `LATEST_DEPLOYMENT.md`，它记录当前可用版本。
6. 新增后端模块时，部署后一定查 `dist` 里是否真的有该模块。
7. 改 Prisma schema 后，一定执行 `npx prisma generate`，有 migration 再 `migrate deploy`。
8. 前端上线以公网 HTML 的 hash 为准，不以本地构建成功为准。
9. 线上故障先观察：`pm2 status`、`docker ps`、`curl localhost`、`curl public`，再动手修。
10. 如果要整理部署体系，先废弃/归档历史脚本，再保留一条前端路径、一条后端路径、一条诊断路径。

## 建议的后续整改

短期：

- 把 `scripts/deploy-frontend-fast.py` 标记为唯一前端发布入口。
- 新增一个安全的 `scripts/deploy-backend-safe.py`，通过 SSH 上传构建产物，不执行 `git reset --hard`。
- 禁用或改造 `.github/workflows/deploy-ecs.yml`，避免自动复制到旧路径。
- 把旧部署脚本移动到 `scripts/legacy-deploy/`，文件头写明“不要直接执行”。
- 清理仓库里的真实密钥痕迹，轮换相关 AccessKey/SSH 密码。

中期：

- 统一后端运行方式：要么 PM2，要么 Docker，不要混用。
- 统一前端入口：只保留 Docker Nginx 挂载 `/opt/matrixflow/frontend/dist`。
- 给生产加一个 `/deploy-info.json`，返回前端 hash、后端 git commit、构建时间。
- 建立回滚机制：前端保留最近 3 个 `/opt/matrixflow/frontend/dist` 备份；后端保留最近 3 个 dist 包。

长期：

- 从“服务器上拉代码构建”改成“CI 构建产物并发布”。
- 所有 secrets 进入 GitHub Secrets 或服务器 env，不进仓库。
- 让 GitHub Actions 和手工部署走同一条脚本，避免两套真相。
