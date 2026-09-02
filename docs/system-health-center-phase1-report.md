# 披星云系统健康中心 Phase 1 验收报告

更新时间：2026-09-01

## 1. 当前能力地图

- 伴侣监控：已有设备、心跳、告警、事件、故障生命周期。
- 后端健康：已有 `/health` 数据库与内存检查。
- 后端日志：已有 HTTP 结构化日志、耗时、用户、traceId。
- 前端监控：原来只有 `console.error`，缺少统一上报。
- 数据库监控：原来仅健康检查，缺少 Prisma 异常事件沉淀。
- 发布监控：暂未建 ReleaseEvent，只保留为后续阶段。

## 2. 可复用伴侣模块

- 复用 `CompanionDevice`、`CompanionHeartbeat`、`CompanionAlert`、`CompanionEvent`、`CompanionIncident`。
- 保留 `/api/v1/companion-monitor/heartbeat` 响应结构，旧版伴侣无需同步升级。
- 告警确认增加 `acknowledgedAt`、`acknowledgedBy`，但不改变故障恢复状态。

## 3. 网站监控缺口

- JS Error、Vue Error、Unhandled Promise、Resource Error、API Error 已在 Phase 1 接入。
- 白屏、Web Vitals、Chunk Load 细分、采样策略暂留 Phase 2。

## 4. Backend 监控缺口

- Phase 1 记录 4xx/5xx、慢接口、Prisma 相关错误来源。
- P50/P95/P99、队列、定时任务细分暂留 Phase 2。

## 5. Database 监控缺口

- Phase 1 保留 `SELECT 1` 健康检查与 Prisma 错误归类。
- 慢查询、连接池、死锁、数据质量规则暂留 Phase 2。

## 6. Event 设计

- 新增 `SystemEvent`，统一来源：FRONTEND、BACKEND、DATABASE、COMPANION、BUSINESS、RELEASE。
- 字段包含 requestId、organizationId、userId、deviceId、accountId、storeId、版本号、错误码、级别、元数据。

## 7. Incident 设计

- 新增 `SystemIncident`，状态固定为 OPEN、RECOVERING、RESOLVED。
- `acknowledgedAt/acknowledgedBy` 只表示“我看过了”，不代表恢复。
- 通过 `dedupeKey` 聚合同类故障，避免同一问题刷屏。

## 8. ErrorCode 体系

- 前端错误按事件类型和堆栈指纹生成错误码。
- API 错误按 `API_状态码` 归类。
- 后端 HTTP/Prisma 错误保留异常名或固定业务码。

## 9. RequestId 设计

- 前端每个 Axios 请求生成 `X-Request-Id` 和 `X-Trace-Id`。
- 后端优先沿用前端 requestId，否则生成 UUID。
- 响应头暴露 `X-Request-Id`、`X-Trace-Id`，错误 body 也返回 requestId。

## 10. 首页设计

- 入口：系统 → 系统健康中心。
- 首屏展示总体状态：HEALTHY、DEGRADED、INCIDENT、CRITICAL。
- 卡片展示前端、后端、数据库、伴侣、业务、发布六层状态。

## 11. 故障中心设计

- 展示统一故障列表、级别、来源、标题、摘要、发生次数、确认状态。
- 支持“我看过了”，不自动关闭故障。

## 12. Companion 升级计划

- Phase 1 不发布新版伴侣，仅服务端兼容接收旧心跳。
- Phase 2 再补 bootId、heartbeatSequence、StartupDiagnostic、uiMode 的完整页面分析。

## 13. Release 监控计划

- 后续增加 ReleaseEvent，记录组件、版本、commit、部署人、部署时间。
- 接入灰度、回滚、发布后错误率对比。

## 14. Bug 资产库计划

- 后续把 resolved incident 沉淀为 BugRecord。
- 记录根因、修复方案、复发次数、影响版本。

## 15. 测试计划

- 已执行：后端 build、前端 typecheck/build、Prisma validate、伴侣 Python compile。
- 待有临时数据库时执行：`prisma migrate deploy` 实库迁移演练。

## 16. 数据保留

- Phase 1 未加清理任务，避免误删。
- 建议后续：Event 90 天、Incident 180 天、Metric 30 天、高频指标 7 天。

## 17. 性能开销

- 前端上报使用裸 `fetch keepalive`，不走 Axios，避免递归。
- 后端事件写入为非阻塞安全调用，失败只写 warn，不影响业务接口。

## 18. 隐私边界

- 不上传密码、token、cookie、secret、Authorization。
- URL 仅保留 path，不上传 query。
- 堆栈只保留前 4 行摘要。

## 19. Migration 计划

- 本次 migration 是 expand-only：新增两张表、给告警加两个可空字段。
- 无 NOT NULL 无默认值；已有账号、组织、伴侣历史数据不会被强制回填。
- SQL 使用 `IF NOT EXISTS`，降低半截执行后的重跑风险。

## 20. 分阶段实施

- Phase 1：统一入口、SystemEvent/SystemIncident、RequestId、前端/API/后端基础事件、伴侣汇总。
- Phase 2：性能指标、白屏、DB 慢查询、伴侣启动诊断详情。
- Phase 3：发布监控、Bug 资产库、业务数据质量规则。

## Failure Mode Review

- 旧伴侣不调用新接口：不影响，旧 heartbeat 保持原路径与宽松 payload。
- 监控接口失败：前端静默失败，后端记录失败不影响业务响应。
- 告警确认误当恢复：已拆分，ack 字段独立，incident status 不变。
- 租户误看告警：ack/list 继续按 organizationId 过滤，SUPER_ADMIN 例外。
- requestId CORS 失败：已放开 allowed/exposed headers。
- 本地历史数据污染服务器：本次不涉及 localStorage 迁移。

## 二次复核修复

- 发现：伴侣故障只留在 `CompanionIncident`，没有进入统一待处理列表。
- 修复：系统健康中心读取概览/故障时同步伴侣 open/recovering 故障到 `SystemIncident`。
- 发现：路由菜单标题曾被写成问号，属于真实文件内容损坏，不是终端乱码。
- 修复：已恢复为“系统健康中心”，并复查无 `????` 残留。
- 发现：前端业务失败曾把业务 `code` 当 HTTP 状态码上报。
- 修复：现在 HTTP `statusCode` 和业务 `businessCode` 分开。
