# MatrixFlow ERP - 技术选型文档

## 项目概述

MatrixFlow ERP 是一个企业级 SaaS 矩阵账号管理平台，核心功能包括多平台账号管理、数据统计分析和团队协作。目标用户为 5-20 人的运营团队。

---

## 技术架构总览

```
┌──────────────────────────────────────────────────────────────┐
│                        Nginx (反向代理)                       │
├──────────────────┬───────────────────────────────────────────┤
│   前端 (Vue 3)   │            后端 API (NestJS)              │
│   :5173 / :80    │               :3000                       │
├──────────────────┴───────────────────────────────────────────┤
│                    共享基础设施                                │
│   PostgreSQL (主存储)  │  Redis (缓存/队列)  │  MinIO (文件)   │
└──────────────────────────────────────────────────────────────┘
```

---

## 一、前端技术栈

| 技术 | 版本 | 选型理由 |
|------|------|----------|
| **Vue 3** | ^3.4 | Composition API 提供更好的逻辑复用，适合构建复杂业务组件；响应式系统性能优异；团队生态成熟 |
| **TypeScript** | ^5.4 | 类型安全减少运行时错误，提升大型项目可维护性；IDE 智能提示提升开发效率 |
| **Vite** | ^5.2 | 比 Webpack 快 10-100 倍的 HMR；原生 ESM 支持；构建速度极快 |
| **Element Plus** | ^2.7 | 最成熟的 Vue 3 组件库；中文文档完善；覆盖表格/表单/弹窗等企业级场景 |
| **Pinia** | ^2.1 | Vue 官方状态管理；TypeScript 支持优秀；比 Vuex 更轻量简洁 |
| **Vue Router** | ^4.3 | Vue 官方路由；支持动态路由、路由守卫、懒加载 |
| **Axios** | ^1.7 | 拦截器机制完善（统一错误处理/Token刷新）；请求/响应转换灵活 |
| **ECharts** | ^5.5 | 最强大的开源可视化库；丰富的图表类型满足数据统计需求 |
| **VueUse** | ^10.9 | 提供 200+ 响应式工具函数，减少重复代码 |
| **Tailwind CSS** | ^3.4 | 实用优先的 CSS 框架，快速构建自定义 UI，与 Element Plus 互补 |

### 构建优化策略

- **代码分割**: Element Plus、ECharts、核心 vendor 独立 chunk
- **Gzip 压缩**: vite-plugin-compression 自动压缩静态资源
- **组件按需加载**: unplugin-vue-components + ElementPlusResolver
- **API 自动导入**: unplugin-auto-import 减少样板代码

---

## 二、后端技术栈

| 技术 | 版本 | 选型理由 |
|------|------|----------|
| **NestJS** | ^10.3 | 企业级 Node.js 框架；装饰器 + 依赖注入架构清晰；TypeScript 原生支持；模块化设计适合大型项目 |
| **Prisma** | ^5.14 | 最现代的 TypeScript ORM；声明式 schema 定义；自动迁移；类型安全的查询 API |
| **PostgreSQL** | 16 | 最强大的开源关系型数据库；JSON 支持（存储平台元数据）；全文搜索；高并发性能 |
| **Redis** | 7 | 缓存热数据（账号信息、统计数据）；会话存储；发布/订阅用于实时通知 |
| **JWT** | - | 无状态认证，适合分布式部署；Access Token + Refresh Token 双 Token 机制 |
| **Swagger** | - | 自动生成 API 文档；在线调试；前后端协作效率提升 |
| **Winston** | - | 灵活的日志框架；多传输目标（控制台/文件/远程）；结构化日志 |

### 认证架构

```
登录 → 验证凭据 → 签发 JWT (Access + Refresh)
    ↓
请求携带 Bearer Token → Guard 验证 → 注入用户上下文
    ↓
Access Token 过期 → 用 Refresh Token 静默刷新
```

---

## 三、DevOps 工具链

| 工具 | 用途 |
|------|------|
| **Docker** | 容器化部署，环境一致性保障 |
| **docker-compose** | 本地开发一键启动全栈服务 |
| **ESLint** | 代码规范检查 |
| **Prettier** | 代码格式化统一 |
| **Husky** | Git Hooks，提交前自动 lint + commit 规范检查 |
| **lint-staged** | 只检查暂存文件，加速 lint |
| **commitlint** | 规范 commit message（Conventional Commits） |

---

## 四、Monorepo 工作区

采用 npm workspaces 管理多包项目：

```
matrixflow-erp/
├── frontend/          # Vue 3 前端
├── backend/           # NestJS 后端
├── packages/          # 共享包（类型定义、工具函数）
└── docs/              # 项目文档
```

**优势**：
- 跨包类型共享（TypeScript 项目引用）
- 统一依赖管理，避免版本冲突
- 一条命令启动全栈开发环境

---

## 五、数据模型设计要点

- **多租户**: Organization → Team → Account 三级结构
- **平台抽象**: Platform 枚举统一管理多平台账号
- **统计分离**: PostStats（单篇）与 DailyStats（日报）分开，查询高效
- **审计追踪**: AuditLog 记录关键操作，满足企业安全审计需求
- **软删除**: 通过 status 字段实现，不物理删除数据

---

## 六、后续演进方向

1. **消息队列**: 引入 BullMQ 替代直接 Redis 操作，支持任务重试和延迟执行
2. **微服务拆分**: 当单体瓶颈出现时，按领域拆分服务
3. **Kubernetes**: Docker Compose → K8s 编排，支持自动扩缩容
4. **CI/CD**: GitHub Actions 自动化测试、构建、部署流水线
5. **监控**: Prometheus + Grafana 可视化系统指标
6. **AI 能力**: 接入 LLM 生成文案、智能排期、数据分析洞察
