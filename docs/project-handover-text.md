# MatrixFlow / Pixingyun 项目交接文字版

最后核对时间：2026-08-21 14:50 Asia/Shanghai

这份文档是给接手项目的人看的文字版说明。重点回答三个问题：这个项目是什么、现在跑在哪里、以后怎么部署和更新。

## 一句话结论

MatrixFlow / 披星云是一个矩阵账号和店铺数据管理系统。主站是 `https://ddddkiii.com`，前端走 Docker Nginx 静态文件，后端走 PM2，数据库和 Redis 走 Docker，桌面端披星云伴侣通过主站的 `/downloads` 和 `/companion-updates/latest.json` 发布更新。

当前不要把 Render、Railway、Kubernetes、Cloudflare Pages、`/var/www/matrixflow` 当成生产真相。那些配置大多是历史或备选材料。

## 当前生产拓扑

| 模块 | 当前生产事实 |
| --- | --- |
| 公网入口 | `https://ddddkiii.com` |
| 流量链路 | Cloudflare Worker / Tunnel -> 阿里云 ECS -> `localhost:80` |
| Cloudflare Worker | `matrixflow-origin-proxy`，源码在 `cloudflare/matrixflow-origin-proxy` |
| 前端容器 | Docker 容器 `matrixflow-frontend` |
| 前端文件目录 | ECS: `/opt/matrixflow/frontend-dist` |
| 后端进程 | PM2 app `matrixflow` |
| 后端目录 | ECS: `/opt/matrixflow/backend` |
| 后端入口 | `/opt/matrixflow/backend/dist/main.js` |
| 后端健康检查 | `https://ddddkiii.com/api/v1/health` |
| PostgreSQL | Docker 容器 `matrixflow-db`，本机端口 `127.0.0.1:5432` |
| Redis | Docker 容器 `matrixflow-redis`，本机端口 `127.0.0.1:6379` |
| 桌面伴侣下载 | ECS: `/opt/matrixflow/frontend-dist/downloads` |
| 桌面伴侣更新清单 | ECS: `/opt/matrixflow/frontend-dist/companion-updates/latest.json` |

生产数据库和 Redis 使用稳定外部卷 `pgdata`、`redisdata`。不要删除这些卷，也不要重建成匿名卷。

## 当前公开版本

主站健康检查在 2026-08-21 14:50 +08:00 返回 `200 application/json`。

披星云伴侣公网更新清单当前返回：

- 版本：`3.2.78`
- manifest：`https://ddddkiii.com/companion-updates/latest.json`
- 自动更新包：`https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.78.zip`
- 完整安装包：`https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.78.exe`

注意：根目录 `latest.json` 是旧文件，当前不要拿它判断伴侣最新版。伴侣以公网 manifest 和 `desktop-companion/update-release/latest.json` 为准。

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| `frontend/` | Vue 3 + Vite 前端 |
| `backend/` | NestJS + Prisma 后端 |
| `backend/prisma/` | Prisma schema 和 migrations |
| `desktop-companion/` | Windows 桌面端披星云伴侣 |
| `weixinxiaochengxu/` | 微信小程序体验版 |
| `cloudflare/matrixflow-origin-proxy/` | Cloudflare Worker 反代和缓存策略 |
| `scripts/deploy-frontend-fast.py` | 当前正式前端发布入口 |
| `scripts/deploy-backend-safe.py` | 当前正式后端发布入口 |
| `scripts/diagnose-production.py` | 当前正式生产诊断入口 |
| `scripts/publish-companion-download.py` | 桌面伴侣包和 manifest 发布入口 |
| `docs/deployment-log.md` | 每次生产部署、失败、修复都要记录 |
| `docs/project-change-log.md` | 每次项目改动都要记录 |
| `LATEST_DEPLOYMENT.md` | 部署标记文件，但里面有历史段落；如冲突要实际验证公网 |

## 本地开发

第一次拉项目后安装依赖：

```powershell
npm install
```

同时启动前后端：

```powershell
npm run dev
```

单独启动：

```powershell
npm run dev:frontend
npm run dev:backend
```

常用检查：

```powershell
npm run typecheck --workspace=frontend
npm run build --workspace=frontend
npm run build --workspace=backend
npm run test --workspace=frontend
npm run test --workspace=backend
```

环境变量模板看 `.env.example` 和 `secrets.env.example`。真实 `.env.local`、`secrets.env`、服务器密码、Cloudflare token、DeepSeek key 等都只能留在本机或服务器环境里，不要提交、不要写进文档、不要贴到日志。

## 部署总原则

每次部署前先判断改动类型：

| 改动类型 | 走哪条路径 |
| --- | --- |
| 只改 `frontend/src` | 前端部署 |
| 改 `backend/src` | 后端部署 |
| 改 `backend/prisma` | 后端部署，并加 migration/generate 检查 |
| 改 Cloudflare Worker | Worker 部署 |
| 改桌面伴侣 | 伴侣打包并发布下载包/manifest |
| 改小程序 | 微信开发者工具上传体验版 |
| 改文档 | 不部署生产，只更新变更日志 |

部署前先跑：

```powershell
py -3 scripts\diagnose-production.py
```

涉及后端、数据库、容器、Tunnel、Worker 时，再跑远端只读诊断：

```powershell
py -3 scripts\diagnose-production.py --remote
```

生产发布后必须更新：

- `docs/project-change-log.md`
- `docs/deployment-log.md`

如果产生了新的部署经验或踩坑，也同步更新：

- `LATEST_DEPLOYMENT.md`
- `docs/project-memory.md`
- `docs/deployment-retrospective-ai-handoff.md`

## 前端怎么部署

正式入口：

```powershell
py -3 scripts\deploy-frontend-fast.py
```

这个脚本会做这些事：

1. 跑 `npm run typecheck --workspace=frontend`
2. 跑 `npm run build --workspace=frontend`
3. 打包 `frontend/dist`
4. 通过 `secrets.env` 的 ECS SSH 配置上传到服务器
5. 备份服务器 `/opt/matrixflow/frontend-dist`
6. 覆盖新的前端静态文件
7. 保留 `downloads` 和 `companion-updates`
8. reload 或重启 `matrixflow-frontend`
9. 校验本地、远端、origin、公网 HTML 的 `assets/js/index-*.js` hash

前端实际上传到：

```text
/opt/matrixflow/frontend-dist
```

不要上传到：

```text
/var/www/matrixflow
/opt/matrixflow/frontend/dist
```

如果本地有未提交的前端源码改动，脚本会拦截。只有在已经记录变更日志后，才用：

```powershell
py -3 scripts\deploy-frontend-fast.py --allow-dirty-source
```

部署后核对公网入口：

```powershell
curl.exe -L -s "https://ddddkiii.com/?codex=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" |
  Select-String -Pattern "assets/js/index-[^`" ]+"
```

## 后端怎么部署

先看计划，不改生产：

```powershell
py -3 scripts\deploy-backend-safe.py --plan
```

确认后执行：

```powershell
py -3 scripts\deploy-backend-safe.py --execute
```

如果有 Prisma migration：

```powershell
py -3 scripts\deploy-backend-safe.py --execute --migrate
```

如果依赖变了，比如 `package.json` 或 lockfile 变了：

```powershell
py -3 scripts\deploy-backend-safe.py --execute --install-deps
```

如果已经本地构建过，只想上传当前构建产物：

```powershell
py -3 scripts\deploy-backend-safe.py --execute --skip-build
```

后端实际上传到：

```text
/opt/matrixflow/backend
```

脚本会备份到：

```text
/opt/matrixflow/releases/backend/<timestamp>
```

脚本会替换 `dist`、`prisma`、`package.json`，执行 `npx prisma generate`，按参数决定是否执行 `npx prisma migrate deploy`，然后 `pm2 restart matrixflow --update-env`。

后端部署后至少验证：

```bash
pm2 status matrixflow
pm2 logs matrixflow --lines 50 --nostream
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/v1/health
curl -s -o /dev/null -w '%{http_code}\n' https://ddddkiii.com/api/v1/health
```

常见判断：

- 新接口公网 `404`：多半是线上 `dist` 不是最新，或 `app.module` 没引入模块。
- Prisma 报 `undefined findMany`：多半是服务器没有 `npx prisma generate`。
- 登录/鉴权异常：先看服务器 `.env` 和 `pm2 restart --update-env` 是否生效。
- 生产磁盘满：先清理明确可删的 `/tmp/matrixflow-*` 临时发布目录，不要碰数据库卷和备份。

## 桌面伴侣怎么更新

桌面伴侣源码在：

```text
desktop-companion/
```

版本号在：

```text
desktop-companion/companion_state.py
```

当前字段：

```python
APP_VERSION = '3.2.78'
```

伴侣发布有两条用户路径：

| 用户路径 | 文件 |
| --- | --- |
| 软件内自动更新 | `pixingyun-mate-portable-<version>.zip` |
| 官网/新电脑手动安装 | `pixingyun-mate-setup-<version>.exe` |

两条都要发布，不能只发 manifest，也不能只发 ZIP。

### 伴侣打包流程

先做 Python 编译检查，至少检查本次改过的文件：

```powershell
py -3 -m py_compile desktop-companion\companion_state.py desktop-companion\companion_app.py
```

完整安装包需要包含独立浏览器和 WebView2 相关依赖。按当前发布规则，full build 使用 `pixingyun-mate-onedir.spec`，并打开 `BUNDLE_PLAYWRIGHT_CHROMIUM=1`。

示例命令，版本号和目录后缀按实际版本替换：

```powershell
cd desktop-companion
$env:BUNDLE_PLAYWRIGHT_CHROMIUM = "1"
py -3 -m PyInstaller pixingyun-mate-onedir.spec --noconfirm --clean --distpath release-dist-onedir-3279-full --workpath build-release-onedir-3279-full
Remove-Item Env:\BUNDLE_PLAYWRIGHT_CHROMIUM
cd ..
```

打包便携 ZIP 时，只压 PyInstaller 输出的干净 onedir，不要压本地日志、配置、数据库、浏览器 profile：

```powershell
Compress-Archive -Path desktop-companion\release-dist-onedir-3279-full\pixingyun-mate\* `
  -DestinationPath desktop-companion\update-release\pixingyun-mate-portable-3.2.79.zip `
  -Force
```

构建安装包：

```powershell
py -3 scripts\build-companion-installer.py --version 3.2.79 --dist desktop-companion\release-dist-onedir-3279-full\pixingyun-mate
```

安装包会生成到：

```text
desktop-companion/update-release/pixingyun-mate-setup-<version>.exe
```

### 伴侣上传到哪里

发布脚本：

```powershell
py -3 scripts\publish-companion-download.py --artifact <artifact-path> --version <version> --notes "<release notes>" --execute
```

它会上传到：

```text
/opt/matrixflow/frontend-dist/downloads
/opt/matrixflow/frontend-dist/companion-updates
```

公网对应：

```text
https://ddddkiii.com/downloads/pixingyun-mate-portable-<version>.zip
https://ddddkiii.com/downloads/pixingyun-mate-setup-<version>.exe
https://ddddkiii.com/companion-updates/latest.json
```

推荐发布顺序：先发布 installer，再发布 portable ZIP。这样最终 `latest.json` 的 `kind` 是 `portable`，同时带有 installer 元数据。

```powershell
py -3 scripts\publish-companion-download.py `
  --artifact desktop-companion\update-release\pixingyun-mate-setup-3.2.79.exe `
  --version 3.2.79 `
  --notes "Release notes in ASCII if possible" `
  --execute

py -3 scripts\publish-companion-download.py `
  --artifact desktop-companion\update-release\pixingyun-mate-portable-3.2.79.zip `
  --version 3.2.79 `
  --notes "Release notes in ASCII if possible" `
  --execute
```

发布后验证：

```powershell
curl.exe -L -s https://ddddkiii.com/companion-updates/latest.json
curl.exe -I https://ddddkiii.com/downloads/pixingyun-mate-portable-3.2.79.zip
curl.exe -I https://ddddkiii.com/downloads/pixingyun-mate-setup-3.2.79.exe
```

更严格的检查是 Range + magic bytes：

- ZIP 开头应是 `504b0304`
- EXE 开头应是 `4d5a5000`

伴侣发布记录必须写进：

- `docs/project-change-log.md`
- `docs/deployment-log.md`
- `docs/project-memory.md`

## Cloudflare Worker 怎么更新

Worker 源码在：

```text
cloudflare/matrixflow-origin-proxy/
```

它负责：

- 给 `/assets/*` 静态资源设置长缓存
- 给 `/api/*`、`/ws/*`、HTML 设置 no-store/no-cache
- 给 `/downloads/*` 设置下载缓存策略
- 给 `/companion-updates/*` 和可变下载别名设置 `no-store`
- 给响应加 `x-matrixflow-entry: cloudflare-worker`

只验证，不改生产：

```powershell
py -3 scripts\deploy-cloudflare-worker.py
```

只检查公网是否还经过 Worker：

```powershell
py -3 scripts\deploy-cloudflare-worker.py --verify-only
```

真正部署：

```powershell
py -3 scripts\deploy-cloudflare-worker.py --execute
```

Worker 的 origin 配置当前是：

```text
ORIGIN_HOST=ddddkiii.com
ORIGIN_RESOLVE_HOST=origin.ddddkiii.com
```

不要把 Worker 直接指到 ECS 公网 IP。历史记录说明直接 IP 会触发 Cloudflare 错误或云厂商备案拦截。

## 微信小程序怎么更新

小程序目录：

```text
weixinxiaochengxu/
```

AppID：

```text
wx73b0bb2bd7eaf634
```

它不是上传到 ECS。它通过微信开发者工具上传体验版，并通过微信云开发 `proxy` 云函数中转请求。

流程：

1. 打开微信开发者工具。
2. 导入 `weixinxiaochengxu` 目录。
3. 扫码登录。
4. 开通或选择云开发环境，拿到环境 ID。
5. 开启开发者工具服务端口。
6. 运行小程序目录里的部署脚本，或按 `weixinxiaochengxu/部署步骤.md` 操作。
7. 到微信公众平台添加体验成员，让朋友扫体验版二维码。

## 数据和备份在哪里

数据库容器：

```text
matrixflow-db
```

Redis 容器：

```text
matrixflow-redis
```

稳定 Docker 卷：

```text
pgdata
redisdata
```

生产备份历史常见位置：

```text
/opt/matrixflow/backups
/opt/matrixflow/releases/backend/<timestamp>
/tmp/matrixflow-frontend-dist-backup-<timestamp>
```

数据库迁移或大后端发布前，先确认已有数据库备份。不要把“重启容器”和“重建数据库卷”混为一谈。

## 回滚方式

前端回滚：

1. 找到最近的 `/tmp/matrixflow-frontend-dist-backup-<timestamp>`。
2. 复制回 `/opt/matrixflow/frontend-dist`。
3. reload 或重启 `matrixflow-frontend`。
4. 验证公网 HTML hash 和 `https://ddddkiii.com/api/v1/health`。

示例：

```bash
cp -a /tmp/matrixflow-frontend-dist-backup-YYYYMMDDHHMMSS/. /opt/matrixflow/frontend-dist/
docker exec matrixflow-frontend nginx -s reload || docker restart matrixflow-frontend
```

后端回滚：

1. 找到 `/opt/matrixflow/releases/backend/<timestamp>`。
2. 恢复 `dist`、`prisma`、`package.json`。
3. 必要时恢复 `.env`。
4. 执行 `npx prisma generate`。
5. `pm2 restart matrixflow --update-env`。
6. 验证本地和公网 health。

注意：数据库 migration 回滚不能随便做。涉及 schema 的回滚必须先有数据库备份，并单独写回滚计划。

伴侣回滚：

1. 找到上一版 `latest-<version>.json`、ZIP、EXE。
2. 重新发布上一版 installer 和 portable。
3. 最后发布 portable，让 `latest.json` 保持 `kind=portable`。
4. 验证 public manifest、ZIP/EXE HEAD、Range magic bytes。

## 不要直接使用的旧路径和旧方案

不要用这些判断生产是否更新：

```text
/var/www/matrixflow
/opt/matrixflow/frontend/dist
root/latest.json
```

不要把这些当当前生产入口：

```text
render.yaml
railway.json
backend/railway.toml
k8s/
Cloudflare Pages
旧 GitHub Actions 部署流
```

不要不读内容就执行旧脚本，尤其是包含以下行为的脚本：

```text
git reset --hard
pm2 delete all
复制到 /var/www/matrixflow
重建数据库卷
重启所有容器
```

如果脚本和 `docs/deployment-log.md` 顶部、公网验证结果冲突，以公网验证为准，然后更新过期文档。

## 常见故障速查

前端部署后页面没变：

- 查公网 HTML 的 `assets/js/index-*.js` 是否变了。
- 确认部署目标是 `/opt/matrixflow/frontend-dist`。
- 确认 `matrixflow-frontend` 读的是这个目录。
- 不要看 `/var/www/matrixflow`。

后端 health 502：

- 查 `pm2 status matrixflow`。
- 查 `pm2 logs matrixflow --lines 80 --nostream`。
- 查 `http://localhost:3000/api/v1/health`。
- 查磁盘是否满。

新接口 404：

- 查服务器 `dist` 里有没有新模块。
- 查 `dist/app.module.js` 有没有引入。
- 重启 PM2。

Prisma 找不到 model：

- 服务器执行 `npx prisma generate`。
- 有 migration 时执行 `npx prisma migrate deploy`。
- 再重启 PM2。

伴侣用户说没有更新：

- 查公网 `https://ddddkiii.com/companion-updates/latest.json`。
- 查安装包/ZIP 是否存在且 Content-Length 对。
- 查用户本机实际运行路径，不要只看桌面快捷方式。
- 当前本机 QA 常见路径是 `D:\Pixingyun\pixingyun-mate.exe`，但用户机器可能不同。

下载链接返回 HTML：

- 说明 `/downloads` 没正确发布，或 Worker/CDN 缓存/路由有问题。
- 用 Range 请求检查 magic bytes，不要只看 HTTP 200。

## 完成标准

一次项目改动完成，至少要满足：

1. 改动已经实现。
2. 跑了对应检查，或说明为什么跳过。
3. 如果部署生产，公网 health 和关键页面/manifest 已验证。
4. 更新 `docs/project-change-log.md`。
5. 如果涉及生产，更新 `docs/deployment-log.md`。
6. 最终说明写清楚改了什么、部署到哪里、怎么验证、是否有剩余风险。

