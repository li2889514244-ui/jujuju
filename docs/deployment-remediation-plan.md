# jujuju 部署问题整改方案

更新时间：2026-07-03

目标：把当前混乱的部署体系收敛成“一个生产事实、两条发布路径、一个诊断入口”。不要再依赖临时救火脚本和口头记忆。

## 多 Agent 深度审计结论

本轮按用户要求使用多个 agent 分工审计：

- Agent A：生产拓扑与“部署了但不生效”原因。
- Agent B：部署脚本、修复脚本、ECS/SSH/Nginx/PM2 风险。
- Agent C：CI/CD、Docker、K8s、Railway/Render 等基础设施冲突。
- Agent D：仓库卫生、构建产物、浏览器 profile、密钥风险。
- Agent E：部署治理方案。
- Agent F：从“任何 AI 不再误部署”的角度做方案评审。

多 agent 结论高度一致：

- 当前生产事实应以 `LATEST_DEPLOYMENT.md`、`docs/frontend-deploy-runbook.md`、`docs/deployment-retrospective-ai-handoff.md` 为准。
- 前端真实入口是 `/opt/matrixflow/frontend/dist` + `matrixflow-frontend` Docker Nginx，不是 `/var/www/matrixflow`。
- 后端当前生产方式是 PM2 app `matrixflow` 跑 `/opt/matrixflow/backend/dist/main.js`，短期不要混入 Docker backend。
- `.github/workflows/deploy-ecs.yml`、`.github/workflows/cd.yml`、旧 `deploy-*` 脚本可能覆盖手工部署，尤其是 `git reset --hard origin/master` 和旧路径复制。
- 仓库污染严重：`backend/dist`、`frontend/dist`、`desktop-companion/dist`、截图、浏览器 profile、旧脚本、secrets 混在一起。
- 治理目标必须收敛为：诊断一个入口、前端一个入口、后端一个入口。

## 2026-07-03 线上故障复盘

现象：

- `https://ddddkiii.com/` 首页返回 200，静态前端仍可访问。
- `https://ddddkiii.com/api/v1/health` 返回 502。
- ECS 上 `matrixflow-frontend`、`matrixflow-tunnel`、`matrixflow-db`、`matrixflow-redis` 均运行。
- PM2 app `matrixflow` 处于 `errored`，3000/3001 均无监听。

直接原因：

- 服务器 `/opt/matrixflow/node_modules` 和 `backend/node_modules` 出现依赖缺失/损坏。
- 初始错误为缺 `@nestjs/core`，修复后继续暴露 `iterare/lib/index.js`、`compression/node_modules/debug/src/index.js` 等缺失，说明不是单包问题，而是依赖目录整体不完整。

处理动作：

- 未执行 `git reset --hard`。
- 未修改源码。
- 未碰数据库数据。
- 在服务器上备份旧 `node_modules` 目录到 `/opt/matrixflow/_node_modules_backups/`。
- 执行干净依赖重装：

```bash
cd /opt/matrixflow
npm ci --include=dev --ignore-scripts --legacy-peer-deps
cd backend
npx prisma generate
pm2 restart matrixflow --update-env
```

验证结果：

- `pm2 status` 显示 `matrixflow` online。
- `http://localhost:3000/api/v1/health` 返回 200。
- `http://127.0.0.1/api/v1/health` 经前端 Nginx 代理返回 200。
- `https://ddddkiii.com/api/v1/health` 返回 200。

暴露出的长期问题：

- 当前 PM2 后端依赖 root workspace `node_modules` 和 backend workspace `node_modules`，部署脚本如果只装其中一边，会造成运行时缺包。
- 需要正式 `deploy-backend-safe.py` 将依赖安装、Prisma generate、PM2 restart、health 验证固化为一个可靠流程。
- 需要 `diagnose-production.py` 快速判断“前端活、后端挂、依赖缺失、端口没监听”这类故障。

## 总体原则

- 先冻结真相：以 `LATEST_DEPLOYMENT.md` 和 `docs/deployment-retrospective-ai-handoff.md` 为当前生产依据。
- 先归档再删除：旧脚本先移动到 legacy 区并加警告，不立即物理删除。
- 前后端分开发布：前端静态包和后端 PM2 进程不要混在同一个不透明脚本里。
- 任何发布必须验证公网结果：本地 build 成功不等于线上生效。
- 禁止新脚本写死密钥、IP、AccessKey、SSH 密码。

## 1. 入口不唯一

问题：有些脚本部署到 `/var/www/matrixflow`，但当前公网入口实际读 `/opt/matrixflow/frontend/dist`，导致“部署了但页面没变”。

处理方案：

- 明确唯一前端生产目录：`/opt/matrixflow/frontend/dist`。
- 明确唯一前端发布脚本：`scripts/deploy-frontend-fast.py`。
- 所有仍然写 `/var/www/matrixflow` 的脚本标记为 legacy，不再作为发布入口。
- 在 README、`LATEST_DEPLOYMENT.md`、部署复盘文档里统一写清楚公网链路。

建议改动：

- 新建 `scripts/legacy-deploy/`，把旧前端部署脚本移进去。
- 给 legacy 脚本文件头加：

```text
LEGACY DEPLOY SCRIPT. Do not run unless you have read docs/deployment-retrospective-ai-handoff.md.
```

验收标准：

- 搜索 `/var/www/matrixflow` 时，只能出现在 legacy 脚本或“历史说明”文档里。
- 前端部署后，本地、ECS、Docker 容器、公网 HTML 的 `assets/js/index-*.js` hash 一致。

优先级：P0

## 2. 后端运行方式混用

问题：仓库里同时存在 PM2、Docker Compose backend、主机 Nginx、Docker Nginx。实际线上后端主要由 PM2 `matrixflow` 跑，但脚本假设不一致。

处理方案：

- 短期固定线上后端运行方式：PM2 `matrixflow`。
- Docker 只保留数据库、Redis、前端 Nginx、Cloudflare Tunnel 的实际说明。
- 后端发布脚本只操作 `/opt/matrixflow/backend` 和 `pm2 restart matrixflow`。
- 暂不把后端迁到 Docker，除非单独做一次计划内迁移。

建议改动：

- 新增 `scripts/deploy-backend-safe.py`：
  - 本地或服务器构建后端。
  - 上传后端源码/构建产物。
  - 必要时执行 `npx prisma generate`、`npx prisma migrate deploy`。
  - 重启 `pm2 restart matrixflow --update-env`。
  - 验证 `localhost:3000/api/v1/health` 和公网 health。
- 新增 `scripts/diagnose-production.py`：
  - 输出 PM2 状态、Docker 容器、端口、前端 hash、health 状态。

验收标准：

- 文档中清楚写明：生产后端当前不是以 Docker backend 为主。
- 后端部署不再重启无关前端容器。
- 后端发布后可自动输出 health、PM2 日志尾部、关键接口状态码。

优先级：P0

## 3. 救火脚本太多

问题：根目录和 `scripts/` 中有大量 `deploy-*`、`fix-*`、`check-*` 脚本，很多只适用于某一次历史故障。

处理方案：

- 脚本分级：
  - `scripts/deploy-frontend-fast.py`：保留，正式入口。
  - `scripts/deploy-backend-safe.py`：新建，正式入口。
  - `scripts/diagnose-production.py`：新建，正式诊断入口。
  - `scripts/legacy-deploy/*`：历史脚本，只读参考。
  - `scripts/oneoff/*`：一次性修复脚本，默认不执行。
- 根目录不再新增部署脚本。

建议改动：

- 整理脚本目录：

```text
scripts/
  deploy-frontend-fast.py
  deploy-backend-safe.py
  diagnose-production.py
  legacy-deploy/
  oneoff/
```

- 给 `legacy-deploy/README.md` 写明每个脚本的历史用途和风险。

验收标准：

- 后续 AI 搜索部署脚本时，第一屏能看到正式入口。
- 旧脚本不会和正式脚本混在根目录。
- 任何 legacy 脚本执行前都会看到明显警告。

优先级：P1

## 4. 脚本强制重置服务器代码

问题：`git reset --hard origin/master` 会覆盖服务器上的临时修复，也会让本地未提交改动无法上线。

处理方案：

- 正式发布脚本禁止默认执行 `git reset --hard`。
- 如确实需要服务器跟随 Git，必须加显式参数，例如 `--allow-hard-reset`。
- 发布前检查本地 Git 状态，并提示是否有未提交源码改动。
- 服务器发布前先备份将被覆盖的目录。

建议改动：

- 在新后端脚本中加入保护：
  - 本地 `git status --short` 输出。
  - 若有 `backend/src`、`backend/prisma`、`frontend/src` 未提交改动，提醒但不阻断。
  - 服务器端备份 `/opt/matrixflow/backend/dist`。
- legacy 脚本中所有 `git reset --hard` 文件头标注风险。

验收标准：

- 正式部署路径没有无条件 `git reset --hard`。
- 每次部署都有备份路径输出。
- 如果发布失败，可以恢复上一个 dist。

优先级：P0

## 5. 前端、后端、数据库发布步骤没有区分

问题：前端只需要静态包；后端需要 build/restart；Prisma 改动需要 generate/migrate。现在经常漏步骤。

处理方案：

- 按变更类型选择发布路径：
  - 前端 UI/API 调用改动：只跑前端发布。
  - 后端 TypeScript 改动：后端 build + PM2 restart。
  - Prisma schema 改动：后端 build + `prisma generate` + migration 检查 + PM2 restart。
  - 环境变量改动：更新 `.env` + `pm2 restart --update-env`。
- 在文档中加入“按改动类型部署矩阵”。

部署矩阵：

| 改动类型                       | 必做步骤                                                  | 验证                                |
| ------------------------------ | --------------------------------------------------------- | ----------------------------------- |
| `frontend/src/**`              | typecheck、build、上传 `frontend/dist`、reload 前端 Nginx | 公网 HTML hash、页面功能            |
| `backend/src/**`               | build、更新 `backend/dist`、PM2 restart                   | health、接口状态码、PM2 logs        |
| `backend/prisma/schema.prisma` | `prisma generate`、必要时 `migrate deploy`、PM2 restart   | Prisma migrate status、相关接口     |
| `.env` / secrets               | 更新服务器 env、`pm2 restart --update-env`                | PM2 env、health                     |
| Docker/Nginx/Tunnel            | 先诊断再改，不和业务发布混用                              | docker ps、container logs、公网访问 |

验收标准：

- 每次部署前能明确选择一种路径。
- Prisma 相关故障不再靠猜，统一先查 client/migration。

优先级：P0

## 6. 仓库太脏，源码和产物混在一起

问题：`dist`、截图、浏览器 profile、桌面端打包产物、临时脚本和敏感文件混在项目里，导致 AI 和人都难判断。

处理方案：

- 第一阶段只整理忽略规则和文档，不删除业务文件。
- 第二阶段清理生成物和截图。
- 第三阶段重新建立“源码、产物、临时文件”的边界。

建议改动：

- `.gitignore` 明确忽略：
  - `frontend/dist/`
  - `backend/dist/`
  - `desktop-companion/dist/`
  - `chrome_debug_profile/`
  - `doudian_probe_profile/`
  - `screenshot*.png`
  - `wechat_*.png`
  - `scripts/dist.tar.gz`
  - `secrets.env`
- 如果必须保留某些生产构建产物，单独用 `LATEST_DEPLOYMENT.md` 记录，不混在源码提交里。
- 敏感信息轮换：
  - 阿里云 AccessKey
  - SSH 密码
  - Cloudflare Tunnel token
  - 数据库/Redis/JWT 相关密钥

验收标准：

- `git status --short` 中主要只剩源码、文档、配置改动。
- 构建产物不会反复污染 diff。
- 新 AI 接手时能一眼分清正式文件和历史产物。

优先级：P1

## 执行顺序

第一天完成：

1. 固化文档入口：`LATEST_DEPLOYMENT.md`、部署复盘、整改方案。
2. 把 `scripts/deploy-frontend-fast.py` 设为唯一前端入口。
3. 禁用或归档明显危险的前端旧脚本。
4. 写 `scripts/diagnose-production.py`。

第二阶段完成：

1. 写 `scripts/deploy-backend-safe.py`。
2. 给后端部署加入 Prisma 检查。
3. 整理 GitHub Actions，避免自动部署到旧路径。
4. 建立前端/后端 dist 回滚目录。

第三阶段完成：

1. 清理仓库生成物。
2. 归档旧脚本。
3. 轮换已暴露过的密钥。
4. 统一 CI/CD 和手工部署路径。

## 最终目标状态

最终应该只剩三条常用命令：

```powershell
python scripts/diagnose-production.py
python scripts/deploy-frontend-fast.py
python scripts/deploy-backend-safe.py
```

任何 AI 只要遵守这三条入口，就不会再被旧路径、旧端口、旧 Nginx、旧脚本带偏。
