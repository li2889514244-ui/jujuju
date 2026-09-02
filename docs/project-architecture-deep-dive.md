# MatrixFlow / 披星云 —— 项目深度理解总结

> 生成时间：2026-08-21
> 依据：docs/project-handover-text.md、docs/project-change-log.md、docs/deployment-log.md、
> LATEST_DEPLOYMENT.md、backend/prisma/schema.prisma、backend/src 与 frontend/src、
> desktop-companion/ 源码通读。公网核验：health 200、伴侣 manifest 3.2.78。

## 1. 项目是什么

MatrixFlow / 披星云 = 矩阵账号 + 店铺数据管理平台。云管（Web 看板）+ 端采（Windows 桌面伴侣）
双主体架构：桌面端用真实浏览器会话采集抖音/视频号/抖店等平台数据并上报，云端负责存储、聚合、
订单同步、报表推送与多租户协作。

## 2. 生产拓扑（当前真相）

- 公网：`https://ddddkiii.com`
- 链路：Cloudflare Worker `matrixflow-origin-proxy` / Tunnel → 阿里云 ECS → localhost:80
- 前端：Docker 容器 `matrixflow-frontend`（nginx 静态文件，目录 `/opt/matrixflow/frontend-dist`）
- 后端：PM2 `matrixflow`（NestJS dist，`/opt/matrixflow/backend`，端口 3000）
- 数据：Docker `matrixflow-db`（PG16，127.0.0.1:5432，卷 pgdata）、`matrixflow-redis`（AOF+密码，卷 redisdata）
- 隧道：`matrixflow-tunnel`（cloudflared QUIC，region us，Aliyun DNS，稳定参数 + cron guard）
- 伴侣发布：`/downloads/*` + `/companion-updates/latest.json`（当前 3.2.78，kind=portable）
- 弃用勿信：Render/Railway/k8s/Cloudflare Pages/`/var/www/matrixflow`/根目录 latest.json

## 3. 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3 + Pinia + Element Plus + ECharts + Vite（workspace monorepo） |
| 后端 | NestJS 10 + Prisma 5 + PostgreSQL 16 + Redis 7 + Socket.IO + @nestjs/schedule + Swagger(dev) |
| 桌面端 | Python 3.12 + Flask(localhost:5409) + pywebview + Playwright Chromium + SQLite(local_db) + capcut-cli/FFmpeg/Whisper/DeepSeek |
| 边缘 | Cloudflare Worker（wrangler）+ Cloudflare Tunnel |
| 部署 | paramiko 脚本（secrets.env 凭据）+ PM2 + Docker |

## 4. 数据模型（29 个 Prisma 模型，14 个迁移）

- 租户三件套：User(6 角色) → Organization(plan/额度) → Team/TeamMember/TeamPermission
- 账号域：Account（10 平台枚举、cookie 加密、采集状态 4 字段）、DailyStats（含增量）、
  Post/PostStats、AccountGroup、AccountOperator、Competitor/Snapshot、Asset、AuditLog
- 变现域：WechatStore(appId/appSecret) + 订单/商品/售后（raw Json 存原始报文）；
  DoudianStore(profilePath 绑定伴侣本地 profile) + 同构三表
- 新业务：PerformanceLadderConfig/PerformanceLadderTeacher（组织级天梯配置，JSON 字段）
- 其他：Notification、McpKey、CalendarEvent、PixingVideoTask

## 5. 后端架构（23 个模块，app.module 装配 23 个；ai/ 目录按需求已移除装配，uploader/ 被直接引用）

全局装配：TenantInterceptor（AsyncLocalStorage 组织隔离）+ 守卫链
JwtAuthGuard(@Public/@ServiceAuth 放行) → ServiceTokenGuard(X-Service-Token=SERVICE_TOKEN，伴侣/worker 通道)
→ RolesGuard(@Roles) → ThrottlerGuard(短/中/长三级)。

- main.ts：api/v1 前缀、helmet、160MB body、trace-id、生产 CORS 仅 ddddkiii.com、Swagger 仅 dev
- 核心服务：analytics(1576行 仪表盘聚合)、platforms(1158行 reportMetrics 伴侣上报入口+数据质量校验+头像缓存)、
  mcp(1003行 MCP Server：6 工具+2 资源)、doudian-browser(992行 伴侣上传/重绑/会话+服务端采集回退)、
  wechat-store(729行 微信 API 同步)、accounts(689行)、auth(639行 飞书 OAuth 全链)、scan-bind(gateway 扫码)
- 定时任务：02:00 全账号采集；08:30 预同步 + 09:00 订单日报（飞书推 ADMIN）；每分钟退款告警（静默原因白名单）
- 口径核心 doudian-store-metrics.ts：抖店关闭单 {4,21}、成功退款 {12,27}；营收订单=非关闭∪关闭但有成功退款；
  微信非营收状态 {10,12,250}、成功退款 MERCHANT_REFUND_SUCCESS；退款按 order_id 去重（售后 id 兜底）

## 6. 前端架构（22 视图、19 API 模块、4 store、7 composables）

- 路由分区：总览（矩阵数据/内容洞察）· 运营流程（账号/日历）· 商业转化（微信小店/抖店/业绩天梯/来源详情）·
  组织设置（团队/权限/平台/MCP/飞书）· 系统（超管）；meta.roles 控制可见性
- 鉴权：request.ts 单飞 refreshPromise + 提前 60s 主动刷新 + _retry 防环 + 乱码文案防护
- 伴侣桥接：useCompanionUrl 探测 http://127.0.0.1:5409/health，网页直接驱动本机伴侣（扫码/抖店同步）
- Dashboard：7 KPI 按日/周/月 period 聚合（complete/partial 状态机）

## 7. 桌面伴侣（57+ 本地路由，3.2.78）

- 登录/飞书/扫码绑定（本地浏览器 profile 隔离）→ 采集（API 直采 + 文本解析双路线）→ local_db 缓存 → 定时上报
- 抖店：浏览器登录 → CDP 抓包合并（订单/商品/售后端点分类）→ 上传；白天 30min/夜间 2h 定时
- AI 剪辑：capcut-cli 白名单命令；标准链（ffmpeg 抽音轨→静音检测→Whisper 字幕→DeepSeek 匹配剪映效果/滤镜）；
  AI 链（指令→DeepSeek 生成命令→校验→执行）
- 更新：manifest 拉取 → Range 续传 + SHA256 → ZIP 解压 / EXE 替换（VBScript 隐藏窗口）→ 重启
- 打包：PyInstaller onedir（BUNDLE_PLAYWRIGHT_CHROMIUM=1 时含独立 Chromium）+ Inno Setup（含 WebView2 离线包）

## 8. 四条核心数据流

1. 社媒采集：扫码登录(本地 profile) → 采集器 → local_db → reportMetrics(后端校验周期单调性) → DailyStats → Dashboard
2. 抖店：本地 Chrome → CDP 采集 → uploadCompanionData(409 STALE 时 rebind) → 三表 → 口径函数 → 页面/天梯/日报
3. 微信小店（纯服务端）：/channels/ec/* → syncStore(30s API/4min 店超时+45009 熔断) → 三表 → 定时报告
4. 伴侣更新：manifest → 续传下载 → 校验 → 双通道更新 → 隐藏窗口重启

## 9. 部署链路（官方入口）

- 诊断：`py -3 scripts\diagnose-production.py [--remote] [--require-worker-route]`
- 前端：`deploy-frontend-fast.py`（typecheck→build→打包→SSH 上传→备份→替换→校验 4 级 hash；--allow-dirty-source）
- 后端：`deploy-backend-safe.py --plan/--execute [--migrate|--install-deps|--skip-build]`
- 伴侣：PyInstaller/Inno 构建 → `publish-companion-download.py`（先 installer 后 portable，保持 kind=portable）
- Worker：`deploy-cloudflare-worker.py --execute`（Wrangler OAuth；.env.local token 仅 purge 权限）
- 回滚：前端 /tmp/matrixflow-frontend-dist-backup-*；后端 /opt/matrixflow/releases/backend/<ts>；DB 迁移回滚需先备份单独计划
- 记录：project-change-log.md（所有改动）/ deployment-log.md（所有生产动作）/ project-memory.md（版本教训）

## 10. 关键坑位与经验（沉淀）

- 服务器端禁止 Playwright 扫码（封号风险），生产由伴侣完成；SERVICE_TOKEN 未配置时服务端通道 fail-closed
- 生产磁盘满曾两度引发事故（08-14 微信同步锁卡死、08-21 迁移失败）→ 部署前清 /tmp/matrixflow-* 临时目录
- 微信小店 syncRunning 是内存锁，进程重启即清除；每个店 4 分钟超时兜底
- 伴侣昵称/头像安全网：平台默认页名、法人名、sph uid 均视为可疑，不覆盖已有安全昵称
- 伴侣更新两包缺一不可；Range+magic bytes 验证（ZIP 504b0304 / EXE 4d5a5000）；发布记录避免中文经 PowerShell CLI 传参
- 老公开仓库 li2889514244-ui/jujuju 与私有仓库 ddddkiii/pi-xing-yun 的 GitHub 状态见会话历史，勿混用

## 11. 当前本地/远程状态快照（2026-08-21）

- 生产：health 200；伴侣 manifest 3.2.78；前端最新 bundle 见 deployment-log 顶部
- 本地 git：master=ff4321ea（Initial commit 快照）；另有约 40 条未提交改动（08-21 11:28–14:56 的
  performance-ladder 模块、collect_status 迁移、handover 文档、前后端多处修改）——这些已部署生产但未提交
- 本地备份分支：master-old（375 提交完整历史）、backup-fix-security-20260820（10 个安全修复提交）
- 过时文档：docs/ 下 2026-05-11 的 10 份文档（database-design/tech-stack 等）落后于现状，以本文件与
  project-handover-text.md 为准
