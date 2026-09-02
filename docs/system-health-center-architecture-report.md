# 披星云系统健康中心 · 统一架构审计与设计报告

> 版本：v1.0 · 本轮审计
> 范围：将【披星云伴侣监控中心】与规划中的【网站稳定性监控】统一升级为【披星云系统健康中心】。
> 原则：不推倒现有伴侣监控；监控必须是旁路（Monitoring Failure ≠ Business Failure）；先审计后实施，Phase 1 已完成并验证。
> 证据基准：本报告所有“已有/缺失”结论均来自对仓库代码的直接审计（backend/src、frontend/src、backend/prisma、desktop-companion、scripts）。

## 1. 当前系统健康能力地图

| 能力 | 现状 | 位置（证据） |
|---|---|---|
| 伴侣设备监控 | ✅ 已上线 | CompanionDevice（schema L833）、45s 心跳 POST /api/v1/companion-monitor/heartbeat |
| 伴侣心跳历史 | ✅ 已上线 | CompanionHeartbeat（schema L884），状态变化/关键事件写入策略 |
| 伴侣告警 | ✅ 已上线 | CompanionAlert（schema L909）：open/acknowledged + 7 类规则 |
| 伴侣事件/故障 | ✅ 已上线 | CompanionEvent/CompanionIncident（schema L928/L941），open→recovering→resolved |
| 伴侣 Phase 2 字段 | ✅ 表已就绪 | bootId/bootSeq/exitState/uiMode/startupDiagnostic/lastProgressAt（schema L866-873），等待伴侣端上报 |
| 统一事件 | ✅ Phase 1 已建 | SystemEvent（schema L965）+ 迁移 202608310001 |
| 统一故障 | ✅ Phase 1 已建 | SystemIncident（schema L1000）+ dedupeKey 聚合 |
| requestId 全链路 | ✅ 已贯通 | 前端 Axios 生成（request.ts L104-108）→ 后端中间件继承（main.ts L92-104）→ 日志/事件/响应头 |
| 前端错误采集 | ✅ 已接入 | frontend-monitor.ts：JS/Vue/UnhandledRejection/Resource/API Error，30s 去重，fetch keepalive |
| 后端错误采集 | ✅ 已接入 | LoggingInterceptor → recordBackendHttpEventSafely（4xx/5xx/慢接口，非阻塞） |
| 系统健康总览 | ✅ 已上线 | GET /api/v1/system-health/overview + SystemHealthCenterView 首屏 |
| 故障中心 | ✅ 已上线 | GET /system-health/incidents + “我看过了”确认（不改状态） |
| 统一入口 | ✅ 已上线 | 路由 /system-health（系统→系统健康中心），/companion-monitor 重定向并入 |
| 数据库健康检查 | ✅ 已有 | /health（SELECT 1 + 内存，生产只返回 status） |
| 结构化日志 | ✅ 已有 | JsonLogger + LoggingInterceptor（耗时/用户/traceId/伴侣版本） |
| 慢接口记录 | ✅ Phase 1 已有 | ≥1s 记 WARNING 事件；≥3s 标记 HTTP_SLOW |
| E2E/集成/单测 | ✅ 已有体系 | backend/test（e2e+integration+security+unit 共 40+ 文件）；frontend vitest 单测 |
| ReleaseEvent/发布监控 | ❌ 未建 | 表未建，Phase 3 |
| 版本健康对比 | ⚠️ 部分 | 事件已带 frontendVersion/backendVersion/companionVersion；对比页面未做 |
| 数据质量规则 | ❌ 未建 | 业务卡片返回 UNKNOWN，Phase 4 |
| Staging 环境 | ❌ 无 | 现为开发直连+生产（ddddkiii.com），Phase 3 |
| 自动 Rollback | ❌ 无 | 有历史 backend-release-*.tar.gz 备份可人工回退，无一键流程 |
| Feature Flag | ❌ 无 | Phase 3 |
| Bug 资产库 | ❌ 无 | Phase 4 |

## 2. 已有伴侣监控可复用部分（全部保留，不重写）

1. **数据模型**：CompanionDevice / CompanionHeartbeat / CompanionAlert / CompanionEvent / CompanionIncident 全部保留不动。
2. **心跳协议**：45 秒心跳、宽松 payload 接收（controller 用 @Body() payload: any，旧伴侣不升级也能继续上报）——兼容性保证。
3. **离线判定口径**：0-2min 在线 / 2-5min 不稳定 / >5min 离线，服务端每分钟刷新 healthStatus。
4. **告警规则**：同步失败×3、24h 未上线、心跳超时、任务超时、更新失败、版本过旧、HTTP 异常增多、登录态失效>50% —— 全部保留。
5. **前端页面**：CompanionMonitorView.vue（428 行）原样嵌入健康中心“伴侣监控”Tab，旧页面 URL 重定向到新中心。
6. **告警确认流**：CompanionAlert.acknowledge 保留；新增 acknowledgedAt/acknowledgedBy 两个可空字段（expand-only 迁移），“我看过了”≠“故障恢复”。
7. **测试**：companion-monitor.service.spec.ts 覆盖 Phase 1+2 行为，继续有效。

升级路径（不破坏）：CompanionAlert/CompanionIncident 通过 syncCompanionIncidents 读时同步进 SystemIncident（sourceType=COMPANION），逐步把“伴侣告警”并入统一故障中心，最终由 SystemEvent/SystemIncident 承载。

## 3. 网站缺失监控（前端）

已接入（Phase 1）：
- JS Error、Vue Error（app.config.errorHandler）、Unhandled Promise Rejection、Resource Load Error、API Error（4xx/5xx/网络失败/业务码失败）。
- 记录 route/userId(服务端补)/frontendVersion/browser(userAgent)/errorCode/message/stackTop(4行)/requestId/occurredAt。
- 30 秒客户端去重 + 服务端 dedupeKey 聚合。

仍缺失（Phase 2）：
- Chunk Load Error 细分（目前并入 JS_ERROR，靠堆栈指纹区分）。
- 白屏风险检测（根节点无渲染兜底上报）。
- Web Vitals（LCP/FID/CLS）。
- 采样策略（当前全量，依赖客户端去重节流）。

## 4. Backend 缺失监控

已接入（Phase 1）：HTTP 4xx/5xx、慢接口（≥1s）、Unhandled Exception（errorName 透传）、Prisma 错误归类为 DATABASE 来源。均带 requestId/route/method/statusCode/duration/user/organizationId/版本。

仍缺失（Phase 2/3）：
- P50/P95/P99 分位数与“今日最慢接口 Top10”（当前只有单条事件，无聚合统计 API）。
- 队列失败、定时任务失败、第三方 API 错误的结构化归类（当前落入 HTTP 事件）。
- 不同 API 的自定义阈值表（当前统一 1s/3s）。

## 5. Database 缺失监控

已有：/health SELECT 1、Prisma 异常自动记 DATABASE 事件（errorName 以 Prisma 开头即归 DATABASE）。

仍缺失（Phase 2）：
- 唯一约束/死锁/连接池/查询超时细分识别（需 Prisma 异常 code 映射，如 P2002/P2034）。
- 慢查询记录（Prisma query logging 旁路；敏感 SQL 只存模型+耗时+requestId，不把完整 SQL 发给前端）。
- DATA_QUALITY 数据质量规则（订单口径、粉丝归零、昵称=最近视频、串店、重复订单等，Phase 4）。

## 6. Event 设计（SystemEvent）

字段（已实现，schema L965）：sourceType(FRONTEND/BACKEND/DATABASE/COMPANION/BUSINESS/RELEASE)、sourceId、organizationId、userId、deviceId、bootId、requestId、taskId、accountId、storeId、platform、frontendVersion、backendVersion、companionVersion、eventType、severity(INFO/WARNING/ERROR/CRITICAL)、errorCode、message、occurredAt、metadata(Json)。

写入路径：
- FRONTEND：POST /system-health/frontend-events（JWT 鉴权、body 清洗、脱敏）。
- BACKEND/DATABASE：LoggingInterceptor 对每个 ≥400 或 ≥1s 请求异步写一条（失败只 warn）。
- COMPANION：暂由 CompanionEvent 承载，Phase 2 由心跳升级直接写 SystemEvent（bootId/seq/uiMode）。

索引：sourceType/eventType/severity/errorCode/organizationId/requestId/deviceId/accountId/storeId + occurredAt。

## 7. Incident 设计（SystemIncident）

字段（已实现）：incidentId、sourceType、scope、errorCode、severity、status(OPEN/RECOVERING/RESOLVED)、firstOccurredAt、lastOccurredAt、recoveryStartedAt、resolvedAt、occurrenceCount、affectedUsers/Devices/Accounts/Stores、affectedVersions、title、summary、rootCause、resolution、acknowledgedAt/By、dedupeKey、metadata。

聚合规则（dedupeKey）：
- 前端：FRONTEND|errorCode|route|frontendVersion|stackFingerprint
- 后端：sourceType|METHOD route指纹|errorCode
- 伴侣：COMPANION|organizationId|deviceId|type

生命周期：
- 发生 → OPEN（重复发生只 +occurrenceCount、刷新 lastOccurredAt，并把 RECOVERING 重置回 OPEN；严重度只升不降——CRITICAL 不会因后续 ERROR 事件被降级）。
- 静默 ≥10 分钟 → RECOVERING（每分钟巡检 sweepIncidentRecovery，阈值可用 INCIDENT_RECOVER_AFTER_MINUTES / INCIDENT_RESOLVE_AFTER_MINUTES 配置）。
- 恢复窗口内无新发生 → RESOLVED（记录 resolvedAt；MTTR = resolvedAt - firstOccurredAt）。
- 前端上报的 occurredAt 会被钳制（早于 7 天或晚于现在 5 分钟的时间戳一律回落服务器时间），防止脏时间戳扰乱时间线与巡检。
- COMPANION 故障状态由 CompanionIncident 同步，巡检不覆盖，避免两边状态打架。
- 管理员“我看过了”只写 acknowledgedAt/By，绝不改 status。

## 8. ErrorCode 体系

- 目标格式 PX-模块-编号。Phase 1 采用过渡方案（稳定、可迁移）：
  - 前端：JS_ERROR_<堆栈指纹前8位>、API_<HTTP状态码>、RESOURCE_<标签>。
  - 后端：BACKEND_HTTP_<状态码>；Prisma 用异常类名。
  - 伴侣：沿用告警类型常量（SYNC_FAIL_3X 等）。
- Phase 3 发布官方映射表：PX-FE-xxx / PX-API-xxx / PX-DB-xxx / PX-AUTH-xxx / PX-ACCOUNT-xxx / PX-STORE-xxx / PX-ORDER-xxx / PX-COLLECT-xxx / PX-SYNC-xxx / PX-COMPANION-xxx / PX-UI-xxx / PX-UPDATE-xxx / PX-DATA-xxx。errorCode 稳定、message 可变，旧码通过映射表兼容读取。

## 9. RequestId 设计（已实现）

- 前端每个 Axios 请求生成 UUID（createRequestId），写入 X-Request-Id / X-Trace-Id 头。
- 后端 main.ts 中间件：优先继承请求头中的 requestId（长度≤128 才接受，防注入），否则生成 UUID；同时写响应头 X-Request-Id / X-Trace-Id。
- CORS 已放行这两个头（allowedHeaders/exposedHeaders）。
- 落点：JsonLogger 日志、SystemEvent.requestId、错误响应体——支持“用户 14:32 订单页报错 → 用 requestId 串起 Frontend→GET /orders→OrderService→Prisma 全链路”。
- 前端监控上报自身也是带 X-Request-Id 的请求。

## 10. 总览页面设计（已上线）

入口：系统 → 系统健康中心（/system-health，SUPER_ADMIN/OWNER/ADMIN）。
首屏：
- 总体状态大字卡：HEALTHY/DEGRADED/INCIDENT/CRITICAL。判定基于“当前未恢复故障”而非 24h 粘性计数：P0(CRITICAL) 或 DB 异常→CRITICAL；P1(ERROR)→INCIDENT；其余未解决故障/前端错误/慢接口/伴侣异常/离线→DEGRADED；否则 HEALTHY。已恢复的问题不会继续压住总体状态。
- 六层卡片：前端/后端/数据库/伴侣/业务/发布（各带 24h 错误数、慢接口数、DB 延迟、离线/异常伴侣数）。
- 【需要我处理】表格：P0/P1 计数徽标 + 未解决故障 Top8（级别/来源/标题/摘要/次数/最近发生）。
- Tab：故障中心 / 事件流 / 伴侣监控。

规划中的补充（Phase 2）：顶部“今日指标条”（前端错误/API500/慢接口/DB错误/伴侣异常/离线伴侣/失败采集/失败同步/未解决/P0/P1/今日恢复）、错误 Top10、新出现问题模块。

## 11. 故障中心设计（已上线）

- 统一列表（来源/级别/状态/标题/摘要/确认按钮），支持 status/sourceType/severity 过滤。
- “我看过了”按钮 → POST /system-health/incidents/:id/acknowledge → 仅写 acknowledgedAt/By。
- 状态与确认分离展示：故障 RESOLVED 与管理员 ACKNOWLEDGED 是两个维度。
- 事件流 Tab 展示最近事件（含 requestId 列）。
- 规划中的详情页（Phase 2）：时间线（首次异常→再次×12→影响扩大→升级→恢复开始→恢复完成）、影响用户/设备/账号/店铺统计。

## 12. Companion 升级方案

- Phase 1（已完成）：服务端零破坏兼容；CompanionAlert 加确认字段；CompanionIncident 同步进 SystemIncident。
- Phase 2（伴侣端，随下一版伴侣发布）：
  1. 心跳新增 bootId、heartbeatSequence、uiMode（NATIVE_WEBVIEW/BROWSER_FALLBACK/BROWSER_EXISTING_INSTANCE/HEADLESS/UNKNOWN）、lastProgressAt、startupDiagnostic（APP_STARTED→LOCAL_SERVER_READY→WEBVIEW_START→WEBVIEW_RENDER→READY / WEBVIEW_FAILED→BROWSER_FALLBACK）。
  2. Crash 检测：bootId + APP_STOPPED 优雅退出信标；下次启动发现上次无信标 → APP_CRASH_DETECTED（区分自动更新/Windows 关机/正常退出）。
  3. STUCK 检测：lastProgressAt 无进展判定（LONG_RUNNING vs STUCK），替换“只看任务时长”。
  4. 服务端 schema 字段已就绪（schema L866-873），零迁移即可接收。

## 13. Release 监控方案（Phase 3）

- 新增 ReleaseEvent（releaseId/component(FRONTEND|BACKEND|COMPANION)/version/commit/deployedAt/deployedBy）。
- 部署脚本在发布时写入；Deployment Health Check 自动跑：首页/登录/核心API/数据库/矩阵页/订单页/绩效榜/伴侣监控，失败→DEGRADED/FAILED。
- 发布前后 30 分钟错误率对比 → 自动提示“疑似 vX 回归”。
- 发布门禁：Type Check + Unit + Integration + E2E + Encoding + Migration Check + Build + Smoke；P0/P1 测试失败禁止发布。
- Staging：Development→Staging→Production；保留上一稳定版本 tar.gz（现有 backend-release-*.tar.gz 惯例）+ 一键 rollback 脚本。

## 14. Bug 资产库方案（Phase 4）

- BugRegistry：bugId(BUG-YYYY-NNN)/title/severity/module/rootCause/trigger/fixedVersion/regressionTestId/firstSeenAt/fixedAt。
- 沉淀来源：人工录入 + RESOLVED Incident 一键沉淀。
- 历史 Bug 必须转 Regression Test（昵称=最近视频、头像消失、串店、订单口径、重复Toast、Teacher not found、Loading 404、伴侣403、自动更新失败、VBS 无效字符、Browser Fallback、误伤其他软件、乱码、日周月统计）。
- 同一 Bug 只人工登记一次，复发由 fingerprint 自动关联 incident。

## 15. 测试方案

现有资产：
- 后端：e2e（app/auth/publish）、integration（accounts/auth/content/teams）、security（auth-bypass/authorization/csrf/rate-limit/sql-injection/xss）、unit（companion-monitor、health 等 25+）、performance（concurrent-publish/load/stress）。
- 前端：vitest 单测（http/jwt/requestGuard/metrics 等 10 个文件）。
- 本轮新增：backend/test/unit/system-health.service.spec.ts（分级、去重聚合、脱敏、恢复巡检、确认分离，11 个用例全部通过）。

Phase 1 场景模拟（spec 52 映射）：
- 前端 JS Error / Promise / Chunk 失败 → reportFrontendError 单测+手工触发。
- API 500/慢 → recordBackendHttpEvent 单测覆盖。
- 同 Error 1000 次 → occurrenceCount 聚合断言。
- 多用户同时 Error → affectedUsers 统计（Phase 2 补断言）。
- 伴侣断线/恢复/Crash/Browser Fallback/采集失败/同步失败 → companion-monitor.service.spec 已覆盖。
- 平台级异常、版本错误率暴涨、Rollback 恢复 → Phase 3 场景。

## 16. 数据保留策略

| 数据 | 保留 | 现状 |
|---|---|---|
| Current State（Device 等） | 长期 | ✅ 现状 |
| Incident | 180 天 | Phase 1 未加清理（避免误删），Phase 2 加归档+清理 |
| Event | 90 天 | 同上 |
| Metric | 30 天 | Phase 2 |
| 高频 Metric | 7 天 | Phase 2 |
| 原始 Heartbeat | 继续节流 | ✅ 已有节流写入策略（状态变化/5分钟/关键事件） |

## 17. 性能开销评估

- 前端：错误上报用裸 fetch + keepalive，不走 Axios（避免拦截器递归）；30s 窗口去重；无 token 不上报。单页开销 <1KB/错误。
- 后端：LoggingInterceptor 仅对 ≥400 或 ≥1s 请求触发异步写库（fire-and-forget，失败只 warn，不阻塞响应）；每请求只多一次内存计算。
- 巡检：sweepIncidentRecovery 每分钟两条 updateMany（索引命中 status+sourceType），开销 O(受影响行)。
- 风险点：SystemEvent 写入量随错误量线性增长 → 90 天清理任务（Phase 2）上线前，生产按容量观察；必要时加前端采样率开关。

## 18. 隐私边界（硬约束）

- 前端不上传：密码/Token/Cookie/用户输入正文/聊天内容；sanitizePayload 按 key 黑名单过滤 + 字符串正则脱敏（Bearer、token=、password=、cookie=、secret=）。
- URL 只保留 path 并做 /:id 指纹化，不上传 query。
- 堆栈只留前 4 行，最多 800 字符。
- 后端 cleanText/sanitizeMetadata 双保险：入库前再次脱敏；数据库事件不存完整 SQL。
- 伴侣侧维持只监控披星云自身（不采集屏幕/键盘/聊天/浏览历史/其他软件）。

## 19. Migration 方案

- 已有迁移 202608310001_system_health_center：expand-only（两张新表 + CompanionAlert 两个可空字段 + IF NOT EXISTS），无 NOT NULL 无回填，旧数据兼容读取。
- 本轮代码改动不需要新迁移（恢复巡检、阈值、版本注入均为应用层）。
- 部署顺序：代码先上（新表已存在）→ 观察 → 伴侣端 Phase 2 升级（表字段早已预留）。
- 回滚：如 Phase 1 出问题，可只回滚应用代码，SystemEvent/SystemIncident 表保留不影响业务。

## 20. 分阶段实施方案

- **Phase 1（本轮完成）**：统一 SystemEvent/SystemIncident、requestId、Frontend Error Capture、Backend Error Capture、系统健康总览、故障中心、CompanionAlert/Incident 逐步接入、故障自动恢复巡检。
- **Phase 2**：伴侣 bootId/seq/StartupDiagnostic/uiMode/Crash/STUCK 上报与页面；前端白屏/Chunk 细分/Web Vitals/采样；API 聚合统计（P50/P95/P99/Top10）；DB 慢查询/死锁细分；事件与指标清理任务。
- **Phase 3**：ReleaseEvent/Deployment Health/发布门禁/Staging/Feature Flag/灰度/Rollback/版本健康页/版本回归自动提示/官方 PX-错误码映射表。
- **Phase 4**：DATA_QUALITY 规则、Fleet Correlation（平台级 Incident）、Bug 资产库、Daily Health Report、系统时间线。

---

## Failure Mode Review（监控自身故障不影响业务）

| # | 故障模式 | 影响分析 | 缓解措施（已实现/计划） |
|---|---|---|---|
| 1 | 前端监控上报接口挂了 | fetch().catch 静默失败，网站功能照常 | ✅ 裸 fetch 无 await 阻断；失败仅丢弃 |
| 2 | 上报接口 500/超时 | 同上；后端事件写库失败 catch warn | ✅ recordBackendHttpEventSafely fire-and-forget |
| 3 | SystemEvent 写入拖慢请求 | 写入在响应后异步执行，不阻塞业务响应 | ✅ 拦截器 tap/catchError 中非 await |
| 4 | 事件表爆量 | 影响监控查询性能 | 计划 Phase 2 保留期清理 + 采样开关 |
| 5 | 恢复巡检误判 RESOLVED | 静默窗口误判为恢复 | 阈值保守（10 分钟默认）且可配置；新错误立即重置 OPEN |
| 6 | “我看过了”误当恢复 | 管理判断失真 | ✅ ack 与 status 分离（测试锁定） |
| 7 | COMPANION 故障状态被巡检覆盖 | 与伴侣恢复逻辑冲突 | ✅ 巡检排除 COMPANION（测试锁定） |
| 8 | 旧伴侣不升级 | 监控缺失 | ✅ 心跳协议宽松兼容，老 payload 照常处理 |
| 9 | requestId 被伪造/超长 | 日志污染 | ✅ 后端长度≤128 校验，否则换新 UUID |
| 10 | 前端上报带敏感信息 | 隐私泄露 | ✅ 双层脱敏 + key 黑名单 + query 剥离 |
| 11 | 监控鉴权失败导致刷库 | 匿名写事件 | ✅ frontend-events 受全局 JwtAuthGuard 保护 |
| 12 | CORS 挡住上报 | 事件丢失 | ✅ X-Request-Id/X-Trace-Id 已放行 allowed+exposed |
| 13 | 巡检 cron 抛异常 | 定时任务崩溃 | ✅ try/catch 吞异常只记 warn |
| 14 | 事件表写入与租户隔离 | 越权看到别家故障 | ✅ 查询按 organizationId 过滤，SUPER_ADMIN 例外 |

**结论：监控链路任何一环失败，网站/API/数据库业务/伴侣采集/店铺同步均不受影响。**

---

## 最终验收问题核对（spec 53）

1. 现在健康吗？→ 总览 overallStatus（含 DB 实时探测）。
2. 哪里有问题？→ 六层卡片 + 故障中心。
3. 严重吗？→ P0/P1 徽标 + 严重度分级。
4. 从什么时候开始？→ firstOccurredAt/lastOccurredAt。
5. 影响多少人？→ occurrenceCount（affectedUsers 聚合 Phase 2）。
6. 影响哪些设备/账号/店铺？→ deviceId/accountId/storeId 字段已带，聚合展示 Phase 2。
7. 是网站/伴侣/数据还是第三方问题？→ sourceType 六分类。
8. 哪个版本引起？→ 版本字段已采集，回归对比 Phase 3。
9. 恢复了吗？→ OPEN/RECOVERING/RESOLVED + 自动恢复巡检。
10. 需要我做什么？→【需要我处理】列表 + “我看过了”。

## 本轮改动清单（Phase 1 收尾）

- backend/src/modules/system-health/system-health.service.ts：新增每分钟故障恢复巡检（OPEN→RECOVERING→RESOLVED，排除 COMPANION，env 可调阈值）；慢接口严重度对齐（≥1s WARNING）。
- backend/test/mocks/prisma.mock.ts：补 systemEvent/systemIncident mock。
- backend/test/unit/system-health.service.spec.ts：新增 17 个用例（分级/去重聚合/脱敏/巡检/确认分离/严重度只升不降/时间戳钳制/overview 真实计数）。
- frontend/vite.config.ts：注入 __APP_VERSION__（npm 包版本或显式 VITE_APP_VERSION）。
- frontend/src/env.d.ts、frontend/src/utils/frontend-monitor.ts：错误事件携带真实前端版本。

## 验证状态（本轮实测）

| 检查 | 结果 |
|---|---|
| backend nest build | ✅ 通过 |
| frontend vue-tsc typecheck | ✅ 通过 |
| prisma validate | ✅ 通过（本地 .env 缺 DATABASE_URL，用占位 URL 验证 schema 本身） |
| backend 全量单测（29 套件 / 279 用例，含 system-health 17 用例） | ✅ 全部通过 |
| frontend 全量 vitest（10 文件 / 71 用例） | ✅ 全部通过 |
| dist 产物包含恢复巡检代码 | ✅ 已验证 |

> 生产部署建议：本次为应用层小改，走现有发布流程（先 build 后按 deploy 脚本发布），不涉及数据库迁移；不做全量重构、不直接全量生产部署。