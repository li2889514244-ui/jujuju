# MatrixFlow ERP — 项目计划 (Project Plan)

> **版本**: v1.0  
> **日期**: 2026-05-06  
> **项目经理**: PM Agent  
> **总工期**: 11 周 (约 2.5 个月)

---

## 1. 项目概述

**MatrixFlow ERP** 是一个企业级 SaaS 矩阵账号管理平台，核心能力：

- 多平台账号集中管理（抖音、快手、小红书、视频号等）
- 跨平台数据统计与可视化
- 团队协作（5-20 人），角色权限管理
- AI 辅助内容生成与分析

### 技术栈

| 层级 | 技术选型 |
|------|---------|
| 前端 | Vue 3 + TypeScript + Element Plus + Pinia + Vue Router |
| 后端 | NestJS + Prisma ORM + PostgreSQL + Redis + BullMQ |
| 容器化 | Docker + Docker Compose (dev) / Kubernetes (prod) |
| CI/CD | GitHub Actions → Docker Registry → K8s Rolling Update |
| 监控 | Prometheus + Grafana + ELK |

---

## 2. 阶段总览 (Gantt 概览)

```
Week:  1  2  3  4  5  6  7  8  9  10  11
Phase1 ████████                               基础架构 (2周)
Phase2             ████████████████            核心功能 (4周)
Phase3                             ████████   AI集成 (2周)
Phase4                                     ████████  测试优化 (2周)
Phase5                                             ████  部署上线 (1周)
```

---

## 3. Phase 1 — 基础架构搭建 (第 1-2 周)

### 目标
搭建可运行的全栈骨架，完成基础设施配置，确保所有 Agent 有独立开发环境。

### 里程碑
- [x] M1.1: 项目 Monorepo 结构就绪
- [x] M1.2: 数据库 Schema v1 完成并可迁移
- [x] M1.3: 前后端联调通路打通 (Hello World API)
- [x] M1.4: Docker 开发环境一键启动
- [x] M1.5: CI Pipeline 基础流程跑通

### 任务分解

| 任务 ID | 任务 | 负责 Agent | 工时 | 输出物 |
|---------|------|-----------|------|--------|
| T1.1 | 初始化 Monorepo (pnpm workspace) | DevOps | 0.5d | `pnpm-workspace.yaml`, 根 `package.json` |
| T1.2 | 搭建 NestJS 后端骨架 | Backend | 2d | `apps/server/` 含模块结构、健康检查接口 |
| T1.3 | 搭建 Vue3 前端骨架 | Frontend | 2d | `apps/web/` 含路由、布局、Element Plus 配置 |
| T1.4 | 设计并创建 Prisma Schema v1 | Backend | 2d | `prisma/schema.prisma` (User, Team, Account, Platform 等核心模型) |
| T1.5 | PostgreSQL + Redis Docker Compose | DevOps | 1d | `docker-compose.dev.yml` |
| T1.6 | 数据库迁移脚本 & 种子数据 | Backend | 1d | Prisma migrate + seed.ts |
| T1.7 | 前后端 API 联调验证 | Frontend + Backend | 0.5d | `/api/health` 从前端成功调用 |
| T1.8 | ESLint / Prettier / Husky 配置 | DevOps | 0.5d | 代码规范工具链 |
| T1.9 | GitHub Actions CI 基础 | DevOps | 1d | `.github/workflows/ci.yml` (lint, build, test) |
| T1.10 | Playwright 安装 & 基础配置 | Browser-Engine | 1d | `packages/browser-engine/` 含浏览器池管理骨架 |
| T1.11 | 共享类型包 (`@matrixflow/shared`) | Backend | 1d | `packages/shared/` 含 DTO、枚举、常量 |
| T1.12 | 环境变量 & 配置管理方案 | DevOps | 0.5d | `.env.example`, config module |

### 依赖关系

```
T1.1 ─┬─→ T1.2 (Backend 依赖 Monorepo)
      ├─→ T1.3 (Frontend 依赖 Monorepo)
      ├─→ T1.5 (DevOps 依赖 Monorepo)
      └─→ T1.11 (Shared 依赖 Monorepo)

T1.5 ─→ T1.4 (Schema 依赖 DB 可用)
T1.4 ─→ T1.6 (Migration 依赖 Schema)
T1.2 ─┬─→ T1.7 (联调依赖后端)
T1.3 ─┘        (联调依赖前端)
T1.6 ─→ T1.7 (联调依赖 DB 就绪)
T1.1 ─→ T1.9 (CI 依赖 Monorepo)
```

---

## 4. Phase 2 — 核心功能开发 (第 3-6 周)

### 目标
实现平台核心业务功能：账号管理、内容发布、数据统计、团队协作。

### 里程碑
- [x] M2.1: 用户认证系统完成 (JWT + RBAC)
- [x] M2.2: 多平台账号 CRUD 完成
- [x] M2.3: 浏览器引擎封装完成 (Playwright Manager)
- [x] M2.4: 内容发布流程跑通 (抖音首发)
- [x] M2.5: 数据采集 & 统计看板 v1
- [x] M2.6: 团队管理 & 权限系统完成

### 任务分解 — 认证 & 用户模块 (Week 3)

| 任务 ID | 任务 | 负责 Agent | 工时 | 输出物 |
|---------|------|-----------|------|--------|
| T2.1 | JWT 认证模块 (登录/注册/刷新Token) | Backend | 2d | Auth module + guard |
| T2.2 | RBAC 权限系统 (角色/权限/守卫) | Backend | 2d | CaslAbility + RolesGuard |
| T2.3 | 登录/注册前端页面 | Frontend | 2d | LoginPage, RegisterPage |
| T2.4 | 权限指令 & 路由守卫 | Frontend | 1d | `v-permission` directive, router guard |
| T2.5 | 密码加密 & 安全策略 | Backend | 0.5d | bcrypt, rate limiting |

### 任务分解 — 账号管理 (Week 3-4)

| 任务 ID | 任务 | 负责 Agent | 工时 | 输出物 |
|---------|------|-----------|------|--------|
| T2.6 | 平台账号 CRUD API | Backend | 2d | AccountModule (增删改查 + 批量操作) |
| T2.7 | 账号分组 & 标签系统 | Backend | 1d | AccountGroup, Tag models |
| T2.8 | 账号列表/详情/编辑前端页面 | Frontend | 3d | AccountList, AccountDetail, AccountForm |
| T2.9 | Cookie/Token 安全存储方案 | Backend | 1d | AES-256 加密存储 |
| T2.10 | 账号健康检测 (登录状态检查) | Browser-Engine | 2d | AccountHealthChecker |

### 任务分解 — 浏览器引擎 (Week 4-5)

| 任务 ID | 任务 | 负责 Agent | 工时 | 输出物 |
|---------|------|-----------|------|--------|
| T2.11 | Playwright 浏览器池管理 | Browser-Engine | 3d | BrowserPool (并发控制、生命周期管理) |
| T2.12 | 平台适配器接口定义 | Browser-Engine | 1d | IPlatformAdapter interface |
| T2.13 | 抖音适配器 (登录态注入 + 发布) | Browser-Engine | 3d | DouyinAdapter |
| T2.14 | 快手适配器 | Browser-Engine | 2d | KuaishouAdapter |
| T2.15 | 小红书适配器 | Browser-Engine | 2d | XiaohongshuAdapter |
| T2.16 | 视频号适配器 | Browser-Engine | 2d | WeixinVideoAdapter |
| T2.17 | 浏览器引擎 REST API | Backend | 1d | BrowserModule (启动/关闭/截图/执行) |
| T2.18 | 浏览器实例监控面板 | Frontend | 2d | BrowserMonitor component |

### 任务分解 — 内容发布 (Week 5-6)

| 任务 ID | 任务 | 负责 Agent | 工时 | 输出物 |
|---------|------|-----------|------|--------|
| T2.19 | 发布任务队列 (BullMQ) | Backend | 2d | PublishModule + Queue |
| T2.20 | 发布任务 API (创建/取消/重试) | Backend | 1d | PublishController |
| T2.21 | 内容编辑器前端 (富文本 + 素材管理) | Frontend | 3d | ContentEditor, MediaUploader |
| T2.22 | 发布任务列表 & 状态追踪 | Frontend | 2d | PublishTaskList, TaskDetail |
| T2.23 | 定时发布功能 | Backend | 1d | SchedulerService (cron-based) |
| T2.24 | 批量发布功能 | Backend + Frontend | 2d | BatchPublishDialog |

### 任务分解 — 数据统计 (Week 5-6)

| 任务 ID | 任务 | 负责 Agent | 工时 | 输出物 |
|---------|------|-----------|------|--------|
| T2.25 | 数据采集定时任务 | Backend | 2d | DataCollector (CronJob per platform) |
| T2.26 | 统计数据 API (按平台/账号/时间) | Backend | 2d | StatsModule |
| T2.27 | 数据看板页面 (ECharts) | Frontend | 3d | DashboardPage (折线图/柱状图/饼图) |
| T2.28 | 数据导出 (Excel/CSV) | Backend | 1d | ExportService |

### 任务分解 — 团队协作 (Week 5-6)

| 任务 ID | 任务 | 负责 Agent | 工时 | 输出物 |
|---------|------|-----------|------|--------|
| T2.29 | 团队 CRUD & 成员管理 API | Backend | 2d | TeamModule |
| T2.30 | 账号/内容权限分配 | Backend | 1d | PermissionService |
| T2.31 | 团队管理前端页面 | Frontend | 2d | TeamSettings, MemberList |
| T2.32 | 操作日志审计 | Backend | 1d | AuditLogModule |

### Phase 2 依赖关系

```
T2.1 ─→ T2.2 ─→ T2.4 (认证→权限→前端守卫)
T2.1 ─→ T2.6 (账号API依赖认证)
T2.6 ─→ T2.8 (前端依赖API)
T2.6 ─→ T2.10 (健康检测依赖账号数据)
T2.11 ─┬→ T2.13 (适配器依赖浏览器池)
       ├→ T2.14
       ├→ T2.15
       └→ T2.16
T2.13 ─→ T2.19 (发布队列依赖适配器)
T2.19 ─→ T2.20 ─→ T2.22 (前端依赖发布API)
T2.6 ─→ T2.25 (数据采集依赖账号)
T2.29 ─→ T2.30 (权限分配依赖团队)
```

---

## 5. Phase 3 — AI 集成 (第 7-8 周)

### 目标
接入 AI 能力，实现智能内容生成、数据分析辅助、自动化建议。

### 里程碑
- [x] M3.1: AI 内容生成服务上线
- [x] M3.2: 智能标题/文案推荐
- [x] M3.3: 数据异常检测 & 运营建议
- [x] M3.4: AI 配置管理 (模型/Key/额度)

### 任务分解

| 任务 ID | 任务 | 负责 Agent | 工时 | 输出物 |
|---------|------|-----------|------|--------|
| T3.1 | AI Provider 抽象层 (OpenAI/国产模型) | Backend | 2d | AiModule + IAiProvider interface |
| T3.2 | 内容生成 API (标题/文案/话题标签) | Backend | 2d | ContentGenerationService |
| T3.3 | AI 内容生成前端 (对话式 + 模板式) | Frontend | 3d | AiAssistant component |
| T3.4 | 数据洞察 API (趋势分析/异常检测) | Backend | 2d | InsightService |
| T3.5 | 运营建议看板 | Frontend | 2d | InsightDashboard |
| T3.6 | AI 使用额度管理 | Backend | 1d | QuotaService |
| T3.7 | AI 配置页面 (模型选择/API Key管理) | Frontend | 1d | AiSettings page |
| T3.8 | 内容合规性预检 | Backend | 1d | ComplianceChecker |
| T3.9 | Prompt 模板管理 | Backend + Frontend | 2d | PromptTemplate CRUD |

### Phase 3 依赖关系

```
T3.1 ─┬→ T3.2 ─→ T3.3
      ├→ T3.4 ─→ T3.5
      └→ T3.6

T2.19 ─→ T3.8 (发布队列→合规预检)
T3.2 ─→ T3.9 (内容生成→Prompt管理)
```

---

## 6. Phase 4 — 测试 & 优化 (第 9-10 周)

### 目标
全面测试、性能优化、安全加固，确保生产就绪。

### 里程碑
- [x] M4.1: 单元测试覆盖率达 80%+
- [x] M4.2: E2E 测试核心流程覆盖
- [x] M4.3: 性能基准测试通过 (P95 < 200ms)
- [x] M4.4: 安全审计完成 (无高危漏洞)
- [x] M4.5: K8s 部署配置就绪

### 任务分解

| 任务 ID | 任务 | 负责 Agent | 工时 | 输出物 |
|---------|------|-----------|------|--------|
| T4.1 | 后端单元测试 (Jest) | Backend | 3d | `*.spec.ts` (80%+ coverage) |
| T4.2 | 前端单元测试 (Vitest) | Frontend | 2d | `*.spec.ts` (组件 + store) |
| T4.3 | E2E 测试 (Playwright) | QA / Browser-Engine | 3d | `tests/e2e/` 核心流程 |
| T4.4 | API 接口测试 (Supertest) | Backend | 2d | `*.e2e-spec.ts` |
| T4.5 | 性能压测 & 优化 | Backend + DevOps | 2d | k6 脚本 + 优化报告 |
| T4.6 | 前端性能优化 (懒加载/缓存/CDN) | Frontend | 2d | Webpack 分析 + 优化 |
| T4.7 | 安全加固 (XSS/CSRF/SQL注入防护) | Backend | 1d | Helmet + CSRF + 参数校验 |
| T4.8 | K8s 编排配置 | DevOps | 2d | `k8s/` (Deployment, Service, Ingress, HPA) |
| T4.9 | Docker 生产镜像优化 | DevOps | 1d | 多阶段构建 + 镜像瘦身 |
| T4.10 | 监控告警配置 | DevOps | 1d | Prometheus rules + Grafana dashboards |
| T4.11 | 日志收集方案 (ELK/Loki) | DevOps | 1d | 结构化日志 + 收集管道 |
| T4.12 | 数据库索引优化 & 慢查询分析 | Backend | 1d | 索引调整 + 查询优化 |

### Phase 4 依赖关系

```
Phase 2 全部完成 ─→ T4.1 ~ T4.4 (测试依赖功能完成)
T4.5 ─→ T4.6 (压测→前端优化)
T4.8 ─→ T4.9 (K8s → Docker 镜像)
T4.8 ─→ T4.10 (K8s → 监控)
```

---

## 7. Phase 5 — 部署上线 (第 11 周)

### 目标
完成生产环境部署，灰度发布，正式上线。

### 里程碑
- [x] M5.1: Staging 环境部署验证通过
- [x] M5.2: 灰度发布 (10% 流量)
- [x] M5.3: 全量发布
- [x] M5.4: 上线后监控 24h 无告警

### 任务分解

| 任务 ID | 任务 | 负责 Agent | 工时 | 输出物 |
|---------|------|-----------|------|--------|
| T5.1 | Staging 环境搭建 & 数据迁移 | DevOps | 1d | Staging K8s namespace |
| T5.2 | Staging 全流程验证 | QA + All | 1d | 验证报告 |
| T5.3 | 生产环境数据库初始化 | Backend + DevOps | 0.5d | Migration + 初始数据 |
| T5.4 | 灰度发布 (Canary) | DevOps | 0.5d | Istio/Nginx canary config |
| T5.5 | 全量切换 & 旧环境下线 | DevOps | 0.5d | DNS 切换 + 清理 |
| T5.6 | 上线后监控 & 值守 | DevOps + Backend | 1d | 监控仪表盘 + 告警响应 |
| T5.7 | 用户文档 & 运维手册 | PM + All | 1d | docs/ + runbook |

---

## 8. Agent 角色定义 & 输入/输出

### 8.1 Frontend Agent (前端工程师)

**职责**: Vue3 应用开发，UI/UX 实现

| 接口方向 | 内容 |
|---------|------|
| **输入** | API 接口文档 (OpenAPI/Swagger)、UI 设计稿、共享类型 (`@matrixflow/shared`) |
| **输出** | Vue3 组件、页面、Store (Pinia)、前端测试 |
| **协作** | 与 Backend 对齐 API 契约，与 Browser-Engine 对接浏览器预览 |

### 8.2 Backend Agent (后端工程师)

**职责**: NestJS 服务端开发，数据库设计，业务逻辑

| 接口方向 | 内容 |
|---------|------|
| **输入** | 产品需求、数据模型设计、共享类型定义 |
| **输出** | RESTful API、Prisma Schema/迁移、后端测试、API 文档 |
| **协作** | 与 Frontend 约定 DTO，与 Browser-Engine 集成发布能力，与 DevOps 对接部署 |

### 8.3 Browser-Engine Agent (浏览器引擎工程师)

**职责**: Playwright 封装，平台适配器开发

| 接口方向 | 内容 |
|---------|------|
| **输入** | 平台 UI 结构 (DOM 分析)、账号凭据 (加密)、发布任务指令 |
| **输出** | 浏览器池管理器、平台适配器 (Adapter)、健康检测器、浏览器引擎 API |
| **协作** | 与 Backend 集成到发布队列，向 Frontend 提供浏览器状态 |

### 8.4 DevOps Agent (运维工程师)

**职责**: 基础设施、CI/CD、容器编排、监控

| 接口方向 | 内容 |
|---------|------|
| **输入** | 应用构建产物 (Dockerfile)、部署配置需求、性能指标要求 |
| **输出** | Docker Compose / K8s 配置、CI/CD Pipeline、监控告警、运维文档 |
| **协作** | 所有 Agent 提交构建产物，DevOps 统一编排部署 |

### 8.5 QA Agent (测试工程师)

**职责**: 测试策略、自动化测试、质量保障

| 接口方向 | 内容 |
|---------|------|
| **输入** | 产品需求、API 文档、前端页面、浏览器引擎 |
| **输出** | 测试计划、E2E 测试用例、测试报告、Bug 列表 |
| **协作** | 与所有开发 Agent 协作修复缺陷 |

### 8.6 PM Agent (项目经理)

**职责**: 项目管理、进度跟踪、风险管理、协调

| 接口方向 | 内容 |
|---------|------|
| **输入** | 各 Agent 进度汇报、风险上报 |
| **输出** | 项目计划、任务分配、进度报告、风险应对方案 |

---

## 9. 依赖关系图 (全局)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Phase 1 (Week 1-2)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐│
│  │ Monorepo │→ │ Backend  │→ │ Frontend │→ │   Docker/CI      ││
│  │  T1.1    │  │ T1.2     │  │ T1.3     │  │   T1.5/T1.9     ││
│  └──────────┘  └────┬─────┘  └────┬─────┘  └──────────────────┘│
│                     │             │                             │
│                     ↓             ↓                             │
│              ┌──────────┐  ┌──────────┐                         │
│              │ Prisma   │  │ Shared   │                         │
│              │ Schema   │  │ Types    │                         │
│              │ T1.4     │  │ T1.11    │                         │
│              └────┬─────┘  └──────────┘                         │
│                   ↓                                             │
│              ┌──────────┐                                       │
│              │Migration │                                       │
│              │ T1.6     │                                       │
│              └──────────┘                                       │
└─────────────────────────────┬───────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        Phase 2 (Week 3-6)                       │
│                                                                 │
│  Auth ──→ Account ──→ BrowserEngine ──→ Publish ──→ Stats      │
│  T2.1    T2.6       T2.11-16        T2.19-24   T2.25-28       │
│    ↓                                                            │
│  RBAC ──→ Team                                                  │
│  T2.2    T2.29-32                                               │
└─────────────────────────────┬───────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        Phase 3 (Week 7-8)                       │
│                                                                 │
│  AI Provider ──→ Content Gen ──→ Insight ──→ Compliance        │
│  T3.1          T3.2-3         T3.4-5      T3.8                │
└─────────────────────────────┬───────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        Phase 4 (Week 9-10)                      │
│                                                                 │
│  Unit Tests → E2E Tests → Perf Test → Security → K8s/Deploy    │
│  T4.1-T4.2   T4.3-T4.4  T4.5-T4.6   T4.7      T4.8-T4.11    │
└─────────────────────────────┬───────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        Phase 5 (Week 11)                        │
│                                                                 │
│  Staging → Canary → Full Release → Monitor → Docs              │
│  T5.1     T5.4    T5.5          T5.6       T5.7                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. 风险识别与应对

| 风险 ID | 风险描述 | 概率 | 影响 | 应对措施 |
|---------|---------|------|------|---------|
| R1 | 平台 UI 频繁改版导致适配器失效 | 高 | 高 | 1) 适配器采用策略模式，隔离变更<br>2) 建立 DOM 快照回归测试<br>3) 预留 20% buffer 工时用于适配器维护 |
| R2 | Playwright 反爬检测 (浏览器指纹) | 中 | 高 | 1) 使用 playwright-extra + stealth 插件<br>2) 指纹随机化 (UA/viewport/WebGL)<br>3) 代理 IP 池轮换 |
| R3 | 多平台 Cookie/Token 有效期不一致 | 中 | 中 | 1) 统一 Token 刷新调度器<br>2) 健康检测定时巡检<br>3) 失效自动通知 + 一键重登录 |
| R4 | 并发发布导致浏览器资源耗尽 | 中 | 中 | 1) 浏览器池上限控制 (默认 10)<br>2) BullMQ 并发限制<br>3) 自动扩缩容策略 |
| R5 | 数据采集 API 限频/封禁 | 高 | 中 | 1) 请求频率自适应 (指数退避)<br>2) 多账号轮换采集<br>3) 数据缓存层 (Redis) |
| R6 | AI 模型 API 不稳定/费用超预期 | 中 | 中 | 1) 多 Provider fallback 机制<br>2) 使用量预警 + 硬限制<br>3) 本地小模型备选方案 |
| R7 | 团队协作实时性不足 | 低 | 低 | Phase 2 先用轮询，Phase 3+ 可引入 WebSocket |
| R8 | 数据库性能瓶颈 (大量账号+统计数据) | 中 | 高 | 1) 分表策略 (按平台/时间)<br>2) 读写分离<br>3) 统计数据预聚合 (物化视图) |
| R9 | 安全风险 (凭据泄露/XSS/注入) | 低 | 极高 | 1) AES-256 加密存储凭据<br>2) 全量输入校验 + 参数化查询<br>3) CSP + Helmet 安全头<br>4) 定期安全扫描 |
| R10 | 人员变动/Agent 产出质量不达标 | 中 | 高 | 1) 代码 Review 机制<br>2) 文档先行，降低交接成本<br>3) 每周 Demo 验收 |

---

## 11. 沟通机制

| 频率 | 活动 | 参与者 |
|------|------|--------|
| 每日 | 进度同步 (Async) | All Agents |
| 每周 | Sprint Review + Demo | All Agents + PM |
| 按需 | 技术评审 (Design Review) | 相关 Agents |
| 按需 | 风险升级 | PM + 相关 Agents |

---

## 12. 质量标准

| 维度 | 标准 |
|------|------|
| 代码覆盖 | 单元测试 ≥ 80%, 核心模块 ≥ 90% |
| API 响应 | P95 < 200ms, P99 < 500ms |
| 前端性能 | LCP < 2.5s, FID < 100ms, CLS < 0.1 |
| 安全 | OWASP Top 10 全部覆盖 |
| 可用性 | SLA ≥ 99.5% |
| 浏览器引擎 | 单实例内存 < 500MB, 并发 ≥ 10 |

---

## 13. 成功标准 (Definition of Done)

每个任务完成需满足：

1. ✅ 代码通过 ESLint + Prettier 检查
2. ✅ 单元测试通过且覆盖率达标
3. ✅ API 接口文档已更新 (Swagger)
4. ✅ 代码通过 Code Review
5. ✅ 在开发环境验证通过
6. ✅ 相关文档已更新

---

*文档维护: PM Agent | 最后更新: 2026-05-06*
