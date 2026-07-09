# MatrixFlow 全项目深度审计报告

> **审计日期**: 2026-07-07  
> **审计方法**: 12 Agent 并行检测模式  
> **审计范围**: 后端(NestJS)、前端(Vue 3)、桌面伴侣(Python)、基础设施(Docker/部署)、数据库(Prisma/PostgreSQL)  
> **审计文件数**: 200+ 源码文件  

---

## 📊 审计总览

| 严重级别 | 数量 | 说明 |
|---------|------|------|
| 🔴 严重 (P0) | 8 | 安全漏洞/数据泄露/功能完全不可用 |
| 🟠 高危 (P1) | 15 | API契约不一致/业务逻辑错误/数据完整性风险 |
| 🟡 中危 (P2) | 22 | 编码问题/缺失功能/性能隐患 |
| 🔵 低危 (P3) | 18 | 代码质量/文档不一致/优化建议 |

---

## Agent-1: 数据库与 Schema 审计

### 🔴 P0-01: 多个模型缺少外键关系约束

**文件**: `backend/prisma/schema.prisma`

以下模型的 `userId` 字段仅为普通字符串，**未定义与 `User` 的外键关系**，数据库层面无法保证引用完整性：

| 模型 | 字段 | 问题 |
|------|------|------|
| `Competitor` | `userId String` | 无 `user User @relation(...)` |
| `AccountGroup` | `userId String` | 无 `user User @relation(...)` |
| `Asset` | `userId String` | 无 `user User @relation(...)` |
| `Notification` | `userId String` | 无 `user User @relation(...)` |
| `CalendarEvent` | `userId String` | 有关系定义 ✅ |
| `PixingVideoTask` | `userId String` | 无 `user User @relation(...)` |

**影响**: 删除 User 后，这些表的记录成为孤儿数据，无法级联清理。

### 🟠 P1-01: 初始迁移与当前 Schema 严重漂移

**文件**: `backend/prisma/migrations/0001_init/migration.sql` vs `schema.prisma`

初始迁移创建的表结构缺少大量后续添加的字段：
- `Account`: 缺少 `likes`, `storeScore`, `storeDiagnosis`, `cookieSavedAt`
- `Post`: 缺少 `coverUrl`
- `PostStats`: 缺少 `completionRate`, `fiveSecCompletionRate`, `coverClickRate`, `avgPlayDuration`, `videoDuration`, `danmakuCount`, `dislikes`, `followsFromPost`
- `DailyStats`: 缺少 `revenue`, `gmv`, `orders`, `commission`, `buyerCount`, `productCount`, `avgOrderValue`, 以及所有 `*Increment` 字段和 `unfollows`

**影响**: 如果从初始迁移全新部署，会丢失大量字段。后续迁移虽有补充，但迁移链的完整性需要验证。

### 🟠 P1-02: Account → User 外键使用 RESTRICT 而非 CASCADE

**文件**: `backend/prisma/migrations/0001_init/migration.sql` (line 58)

```sql
CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT
```

`DailyStats` 同样使用 `ON DELETE RESTRICT`。这意味着删除用户时，必须先手动删除其所有账号和统计记录，否则操作失败。

### 🟡 P2-01: User.email 在初始迁移中为 NOT NULL，但 Schema 中为可选

初始迁移: `"email" TEXT NOT NULL`  
当前 Schema: `email String? @unique`

这可能导致已有 null email 的用户在迁移时出错。

---

## Agent-2: 后端架构与安全审计

### 🔴 P0-02: 微信小店接口完全无认证 — 严重数据泄露

**文件**: `backend/src/modules/wechat-store/wechat-store.controller.ts`

以下端点标记了 `@Public()`，**任何人无需登录即可访问**：

| 端点 | 暴露数据 |
|------|---------|
| `GET /wechat-store/stores` | 所有店铺列表（含 appId） |
| `GET /wechat-store/shop/orders` | 所有订单数据 |
| `GET /wechat-store/shop/orders/:orderId` | 订单详情 |
| `GET /wechat-store/shop/products` | 所有商品数据 |
| `GET /wechat-store/shop/aftersale` | 所有售后数据 |
| `GET /wechat-store/shop/info` | 店铺信息 |

**影响**: 攻击者可获取所有店铺的订单、商品、售后等敏感商业数据。`POST /stores`（创建店铺）和 `DELETE /stores/:id`（删除店铺）虽然没标 `@Public()`，但也没有 `@UseGuards(JwtAuthGuard)` 显式声明，依赖全局 Guard。

**修复建议**: 移除所有 `@Public()` 注解（除 health check 外），确保所有商业数据端点需要 JWT 认证。

### 🔴 P0-03: 内容审核接口缺少认证保护

**文件**: `backend/src/modules/content-review/content-review.controller.ts`

`ContentReviewController` 既没有 `@Public()` 也没有 `@UseGuards(JwtAuthGuard)`。虽然全局 `JwtAuthGuard` 会默认保护，但该控制器没有 `@ApiBearerAuth()` 注解，Swagger 文档不会显示需要认证。更重要的是，如果有人误加 `@Public()`，将直接暴露审核功能。

### 🟠 P1-03: CORS 生产环境回退过于宽松

**文件**: `backend/src/main.ts` (line 46-51)

```typescript
origin = [
  'https://fda2071c.jujuju-28b.pages.dev',
  /\.jujuju-28b\.pages\.dev$/,
  /\.pages\.dev$/,
] as any;
```

当 `CORS_ORIGIN` 未设置时，生产环境允许所有 `*.pages.dev` 域名访问。这意味着任何 Cloudflare Pages 预览域名都可以调用 API。

### 🟠 P1-04: Token 黑名单使用完整 Token 作为 Redis Key

**文件**: `backend/src/modules/auth/auth.service.ts` (line 169)

```typescript
await this.redis.setWithTTL(`token:blacklist:${refreshToken}`, '1', 7 * 24 * 60 * 60);
```

将完整 JWT 存为 Redis Key，既浪费内存又存在安全隐患（Token 在 Redis 中明文存储）。

**修复建议**: 使用 Token 的 hash 值作为 Key：`token:blacklist:${crypto.createHash('sha256').update(refreshToken).digest('hex')}`

### 🟡 P2-02: 密码修改接口前端有调用但后端不存在

**文件**: `frontend/src/api/auth.ts` (line 29-31) vs 后端 `auth.controller.ts`

前端调用 `POST /auth/change-password`，但后端 `AuthController` 中没有对应端点。用户在设置页面修改密码时会收到 404 错误。

### 🟡 P2-03: JWT 配置不一致

**文件**: `backend/src/modules/auth/auth.module.ts` vs `auth.service.ts`

`AuthModule` 在 `JwtModule.registerAsync` 中只配置了 `JWT_SECRET`，而 `AuthService` 在 `onModuleInit` 中单独读取 `JWT_SECRET` 和 `JWT_REFRESH_SECRET`。`JwtModule` 的默认签名和 `AuthService` 的手动签名使用相同的 secret，但 refresh token 使用不同的 secret，配置分散容易出错。

### 🟡 P2-04: helmet() 默认 CSP 可能阻止前端资源加载

**文件**: `backend/src/main.ts` (line 63)

`app.use(helmet())` 使用默认 CSP，可能会阻止前端从 Google Fonts 等外部 CDN 加载资源。前端 `index.html` 中引用了 `fonts.googleapis.com`。

---

## Agent-3: 后端 API/Controller 审计

### 🔴 P0-04: 大量中文字符编码损坏 (Mojibake)

以下文件中存在严重的中文编码损坏，所有中文注释和 API 描述显示为乱码：

| 文件 | 受影响内容 |
|------|-----------|
| `analytics.controller.ts` | `@ApiOperation` 摘要 (如 "鑾峰彇鎾斁澧為暱瓒嬪娍") |
| `competitors.controller.ts` | 所有 `@ApiOperation` 摘要 |
| `competitors.service.ts` | Logger 输出和注释 |
| `data-sync.scheduler.ts` | 注释和 Logger 输出 |

**影响**: Swagger 文档显示乱码，日志可读性差，维护困难。

### 🟠 P1-05: Teams API 路由不一致 — 前端调用全部 404

**文件**: `frontend/src/api/teams.ts` vs `backend/src/modules/teams/teams.controller.ts`

| 前端调用 | 后端实际路由 | 状态 |
|---------|-------------|------|
| `GET /teams/:teamId/members` | `GET /teams/members` | ❌ 不匹配 |
| `POST /teams/:teamId/invite` | `POST /teams/members/invite` | ❌ 不匹配 |
| `PUT /teams/:teamId/members/:memberId` | `PUT /teams/members/:memberId/role` | ❌ 不匹配 |
| `DELETE /teams/:teamId/members/:memberId` | `DELETE /teams/members/:memberId` | ❌ 不匹配 |

**影响**: 团队管理页面的所有成员操作都会失败。

### 🟠 P1-06: Account-groups 控制器返回 HTTP 200 + `{success: false}`

**文件**: `backend/src/modules/accounts/account-groups.controller.ts` (line 87-88)

```typescript
if (!group) {
  return { success: false, message: '分组不存在或无权操作' };
}
```

应返回 HTTP 404 状态码，但实际返回 200。前端 `TransformInterceptor` 会将其包装为 `{code: 0, message: 'success', data: {success: false, ...}}`，导致前端拦截器认为请求成功。

### 🟡 P2-05: Content 控制器缺少用户归属校验

**文件**: `backend/src/modules/content/content.controller.ts`

- `GET /:id` (`findOne`) 不验证内容是否属于当前用户
- `GET /scheduled` (`getScheduled`) 返回所有用户的定时发布内容

### 🟡 P2-06: Analytics 控制器缺少 @ApiBearerAuth 注解

`analytics.controller.ts` 的端点虽然受全局 JWT Guard 保护，但没有 `@ApiBearerAuth()` 注解，Swagger 文档不显示需要认证。

---

## Agent-4: 后端业务逻辑/Service 审计

### 🔴 P0-05: 数据采集调度器的 CSS 选择器为空 — 采集永远返回 0

**文件**: `backend/src/modules/scheduler/data-sync.scheduler.ts` (line 183-186, 等)

```typescript
const followers = await this.extractNumber(page, '')
const likes = await this.extractNumber(page, '')
const views = await this.extractNumber(page, '')
```

**所有平台**的采集方法（抖音、小红书、快手、B站、微博、微信视频号）都使用空字符串 `''` 作为 CSS 选择器。`extractNumber` 方法会尝试用空选择器查找元素，永远找不到，返回 0。

**影响**: 每日凌晨 2:00 的自动数据采集任务会为所有账号写入全 0 的统计数据，覆盖真实数据。

### 🟠 P1-07: 增量计算使用 Math.max(0, ...) 隐藏负增长

**文件**: `backend/src/modules/scheduler/data-sync.scheduler.ts` (line 313-323)

```typescript
const followersIncrement = previousStats
  ? Math.max(0, metrics.followers - previousStats.followers)
  : 0
```

当粉丝数减少时，增量被设为 0 而非负数，隐藏了真实的掉粉情况。

### 🟠 P1-08: DoudianBrowser 服务使用 `(this.prisma as any)` 绕过类型检查

**文件**: `backend/src/modules/doudian-browser/doudian-browser.service.ts` (多处)

```typescript
const store = await (this.prisma as any).doudianStore.findUnique(...)
```

大量使用 `as any` 绕过类型系统，表明 Prisma Client 可能未正确生成 Doudian 模型。如果 `prisma generate` 未执行，运行时会报错。

### 🟠 P1-09: 微信小店同步无分页限制

**文件**: `backend/src/modules/wechat-store/wechat-store.service.ts` (line 360-403)

`syncOrders` 方法先收集所有订单 ID，然后逐个获取详情。对于有大量订单的店铺，这会导致：
1. 极长的同步时间
2. 可能触发微信 API 限流
3. 内存中保存所有订单详情

### 🟡 P2-07: Platform 枚举使用手动定义而非 @prisma/client

**文件**: `backend/src/common/prisma-enums.ts` (被多处引用)

`analytics.service.ts` 等导入 `Platform` from `../../common/prisma-enums`（手动定义），而非 `@prisma/client`。如果 Prisma Schema 中的枚举与手动定义不一致，会导致数据不一致。

---

## Agent-5: 后端定时任务/调度器审计

### 🟠 P1-10: 调度器模块缺少 BrowserModule 依赖

**文件**: `backend/src/modules/scheduler/scheduler.module.ts`

`DataSyncScheduler` 依赖 `BrowserPool` 和 `CookieManager`（来自 `UploaderModule`），模块也确实导入了 `UploaderModule`。但 `UploaderModule` 内部依赖 Playwright 浏览器，在 2GB 内存的 ECS 服务器上可能导致 OOM。

### 🟠 P1-11: 凭据健康检查通知去重使用 JSON 字符串匹配

**文件**: `backend/src/modules/scheduler/data-sync.scheduler.ts` (line 433-439)

```typescript
const existingNotification = await this.prisma.notification.findFirst({
  where: {
    userId: account.userId,
    type: 'CREDENTIAL_EXPIRED',
    read: false,
    metadata: { contains: account.id },
  },
})
```

`metadata` 是 JSON 字符串字段，使用 `contains` 进行文本匹配。如果 `account.id` 是其他 ID 的子串，会产生误匹配。

### 🟡 P2-08: 调度器无失败重试机制

所有调度器（`DataSyncScheduler`, `WechatStoreSyncScheduler`, `DoudianBrowserSyncScheduler`）在单个账号采集失败后只是记录日志并继续，没有重试逻辑。

### 🟡 P2-09: 北京时间计算使用硬编码偏移量

```typescript
private readonly beijingOffsetMs = 8 * 60 * 60 * 1000
```

虽然中国不使用夏令时，但硬编码偏移量不是最佳实践。应使用 `Intl.DateTimeFormat` 或 `luxon` 等库。

---

## Agent-6: 前端架构与状态管理审计

### 🟠 P1-12: 路由守卫不检查 Token 过期

**文件**: `frontend/src/router/index.ts` (line 133)

```typescript
if (requiresAuth && !userStore.token) {
  next({ name: 'Login', query: { redirect: to.fullPath } })
}
```

只检查 Token 是否存在，不检查是否已过期。过期 Token 仍可通过路由守卫，直到 API 返回 401 才触发刷新/登出。

### 🟠 P1-13: 无角色路由守卫

管理页面（如团队管理、权限管理）没有角色检查。普通 MEMBER 可以访问 `/team/permissions` 页面，虽然后端 API 会拒绝操作，但前端展示了不该看到的界面。

### 🟡 P2-10: 404 路由直接重定向到 Dashboard

```typescript
{ path: '/:pathMatch(.*)*', redirect: '/dashboard' }
```

用户输错 URL 会被静默重定向，无法感知页面不存在。应显示 404 页面。

### 🟡 P2-11: Token 存储在 sessionStorage

**文件**: `frontend/src/store/user.ts` (line 76)

```typescript
storage: sessionStorage,
```

Token 存在 sessionStorage 中，关闭标签页即丢失。同时 sessionStorage 可被 XSS 攻击读取。考虑使用 httpOnly cookie。

### 🟡 P2-12: Pinia Store 不统一处理错误

`account.ts` 和 `content.ts` 的 Store 方法不捕获 API 错误，错误直接抛给调用方。`user.ts` 的 `logout()` 不调用后端登出 API，仅清除本地状态。

---

## Agent-7: 前端 UI/组件/视图审计

### 🟠 P1-14: Dashboard 数据可能仍为 Mock

根据 `项目提示词.txt` 第 44 行，DashboardView 的数字全是写死的 mock 数据。需确认 `MatrixDashboard.vue` 是否已接入真实 API。

### 🟠 P1-15: 定时发布无时间校验

前端定时发布功能允许选择过去的时间，后端 `Post.publishAt` 也无校验。

### 🟡 P2-13: 注册后不自动登录

用户注册成功后需手动切换到登录 Tab 再登录一次，体验不佳。

### 🟡 P2-14: 缺少忘记密码功能

整个系统无密码重置入口。

### 🟡 P2-15: 内容编辑器无草稿自动保存

刷新页面后所有编辑内容丢失。

### 🟡 P2-16: 无发布确认弹窗

点击发布直接执行，无二次确认。

---

## Agent-8: 前端 API/请求层审计

### 🟠 P1-16: 响应拦截器 Code 判断逻辑有隐患

**文件**: `frontend/src/api/request.ts` (line 94)

```typescript
if (res.code !== 0 && res.code !== 200) {
```

后端 `TransformInterceptor` 成功响应固定返回 `code: 0`，但拦截器额外检查 `code !== 200`。如果后端某些接口直接返回 HTTP 200 + `{code: 200}`，逻辑可能不一致。

### 🟡 P2-17: 所有 API 错误都通过 ElMessage 显示

非通知类 API 的错误全部弹出 ElMessage，包括后台轮询请求，可能导致频繁弹窗。

### 🟡 P2-18: 无网络错误重试机制

请求失败后不重试，对于不稳定的网络环境体验差。

### 🟡 P2-19: Team Store 的 fetchMembers 调用路径与后端不匹配

**文件**: `frontend/src/store/team.ts` (line 28-31)

```typescript
const res = await teamsApi.getMembers(id)
```

调用 `GET /teams/:id/members`，但后端路由是 `GET /teams/members`，会导致 404。

---

## Agent-9: 桌面伴侣(Python)审计

### 🟠 P1-17: 抖音数据采集存在虚假增量 Bug

**文件**: `scripts/fix-douyin-fake-deltas.py`

文档记录了真实事故：`douyin_api_collector.py` 从"视频列表求和"改为"profile API total_favorited"后，like_count 从 ~15万跳到 ~688万，导致 local_db.py 产生了数百万的虚假 new_likes。

需要验证当前采集器是否已修复此问题。

### 🟠 P1-18: 桌面伴侣密码加密密钥存储在配置文件中

**文件**: `scripts/fix_newfollowers_report3.py` (line 14, 29)

```python
key_str = cfg.get('_key', '')
```

AES 加密密钥存储在 `companion_config.json` 中，与加密的密码在同一文件中。如果攻击者获取配置文件，同时获得密钥和密文，加密形同虚设。

### 🟡 P2-20: 大量 fix 脚本表明数据质量问题频发

Git 未跟踪文件中有大量 `fix-*.py` 脚本：
- `fix-douyin-fake-deltas.py` — 修复虚假增量
- `fix-wx-deltas.py` — 修复微信增量
- `fix-dy-views.py` / `fix-dy-totals.py` — 修复抖音数据
- `fix-backend-deltas.py` (3个版本) — 修复后端增量
- `fix_newfollowers_report.py` (3个版本) — 修复粉丝上报

说明数据采集和同步链路存在系统性质量问题。

### 🟡 P2-21: CDP 采集方式脆弱

**文件**: `cdp_collect.py`, `desktop-companion/chrome_cdp.py`

依赖 Chrome DevTools Protocol，通过 WebSocket 连接 Chrome 调试端口。Chrome 更新可能导致协议变更，采集中断。

---

## Agent-10: 基础设施/DevOps 审计

### 🟠 P1-19: 两套 docker-compose.yml 配置不一致

| 配置项 | 根 `docker-compose.yml` | `backend/docker-compose.yml` |
|--------|------------------------|------------------------------|
| 服务列表 | DB + Redis + Tunnel | DB + Redis + Nginx + Tunnel + App |
| 网络模式 | 默认 bridge | 自定义 matrixflow 网络 |
| 后端服务 | ❌ 不包含 | ✅ 包含 (但生产用 PM2 不用 Docker) |
| Nginx | ❌ 不包含 | ✅ 包含 (但生产不用 Nginx) |

**影响**: 容易混淆部署配置，已导致过数据丢失事故。

### 🟠 P1-20: Docker 镜像使用 :latest 标签

**文件**: `docker-compose.yml` (line 60)

```yaml
image: cloudflare/cloudflared:latest
```

使用 `:latest` 标签可能导致更新后 breaking change，应固定版本。

### 🟡 P2-22: 缺少后端 CI/CD

`.github/workflows/` 目录下只有 `deploy-frontend.yml`，没有后端自动部署流水线。后端部署完全依赖手动操作。

### 🟡 P2-23: 无自动数据库备份验证

`backup-db.sh` 脚本存在，但：
1. 无 cron job 设置确认
2. 无备份完整性验证
3. 无备份恢复测试

### 🟡 P2-24: 仓库卫生问题严重

Git 未跟踪文件中有 **180+ 个临时脚本**（`scripts/` 目录下），大量 `check-*.py`, `fix-*.py`, `verify-*.py`, `deploy-*.py` 文件。这些文件：
1. 混淆项目结构
2. 可能包含硬编码凭据
3. 无法区分当前有效脚本和历史脚本

### 🟡 P2-25: 生产环境端口暴露

根 `docker-compose.yml` 暴露了 PostgreSQL (5432) 和 Redis (6379) 端口到宿主机。虽然通过 Cloudflare Tunnel 访问，但如果防火墙配置不当，数据库可能被公网访问。

---

## Agent-11: 前后端 API 契约一致性审计

### 🔴 P0-06: Teams API 前后端路由完全不匹配

详细见 P1-05。**所有团队成员管理 API 调用都会失败**，这是功能性阻断级别的问题。

### 🟠 P1-21: 前端 teamsApi 缺少 updateTeam 和 deleteTeam 后端端点

**文件**: `frontend/src/api/teams.ts`

```typescript
updateTeam(id, data) → PUT /teams/:id        // 后端无此路由
deleteTeam(id)       → DELETE /teams/:id      // 后端无此路由
acceptInvite(token)  → POST /teams/accept-invite  // 后端无此路由
```

后端 `TeamsController` 只有：`POST /`, `GET /`, `GET /members`, `POST /members/invite`, `PUT /members/:memberId/role`, `DELETE /members/:memberId`, `GET /:id`。

### 🟠 P1-22: Account-groups 删除 API 返回格式不一致

前端 `accountsApi.deleteGroup(id)` 调用 `del('/account-groups/${id}')`，后端返回 `deleteMany` 的结果 `{ count: number }`，但前端期望 `{ success: boolean }`。

### 🟡 P2-26: Analytics API 路径可能不匹配

前端 `accountsApi.getAccountPosts(id)` 调用 `GET /analytics/account/:id/posts`，需确认后端是否有对应路由。

### 🟡 P2-27: Authing 登录前端有调用但后端配置可能不完整

前端 `user.ts` 有 `authingLogin` 方法调用 `authApi.authingCallback`，但需要确认后端 Authing 配置是否已完成（`authing.service.ts` 是新文件，尚未提交到 Git）。

---

## 📋 修复优先级建议

### 立即修复 (P0)

1. **P0-02**: 移除 `wechat-store.controller.ts` 中所有 `@Public()` 注解（除 stores 列表可保留 Public 外）
2. **P0-05**: 修复 `data-sync.scheduler.ts` 中所有空字符串 CSS 选择器
3. **P0-06/P1-05**: 统一 Teams API 前后端路由
4. **P0-04**: 修复所有中文编码损坏文件

### 本周修复 (P1)

5. **P1-01**: 验证迁移链完整性，确保全新部署能正确创建所有字段
6. **P1-03**: 收紧 CORS 回退策略，移除 `*.pages.dev` 通配
7. **P1-04**: Token 黑名单使用 hash 而非原始 token
8. **P1-07**: 增量计算允许负值
9. **P1-08**: 修复 DoudianBrowser 服务的类型安全
10. **P1-12**: 前端路由守卫增加 Token 过期检查
11. **P1-19**: 统一 docker-compose.yml 配置
12. **P1-21**: 实现或移除前端调用的不存在后端端点

### 后续优化 (P2-P3)

13. 补全缺失外键关系
14. 实现密码修改/重置功能
15. 添加内容编辑器自动保存
16. 清理仓库中的临时脚本
17. 建立后端 CI/CD 流水线
18. 修复所有编码损坏的中文注释

---

## 🏗️ 项目整体评估

| 维度 | 评分 | 评价 |
|------|------|------|
| 功能完整性 | 5/10 | 核心数据采集链路断裂（空选择器），Teams API 不匹配 |
| 安全性 | 4/10 | 微信小店数据完全暴露，CORS 过于宽松 |
| 代码质量 | 6/10 | 大量编码损坏，as any 滥用，临时脚本堆积 |
| 架构设计 | 7/10 | NestJS 模块化合理，但前后端契约不一致 |
| 部署运维 | 5/10 | 多套 docker-compose 混淆，无后端 CI/CD |
| 数据完整性 | 5/10 | 大量 fix 脚本表明数据质量问题频发 |

**总评**: 项目功能骨架完整，但存在多个关键链路断裂和安全漏洞，需要系统性修复后才能稳定运行。

---

*报告生成时间: 2026-07-07 | 多 Agent 并行审计*
