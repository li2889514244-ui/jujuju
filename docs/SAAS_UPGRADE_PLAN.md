# MatrixFlow SaaS 升级计划（修订版）

> 创建日期: 2026-07-08
> 修订日期: 2026-07-08 — 根据用户澄清移除内容发布、订阅计费、域名定制
> 目标: 先内部运营团队使用 → 稳定后对外销售 SaaS 订阅（手动开通账号）
> 原则: 所有架构决策按 SaaS 标准设计，内部使用阶段不写"临时代码"

---

## 产品定位

MatrixFlow 是一个**多平台矩阵账号管理 + 数据分析 + 电商运营**平台。
网站与桌面伴侣紧密相连，伴侣是核心组件而非可选附件。

### 核心功能（保留）
- 多平台账号管理（抖音、小红书、快手、B站、微博、微信视频号）
- 数据采集与看板（粉丝、播放、互动等指标）
- 微信小店 / 抖店电商数据（订单、商品、售后）
- 竞品监控
- AI 智能助手（内容生成、趋势预测、异常检测）
- 团队管理与权限控制
- 内容日历
- 飞书通知集成

### 已取消功能
- ~~内容发布~~（不再需要）
- ~~订阅计费系统~~（手动开通账号，不做自动支付）
- ~~白标域名定制~~（统一使用 ddddkiii.com）

### SaaS 模式
- 统一域名，多租户隔离
- 超级管理员手动创建租户和账号
- 无自动注册、无自动付费

### 数据采集架构原则（不可违反）
> **采集数据必须先保存到本地 SQLite，然后再上传到服务器。**
> 
> 这是核心设计约束，原因：
> 1. 服务器可能宕机或网络中断 — 采集数据不能丢
> 2. 本地 SQLite 是数据真相源（source of truth），服务器是展示层
> 3. 伴侣离线时仍可采集和查看本地数据
> 4. 上传失败不影响本地数据完整性
> 
> **当前实现状态（已验证 ✅）**：
> - `local_db.py`：SQLite 本地数据库，存储账号、指标、作品、历史快照
> - `companion_app.py` 第 3789 行：`# ALWAYS save to local DB first (even if backend is down)`
> - 采集流程：`update_metrics()` → `save_contents()` → `save_history_snapshot()` → 然后 `requests.post(/platforms/report-metrics)`
> - 上传失败仅 print 日志，不回滚本地数据
> - 服务器不可达时，账号使用 `local_` 前缀 ID 在本地创建
> 
> **后端职责**：仅接收上报数据（`POST /platforms/report-metrics`、`POST /platforms/report-post-stats`），不做主动采集

---

## 当前真实状态评估（2026-07-08）

### 已修复（对比 2026-07-07 审计报告）
- [x] CORS 通配符已收紧（生产仅允许 ddddkiii.com）
- [x] Teams API 前端路由已对齐后端
- [x] Auth 接口补全（change-password、me、profile）
- [x] 微信小店控制器由全局 JwtAuthGuard 保护
- [x] 数据采集器空选择器不再写入 0（改为跳过+告警）

### 仍然存在的问题
| 问题 | 严重度 | 影响 |
|------|--------|------|
| 后端采集器 CSS 选择器空，完全依赖桌面伴侣 | 中 | 设计如此，但需正式化数据上报 API |
| AI 模块使用硬编码公式生成假数据 | 高 | AI 功能是虚假的 |
| 多个后端文件中文编码损坏 (Mojibake) | 中 | Swagger 文档乱码 |
| Teams API 缺少 update/delete/accept-invite | 中 | 前端调用 404 |
| 无多租户隔离 | 高 | 无法对外销售 |
| 无超级管理后台 | 高 | 无法管理租户 |
| 无后端 CI/CD | 中 | 部署全手动 |
| 180+ 临时脚本堆积 | 低 | 仓库混乱 |

---

## Phase 1: 核心修复 + 内部可用（第 1-2 周）

### Sprint 1.1: 安全与数据链路（第 1 周）

#### 1.1.1 数据上报 API 正式化
**现状**: 桌面伴侣通过非标准接口上报数据，后端采集器空转
**目标**: 建立正式的数据上报 API，伴侣是唯一数据来源

- [ ] 后端新增 `POST /api/v1/data-report/batch` — 批量上报账号指标
- [ ] 后端新增 `POST /api/v1/data-report/daily-stats` — 上报日统计
- [ ] 后端新增 `POST /api/v1/data-report/account-sync` — 账号信息同步
- [ ] 后端 `data-sync.scheduler.ts` 移除 Playwright 采集代码，保留定时数据校验
- [ ] 桌面伴侣 `collect_and_upload.py` 对齐新 API 格式
- [ ] 数据上报添加 ServiceToken 认证（防止伪造数据）

#### 1.1.2 安全加固
- [ ] Token 黑名单使用 SHA-256 hash 而非原始 token
- [ ] 内容接口添加用户归属校验（`findById`、`getScheduled`）
- [ ] 账号分组删除返回正确的 HTTP 状态码（404 而非 200+success:false）
- [ ] 前端路由守卫已有 Token 过期检查（确认可用）

#### 1.1.3 编码损坏修复
- [ ] `analytics.controller.ts`
- [ ] `competitors.controller.ts`
- [ ] `competitors.service.ts`
- [ ] `data-sync.scheduler.ts`
- [ ] `douyin.uploader.ts`
- [ ] `base-uploader.ts`

### Sprint 1.2: 功能补全（第 2 周）

#### 1.2.1 缺失的后端 API
- [ ] `PUT /teams/:id` 更新团队信息
- [ ] `DELETE /teams/:id` 删除团队
- [ ] `POST /teams/accept-invite` 接受邀请
- [ ] `POST /auth/forgot-password` 忘记密码
- [ ] `POST /auth/reset-password` 重置密码

#### 1.2.2 前端体验补全
- [ ] 注册成功后自动登录
- [ ] 忘记密码页面
- [ ] 全局错误重试组件（ErrorBoundary + retry button）
- [ ] 骨架屏组件（Dashboard、AccountList）
- [ ] 静默失败 → 统一错误提示

#### 1.2.3 AI 模块去 Mock 化
- [ ] 移除 `autoFillAnomalyData` 硬编码公式
- [ ] AI 未连接时明确显示"AI 服务未配置"
- [ ] 接入真实 AI Provider（Anthropic SDK 已在依赖中）
- [ ] AI 服务配置页面（API Key 管理）

#### 1.2.4 仓库清理
- [ ] 删除 `scripts/` 下 180+ 个临时脚本（保留 deploy/backup/verify 三类）
- [ ] 统一 docker-compose.yml
- [ ] 删除根目录散落的 `*.py`、`*.js`、`*.ps1` 临时文件
- [ ] 删除 uploader 模块（发布功能已取消）
- [ ] `.gitignore` 更新

---

## Phase 2: SaaS 架构改造（第 3-5 周）

### Sprint 2.1: 多租户架构（第 3-4 周）

#### 2.1.1 数据库层改造
**核心原则: Row-Level Isolation（共享数据库，tenant_id 隔离）**

- [ ] 新增 `Tenant` 模型
  ```prisma
  model Tenant {
    id          String   @id @default(cuid())
    name        String
    status      String   @default("ACTIVE")  // ACTIVE / SUSPENDED
    maxAccounts Int      @default(20)
    maxUsers    Int      @default(10)
    expiresAt   DateTime?
    createdAt   DateTime @default(now())
    updatedAt   DateTime @updatedAt
    users       User[]
  }
  ```
- [ ] User 模型添加 `tenantId` 关联
- [ ] 所有业务模型添加 `tenantId` 字段
  - Account, Post, DailyStats, Competitor, Asset, Notification
  - WechatStore, DoudianStore, CalendarEvent, Team, AccountGroup
  - PixingVideoTask, AccountGroup
- [ ] Prisma middleware 自动注入 `tenantId` 过滤条件（查询自动添加 where tenantId）
- [ ] Prisma middleware 拦截写入，自动注入 `tenantId`
- [ ] 数据迁移脚本：现有数据全部关联到默认租户

#### 2.1.2 认证层改造
- [ ] JWT payload 添加 `tenantId`
- [ ] 登录流程关联租户（用户 → tenantId）
- [ ] `@CurrentUser('tenantId')` 装饰器
- [ ] 全局 Guard 校验租户状态（SUSPENDED → 拒绝请求）
- [ ] 注册流程改为：超管创建租户 → 超管在租户下创建用户 → 用户登录

#### 2.1.3 租户用量控制
- [ ] 账号数量限制（添加账号时校验 `maxAccounts`）
- [ ] 用户数量限制（邀请成员时校验 `maxUsers`）
- [ ] 租户过期检查（`expiresAt` 到期 → 登录时提示）
- [ ] 超限响应: 403 + 友好提示

### Sprint 2.2: 超级管理后台（第 5 周）

#### 2.2.1 后端 API
- [ ] `GET /api/v1/admin/tenants` — 租户列表（分页、搜索）
- [ ] `POST /api/v1/admin/tenants` — 创建租户
- [ ] `PUT /api/v1/admin/tenants/:id` — 更新租户（名称、限额、状态）
- [ ] `DELETE /api/v1/admin/tenants/:id` — 冻结租户（软删除）
- [ ] `GET /api/v1/admin/tenants/:id/stats` — 租户用量统计
- [ ] `POST /api/v1/admin/tenants/:id/users` — 在租户下创建用户
- [ ] `GET /api/v1/admin/users` — 全局用户列表
- [ ] `PUT /api/v1/admin/users/:id` — 修改用户（角色、状态、所属租户）
- [ ] `GET /api/v1/admin/system/health` — 系统健康

#### 2.2.2 前端管理后台
- [ ] 独立路由 `/admin`（需要 SUPER_ADMIN 角色）
- [ ] 租户管理页面
  - 列表（搜索、筛选、排序）
  - 创建租户表单（名称、限额、有效期）
  - 编辑租户（修改限额、冻结/解冻）
  - 用量统计（账号数、用户数、数据量）
- [ ] 用户管理页面
  - 全局用户列表
  - 在租户下创建用户
  - 修改用户角色/状态
- [ ] 系统看板
  - 总租户数、活跃租户数
  - 总用户数、活跃用户数
  - 服务器状态（CPU、内存、磁盘）
  - 错误率、响应时间

#### 2.2.3 角色体系调整
```
SUPER_ADMIN  — 平台超级管理员（管理所有租户）
OWNER        — 租户所有者（租户内最高权限）
ADMIN        — 租户管理员
MANAGER      — 团队管理者
MEMBER       — 普通成员
VIEWER       — 只读成员
```

---

## Phase 3: 打磨与上线（第 6-7 周）

### Sprint 3.1: 体验打磨（第 6 周）

#### 3.1.1 前端优化
- [ ] Element Plus 按需导入（减小 ~500KB）
- [ ] 图片懒加载
- [ ] API 请求缓存（5 分钟 stale-while-revalidate）
- [ ] 虚拟滚动（大数据量列表）
- [ ] 移动端汉堡菜单

#### 3.1.2 错误处理体系
- [ ] 全局 ErrorBoundary 组件
- [ ] 统一错误处理策略（不再静默吞异常）
- [ ] 网络错误重试机制（指数退避，最多 3 次）
- [ ] 离线提示组件
- [ ] 降级展示模式

#### 3.1.3 onboarding 流程
- [ ] 首次登录引导（绑定账号 → 下载伴侣 → 查看数据）
- [ ] 空状态 CTA 优化
- [ ] 操作引导 tooltip

#### 3.1.4 部署规范化
- [ ] 后端 CI/CD（GitHub Actions: lint → build → deploy）
- [ ] 数据库迁移自动化
- [ ] 数据库备份 cron + 恢复验证

### Sprint 3.2: 稳定性与上线（第 7 周）

#### 3.2.1 监控告警
- [ ] PM2 + 健康检查告警（飞书通知）
- [ ] 数据库慢查询监控
- [ ] Redis 内存监控
- [ ] API 响应时间 P95 监控

#### 3.2.2 端到端验证
- [ ] 完整 注册→登录→绑定账号→查看数据 流程
- [ ] 数据采集: 桌面伴侣采集→上传→Dashboard 展示
- [ ] 团队管理: 创建团队→邀请成员→角色权限
- [ ] 微信小店/抖店: 同步→展示 订单/商品/售后
- [ ] 多租户隔离: 租户 A 无法访问租户 B 数据
- [ ] 超管后台: 创建租户→创建用户→登录验证

#### 3.2.3 上线准备
- [ ] 用户协议 / 隐私政策
- [ ] 帮助文档 / FAQ
- [ ] 客服支持渠道（飞书群）
- [ ] 数据迁移工具（从内部使用过渡到多租户）
- [ ] 灰度发布计划

---

## 架构决策记录（ADR）

### ADR-001: 多租户隔离策略 — Row-Level Isolation
- **决策**: 共享数据库，所有表添加 `tenantId` 字段
- **原因**: 2GB 服务器无法支撑多数据库实例；PostgreSQL RLS 过于复杂
- **代价**: 需要 Prisma middleware 保证隔离，有泄漏风险
- **缓解**: 自动化测试覆盖跨租户访问场景

### ADR-002: 数据采集架构 — 伴侣上报 + 后端存储
- **决策**: 采集逻辑在桌面伴侣执行，后端只做接收和展示
- **原因**: 后端服务器无法运行 Chromium；各平台反爬策略频繁变化
- **备注**: 伴侣是核心组件，不是可选附件

### ADR-003: 取消内容发布功能
- **决策**: 移除 Uploader 模块和发布相关代码
- **原因**: 用户明确表示不需要

### ADR-004: 不做自动计费系统
- **决策**: 超管手动创建租户和用户，不接入支付
- **原因**: 用户明确表示不需要
- **备注**: 保留 `maxAccounts`/`maxUsers`/`expiresAt` 字段以备未来需要

### ADR-005: 不做白标域名
- **决策**: 统一使用 ddddkiii.com，不做子域名或自定义域名
- **原因**: 用户明确表示不需要

---

## 时间线总览

```
Week 1  ████████████░░░░░░  安全修复 + 数据上报API + 编码修复
Week 2  ░░░░░░░░████████░░  功能补全 + AI去Mock + 仓库清理
        ────── 内部可用里程碑 ──────
Week 3  ████████████░░░░░░  多租户数据库改造
Week 4  ░░░░░░░░████████░░  多租户认证 + 用量控制
Week 5  ░░░░░░░░░░░░██████  超管后台（后端+前端）
        ────── SaaS 就绪里程碑 ──────
Week 6  ████████████░░░░░░  UX 打磨 + CI/CD + 部署规范
Week 7  ░░░░░░░░██████████  监控 + 端到端验证 + 上线
        ────── 正式销售里程碑 ──────
```

---

## 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| 平台反爬升级导致采集失效 | 高 | 高 | 伴侣模式灵活，可快速更新采集脚本 |
| 2GB 服务器支撑不了多租户 | 中 | 中 | 当前 2GB 为过渡期，网站稳定后用户会开好的服务器；架构按可扩展设计，Prisma middleware 开销极小 |
| 桌面伴侣跨平台兼容性 | 中 | 中 | 当前仅 Windows，需评估 Mac 需求 |
| 多租户数据迁移风险 | 高 | 高 | 自动化迁移脚本 + 全量备份 + 灰度切换 |
| Prisma middleware 遗漏导致跨租户泄漏 | 中 | 严重 | 跨租户隔离自动化测试 + 代码审查 |
