# MatrixFlow ERP — Agent 任务分配清单 (Task Assignments)

> **版本**: v1.0  
> **日期**: 2026-05-06  
> **关联文档**: [project-plan.md](./project-plan.md)

---

## 目录

1. [Frontend Agent (前端工程师)](#1-frontend-agent)
2. [Backend Agent (后端工程师)](#2-backend-agent)
3. [Browser-Engine Agent (浏览器引擎工程师)](#3-browser-engine-agent)
4. [DevOps Agent (运维工程师)](#4-devops-agent)
5. [QA Agent (测试工程师)](#5-qa-agent)

---

## 1. Frontend Agent

**总任务数**: 25 项 | **总工时**: ~30 天

### Phase 1 — 基础架构 (Week 1-2)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T1.3 | 搭建 Vue3 前端骨架 | 2d | T1.1 | `apps/web/` 目录结构、路由配置、Element Plus 主题配置 | `pnpm dev` 可启动，首页渲染正常 |
| T1.7-F | 前后端联调 (前端部分) | 0.5d | T1.2, T1.3 | Axios 封装 + `/api/health` 调用示例 | 浏览器中显示后端返回数据 |

**Phase 1 输出物清单**:
- [ ] `apps/web/src/main.ts` — 入口文件
- [ ] `apps/web/src/router/index.ts` — 路由配置 (含 Layout 嵌套)
- [ ] `apps/web/src/stores/` — Pinia Store 骨架
- [ ] `apps/web/src/utils/request.ts` — Axios 封装 (拦截器/Token 刷新)
- [ ] `apps/web/src/styles/` — Element Plus 主题变量覆盖
- [ ] `apps/web/vite.config.ts` — Vite 配置 (代理/别名/构建)

### Phase 2 — 核心功能 (Week 3-6)

#### 认证模块 (Week 3)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T2.3 | 登录/注册页面 | 2d | T1.3 | LoginPage, RegisterPage, ForgotPassword | 表单校验完整，调用后端 API 成功 |
| T2.4 | 权限指令 & 路由守卫 | 1d | T2.2 | `v-permission` directive, router.beforeEach | 无权限菜单隐藏，无权限路由跳转 403 |

#### 账号管理 (Week 3-4)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T2.8 | 账号列表/详情/编辑 | 3d | T2.6 | AccountListPage, AccountDetailPage, AccountFormDialog | CRUD 全流程可用，支持搜索筛选排序 |

#### 浏览器引擎前端 (Week 4-5)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T2.18 | 浏览器实例监控面板 | 2d | T2.17 | BrowserMonitorPage (实例列表/状态/截图预览) | 实时显示浏览器池状态，可查看详情 |

#### 内容发布 (Week 5-6)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T2.21 | 内容编辑器 | 3d | T2.19 | ContentEditor (富文本 + 素材库 + 平台预览) | 支持图文混排、视频上传、话题标签 |
| T2.22 | 发布任务列表 & 状态追踪 | 2d | T2.20 | PublishTaskListPage, TaskDetailDrawer | 实时状态更新，支持取消/重试 |
| T2.24 | 批量发布前端 | 1d | T2.20 | BatchPublishDialog | 多账号多平台一键发布 |

#### 数据统计 (Week 5-6)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T2.27 | 数据看板 (ECharts) | 3d | T2.26 | DashboardPage (折线/柱状/饼图/排名) | 支持时间范围筛选、平台切换、数据导出入口 |

#### 团队协作 (Week 5-6)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T2.31 | 团队管理页面 | 2d | T2.29 | TeamSettingsPage, MemberListPage | 成员邀请/移除/角色变更可用 |

### Phase 3 — AI 集成 (Week 7-8)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T3.3 | AI 内容生成前端 | 3d | T3.2 | AiAssistant (对话式 + 模板式生成) | 可生成标题/文案/标签，支持编辑和一键采用 |
| T3.5 | 运营建议看板 | 2d | T3.4 | InsightDashboard (趋势图 + 异常标记 + 建议卡片) | 展示数据洞察，异常数据高亮 |
| T3.7 | AI 配置页面 | 1d | T3.1 | AiSettingsPage (模型选择/API Key管理/额度显示) | 配置保存生效，额度实时显示 |

### Phase 4 — 测试优化 (Week 9-10)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T4.2 | 前端单元测试 | 2d | Phase 2-3 完成 | Vitest 测试文件 (组件 + Store) | 覆盖率 ≥ 80% |
| T4.6 | 前端性能优化 | 2d | T4.5 | 路由懒加载、组件按需导入、图片压缩、CDN 配置 | LCP < 2.5s, Bundle < 500KB (gzipped) |

---

## 2. Backend Agent

**总任务数**: 30 项 | **总工时**: ~35 天

### Phase 1 — 基础架构 (Week 1-2)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T1.2 | 搭建 NestJS 后端骨架 | 2d | T1.1 | `apps/server/` 含模块结构、全局过滤器、拦截器、Swagger 配置 | `pnpm start:dev` 可启动，`/api/docs` 可访问 |
| T1.4 | Prisma Schema v1 设计 | 2d | T1.5 | `prisma/schema.prisma` (User, Team, Account, Platform, PublishTask, StatRecord 等) | Schema 语法正确，关系完整 |
| T1.6 | 数据库迁移 & 种子数据 | 1d | T1.4 | Prisma migrate + `prisma/seed.ts` | `prisma migrate dev` 成功，种子数据可查询 |
| T1.11 | 共享类型包 | 1d | T1.1 | `packages/shared/` (DTO, Enums, Constants) | 其他包可 `import` 使用 |
| T1.12 | 环境变量 & 配置管理 | 0.5d | T1.2 | ConfigModule 配置 + `.env.example` | 所有配置集中管理，类型安全 |

**Phase 1 输出物清单**:
- [ ] `apps/server/src/main.ts` — NestJS 入口
- [ ] `apps/server/src/app.module.ts` — 根模块
- [ ] `apps/server/src/common/` — 公共守卫、过滤器、拦截器、装饰器
- [ ] `prisma/schema.prisma` — 数据模型定义
- [ ] `prisma/seed.ts` — 种子数据脚本
- [ ] `packages/shared/src/` — DTO、枚举、常量

### Phase 2 — 核心功能 (Week 3-6)

#### 认证 & 权限 (Week 3)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T2.1 | JWT 认证模块 | 2d | T1.2, T1.4 | AuthModule (login, register, refresh, logout) | JWT 签发/验证/刷新全流程通过 |
| T2.2 | RBAC 权限系统 | 2d | T2.1 | CaslAbility factory, RolesGuard, PermissionDecorator | 角色/权限 CRUD，API 权限校验生效 |
| T2.5 | 密码加密 & 安全策略 | 0.5d | T2.1 | bcrypt hash, ThrottlerGuard (限流) | 密码不可逆存储，API 限流生效 |

#### 账号管理 (Week 3-4)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T2.6 | 平台账号 CRUD API | 2d | T2.1 | AccountModule (增删改查 + 批量操作 + 分页) | Swagger 文档完整，CRUD 测试通过 |
| T2.7 | 账号分组 & 标签 | 1d | T2.6 | AccountGroup, Tag models + Service | 分组/标签 CRUD，账号关联查询 |
| T2.9 | Cookie/Token 安全存储 | 1d | T2.6 | AES-256 加密/解密服务，加密存储字段 | 数据库中不可见明文 |

#### 浏览器引擎集成 (Week 5)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T2.17 | 浏览器引擎 REST API | 1d | T2.11 | BrowserModule (启动/关闭/截图/执行脚本) | API 可调用浏览器引擎能力 |

#### 发布系统 (Week 5-6)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T2.19 | 发布任务队列 (BullMQ) | 2d | T2.13 | PublishModule + Queue + Worker | 任务入队/执行/完成/失败全流程 |
| T2.20 | 发布任务 API | 1d | T2.19 | PublishController (创建/取消/重试/查询) | API 测试通过 |
| T2.23 | 定时发布 | 1d | T2.19 | SchedulerService (BullMQ delayed jobs) | 定时任务准时触发 |
| T2.24-B | 批量发布后端 | 1d | T2.19 | BatchPublishService | 多任务并发入队，状态聚合返回 |

#### 数据统计 (Week 5-6)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T2.25 | 数据采集定时任务 | 2d | T2.6 | DataCollector (平台 CronJob) | 定时拉取数据并入库 |
| T2.26 | 统计数据 API | 2d | T2.25 | StatsModule (按平台/账号/时间聚合查询) | 查询性能 < 200ms |
| T2.28 | 数据导出 | 1d | T2.26 | ExportService (Excel/CSV) | 导出文件格式正确，大数据量不超时 |

#### 团队协作 (Week 5-6)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T2.29 | 团队 CRUD & 成员管理 | 2d | T2.2 | TeamModule | 邀请/移除/角色变更，权限隔离生效 |
| T2.30 | 账号/内容权限分配 | 1d | T2.29 | PermissionService | 按团队隔离资源访问 |
| T2.32 | 操作日志审计 | 1d | T2.29 | AuditLogModule + Interceptor | 关键操作自动记录，可查询 |

### Phase 3 — AI 集成 (Week 7-8)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T3.1 | AI Provider 抽象层 | 2d | — | AiModule + IAiProvider (OpenAI/国产模型) | 多 Provider 可切换，统一接口 |
| T3.2 | 内容生成 API | 2d | T3.1 | ContentGenerationService (标题/文案/标签) | 生成内容质量可用，支持上下文 |
| T3.4 | 数据洞察 API | 2d | T3.1 | InsightService (趋势分析/异常检测) | 输出结构化洞察，异常标记准确 |
| T3.6 | AI 使用额度管理 | 1d | T3.1 | QuotaService (Token 计数/额度限制/预警) | 超额自动拒绝，预警通知 |
| T3.8 | 内容合规性预检 | 1d | T2.19 | ComplianceChecker (敏感词/违规检测) | 发布前自动拦截违规内容 |
| T3.9 | Prompt 模板管理 | 1d | T3.2 | PromptTemplate CRUD + 预置模板 | 模板可管理，生成时可选用 |

### Phase 4 — 测试优化 (Week 9-10)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T4.1 | 后端单元测试 | 3d | Phase 2-3 完成 | Jest 测试文件 | 覆盖率 ≥ 80%，核心模块 ≥ 90% |
| T4.4 | API 接口测试 | 2d | T4.1 | Supertest e2e 测试 | 所有 API 端点覆盖 |
| T4.7 | 安全加固 | 1d | T4.4 | Helmet + CSRF + 参数校验 + SQL 注入防护 | OWASP Top 10 无高危 |
| T4.12 | 数据库索引优化 | 1d | T4.5 | 索引调整 + 慢查询优化 | 无 > 100ms 的慢查询 |

---

## 3. Browser-Engine Agent

**总任务数**: 12 项 | **总工时**: ~18 天

### Phase 1 — 基础架构 (Week 1-2)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T1.10 | Playwright 安装 & 基础配置 | 1d | T1.1 | `packages/browser-engine/` 含 BrowserManager 骨架 | 可启动/关闭浏览器实例 |

**Phase 1 输出物清单**:
- [ ] `packages/browser-engine/src/browser-manager.ts` — 浏览器管理器
- [ ] `packages/browser-engine/src/config.ts` — 配置 (并发数/超时/路径)
- [ ] `packages/browser-engine/package.json` — 依赖声明

### Phase 2 — 核心功能 (Week 4-5)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T2.11 | Playwright 浏览器池管理 | 3d | T1.10 | BrowserPool (并发控制、自动回收、健康检查) | 并发 10 实例稳定运行，内存可控 |
| T2.12 | 平台适配器接口定义 | 1d | T2.11 | IPlatformAdapter interface + BaseAdapter | 接口清晰，含 login/publish/checkHealth |
| T2.13 | 抖音适配器 | 3d | T2.12 | DouyinAdapter (登录态注入 + 视频发布 + 健康检测) | 可自动登录 + 发布测试视频 |
| T2.14 | 快手适配器 | 2d | T2.12 | KuaishouAdapter | 同上 |
| T2.15 | 小红书适配器 | 2d | T2.12 | XiaohongshuAdapter | 同上 |
| T2.16 | 视频号适配器 | 2d | T2.12 | WeixinVideoAdapter | 同上 |
| T2.10 | 账号健康检测 | 2d | T2.6, T2.11 | AccountHealthChecker (批量检测 + 状态标记) | 检测结果准确，异常账号自动标记 |

### Phase 3 — AI 集成 (Week 7-8)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| (无专项任务，协助 Backend 集成发布流程中的浏览器调用) | — | — | — | 技术支持 | — |

### Phase 4 — 测试优化 (Week 9-10)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T4.3 | E2E 测试 (浏览器引擎部分) | 2d | Phase 2 完成 | Playwright 测试脚本 (平台适配器回归) | 核心发布流程自动化测试通过 |

### 平台适配器开发规范

每个适配器必须实现：

```typescript
interface IPlatformAdapter {
  name: string;
  platform: Platform;
  
  // 登录态管理
  login(context: BrowserContext, credentials: AccountCredentials): Promise<boolean>;
  checkLoginState(context: BrowserContext): Promise<boolean>;
  
  // 内容发布
  publish(context: BrowserContext, content: PublishContent): Promise<PublishResult>;
  
  // 数据采集
  collectStats(context: BrowserContext, accountId: string): Promise<PlatformStats>;
  
  // 健康检测
  healthCheck(context: BrowserContext): Promise<HealthStatus>;
}
```

---

## 4. DevOps Agent

**总任务数**: 13 项 | **总工时**: ~16 天

### Phase 1 — 基础架构 (Week 1-2)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T1.1 | 初始化 Monorepo | 0.5d | — | `pnpm-workspace.yaml`, 根 `package.json`, `turbo.json` | `pnpm install` 成功，workspace 可用 |
| T1.5 | Docker Compose 开发环境 | 1d | T1.1 | `docker-compose.dev.yml` (PostgreSQL + Redis + Adminer + RedisCommander) | `docker compose up -d` 一键启动 |
| T1.8 | 代码规范工具链 | 0.5d | T1.1 | ESLint + Prettier + Husky + lint-staged 配置 | `git commit` 自动 lint |
| T1.9 | GitHub Actions CI | 1d | T1.1 | `.github/workflows/ci.yml` | Push 触发 lint + build + test |

**Phase 1 输出物清单**:
- [ ] `pnpm-workspace.yaml` — Monorepo 配置
- [ ] `turbo.json` — Turborepo 任务编排
- [ ] `docker-compose.dev.yml` — 开发环境
- [ ] `.github/workflows/ci.yml` — CI Pipeline
- [ ] `.eslintrc.js` + `.prettierrc` + `.husky/` — 代码规范
- [ ] `.env.example` — 环境变量模板

### Phase 4 — 测试优化 (Week 9-10)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T4.5 | 性能压测 & 优化 | 2d | Phase 2 完成 | k6 压测脚本 + 性能报告 | P95 < 200ms, 无 OOM |
| T4.8 | K8s 编排配置 | 2d | T4.9 | `k8s/` (Deployment, Service, Ingress, HPA, ConfigMap, Secret) | `kubectl apply` 可部署 |
| T4.9 | Docker 生产镜像优化 | 1d | T4.8 | 多阶段 Dockerfile, 镜像 < 200MB | 镜像可正常运行 |
| T4.10 | 监控告警配置 | 1d | T4.8 | Prometheus rules + Grafana dashboards + AlertManager | 告警规则触发测试通过 |
| T4.11 | 日志收集方案 | 1d | T4.8 | 结构化日志格式 + Loki/ELK 配置 | 日志可查询、可关联 traceId |

### Phase 5 — 部署上线 (Week 11)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T5.1 | Staging 环境搭建 | 1d | T4.8 | Staging K8s namespace + 部署脚本 | Staging 环境可访问 |
| T5.3 | 生产数据库初始化 | 0.5d | T5.1 | Migration 脚本 + 初始数据 | 数据库就绪 |
| T5.4 | 灰度发布 | 0.5d | T5.2 | Nginx Ingress canary annotation / Istio VirtualService | 10% 流量切到新版本 |
| T5.5 | 全量切换 | 0.5d | T5.4 | DNS 切换 + 旧版本下线 | 全量流量到新版本 |
| T5.6 | 上线后监控值守 | 1d | T5.5 | 监控仪表盘 + 告警响应 SOP | 24h 内无 P0/P1 告警 |

### K8s 部署架构

```
┌─────────────────────────────────────────────────┐
│                  Kubernetes Cluster              │
│                                                  │
│  ┌─────────────┐    ┌─────────────┐              │
│  │   Ingress   │───→│   Service   │              │
│  │  (Nginx)    │    │ (ClusterIP) │              │
│  └─────────────┘    └──────┬──────┘              │
│                            │                     │
│              ┌─────────────┼─────────────┐       │
│              ↓             ↓             ↓       │
│        ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│        │ Server   │ │ Server   │ │ Server   │   │
│        │ Pod (N)  │ │ Pod (N)  │ │ Pod (N)  │   │
│        └──────────┘ └──────────┘ └──────────┘   │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ PostgreSQL   │  │    Redis     │              │
│  │ (StatefulSet)│  │ (StatefulSet)│              │
│  └──────────────┘  └──────────────┘              │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ Prometheus   │  │   Grafana    │              │
│  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────┘
```

---

## 5. QA Agent

**总任务数**: 5 项 | **总工时**: ~8 天

### Phase 4 — 测试优化 (Week 9-10)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T4.3 | E2E 测试 (业务流程) | 3d | Phase 2-3 完成 | Playwright E2E 测试套件 | 核心流程 100% 覆盖 |
| T4.3-A | 登录/注册/权限 E2E | 0.5d | T2.1-T2.4 | `auth.spec.ts` | 认证全流程自动化 |
| T4.3-B | 账号管理 E2E | 0.5d | T2.6-T2.8 | `account.spec.ts` | 账号 CRUD 自动化 |
| T4.3-C | 内容发布 E2E | 1d | T2.19-T2.22 | `publish.spec.ts` | 单平台发布全流程 |
| T4.3-D | 团队协作 E2E | 0.5d | T2.29-T2.31 | `team.spec.ts` | 多角色协作场景 |
| T4.3-E | AI 功能 E2E | 0.5d | T3.1-T3.3 | `ai.spec.ts` | 内容生成全流程 |

### Phase 5 — 部署上线 (Week 11)

| 任务 ID | 任务 | 工时 | 依赖 | 交付物 | 验收标准 |
|---------|------|------|------|--------|---------|
| T5.2 | Staging 全流程验证 | 1d | T5.1 | 验证报告 (Checklist) | 所有 P0 用例通过 |

### 测试覆盖矩阵

| 模块 | 单元测试 (Backend) | 单元测试 (Frontend) | E2E 测试 | 集成测试 |
|------|-------------------|--------------------|---------|---------| 
| 认证 | ✅ T4.1 | ✅ T4.2 | ✅ T4.3-A | ✅ T4.4 |
| 账号管理 | ✅ T4.1 | ✅ T4.2 | ✅ T4.3-B | ✅ T4.4 |
| 浏览器引擎 | ✅ T4.1 | — | ✅ T4.3 (Browser-Engine) | ✅ T4.4 |
| 内容发布 | ✅ T4.1 | ✅ T4.2 | ✅ T4.3-C | ✅ T4.4 |
| 数据统计 | ✅ T4.1 | ✅ T4.2 | — | ✅ T4.4 |
| 团队协作 | ✅ T4.1 | ✅ T4.2 | ✅ T4.3-D | ✅ T4.4 |
| AI 功能 | ✅ T4.1 | ✅ T4.2 | ✅ T4.3-E | ✅ T4.4 |

---

## 附录: Agent 协作接口定义

### API 契约规范

所有 API 必须遵循：

```yaml
# OpenAPI 3.0 格式
# 路径规范: /api/v1/{resource}
# 响应格式:
{
  "code": 0,        // 0=成功, 非0=错误码
  "message": "ok",  // 错误描述
  "data": {}        // 业务数据
}
```

### 分支策略

```
main ← release/v1.0 ← develop ← feature/xxx
                                  hotfix/xxx
```

### Git Commit 规范

```
feat: 新功能
fix: Bug 修复
docs: 文档更新
style: 代码格式
refactor: 重构
test: 测试
chore: 构建/工具
perf: 性能优化
```

---

*文档维护: PM Agent | 最后更新: 2026-05-06*
