# 披星云 · 伴侣监控中心（设计稿）

> 状态：待确认设计 → 确认后实施（随 3.2.101 一起打包部署）

## 0. 隐私边界（硬性约束）

- 只上报披星云伴侣**自身**的运行状态与业务任务状态
- 不采集：用户其他软件、进程列表、浏览记录、网页内容、屏幕内容
- 不提供任何“远程关闭/结束进程/卸载软件”能力；后台只有查看与告警确认
- 资源占用只读取**本进程**（pid = 自己的 PID）的 CPU/内存，不扫描系统

## 1. 数据结构（Prisma 新增 3 个模型）

### CompanionDevice（设备主表，每台伴侣一条）

| 字段 | 类型 | 说明 |
|---|---|---|
| deviceId | String @unique | 伴侣首次安装生成 UUID，更新不丢，存于本地配置 |
| deviceName | String | 设备名（默认电脑名，可编辑） |
| ownerUserId / ownerName | String? | 当前登录用户（心跳带上） |
| organizationId | String? | 租户隔离 |
| companionVersion | String | 伴侣版本 |
| startedAt | DateTime? | 本次进程启动时间 |
| firstSeenAt / lastSeenAt | DateTime | 首次/最近一次上报 |
| lastHeartbeatAt | DateTime? | 心跳时间（离线判定的唯一依据） |
| currentTask / currentTaskDetail | String? / Json? | idle·collecting·syncing·uploading·queued·updating·error + platform/account/store 明细 |
| platformSummary | Json? | 三平台状态快照 |
| lastCollection* | DateTime?/Boolean?/Int? | 最近采集：结束时间/成功/账号数 |
| lastSync* | DateTime?/Boolean?/Int?/String? | 最近同步：成功/上传数/错误码 |
| lastError* | String?/DateTime? | 最近异常：errorCode/信息/时间 |
| updateStatus | Json? | 更新状态 |
| cpuPercent / memoryMb / processUptimeSeconds | Float?/Float?/Int? | 自身进程资源 |
| consecutiveSyncFailures | Int @default(0) | 连续同步失败计数（告警用） |
| recentHttpErrors | Json? | 近窗口 403/404/500 计数（告警用） |
| healthStatus | String | online / unstable / offline（服务端定时刷新） |

### CompanionHeartbeat（历史表）

deviceId + receivedAt + 当次心跳快照（taskStatus/platformSummary/lastCollection/lastSync/lastError/update/资源/登录人）。
**写入策略**（控制数据量）：状态变化时写、或距上条历史 ≥5 分钟写、关键事件（采集完成/同步失败/更新结果/错误）必写；每日清理 >30 天。

### CompanionAlert（告警事件表）

deviceId + type + message + status(open/acknowledged) + createdAt；每日清理 >30 天。

## 2. Heartbeat 接口（伴侣 → 云端）

POST /api/v1/companion-monitor/heartbeat（JWT 登录态，复用现有鉴权；每 45 秒一次，30–60s 区间中值）

请求体（JSON）：

    {
      "deviceId": "uuid",
      "deviceName": "EDY-PC",
      "companionVersion": "3.2.101",
      "startedAt": "2026-08-26T09:00:00+08:00",
      "taskStatus": "collecting",
      "taskDetail": {"platform": "DOUYIN", "accountId": "...", "accountName": "卢慧家庭教育", "storeId": "", "storeName": ""},
      "platformStatus": {
        "douyin":       {"state": "ok", "accountCount": 6, "expiredCount": 0},
        "wechat_video": {"state": "ok", "accountCount": 6, "expiredCount": 1},
        "doudian":      {"state": "ok", "accountCount": 2, "expiredCount": 0}
      },
      "lastCollection": {"startedAt": "…", "endedAt": "…", "success": true, "accountCount": 3},
      "lastSync":       {"success": true, "uploadCount": 120, "errorCode": ""},
      "lastError":      {"errorCode": "", "message": "", "at": ""},
      "update":         {"current": "3.2.101", "latest": "3.2.101", "needUpdate": false, "state": "idle"},
      "taskStartedAt": "2026-08-26T11:00:00+08:00",
      "recentHttpErrors": {"windowMinutes": 60, "count403": 0, "count404": 0, "count500": 0},
      "resources": {"cpuPercent": 2.5, "memoryMb": 180, "processUptimeSeconds": 3600}
    }

- 平台状态枚举：ok 登录正常 / expired 登录失效 / unbound 未绑定 / error 采集异常
- 更新状态枚举：idle / checking / downloading / installing / success / failed
- 响应顺带下发 latestVersion 与 serverTime
- **容错约定**：伴侣网络失败静默重试（下次心跳补上）；服务端绝不因“某次心跳没到”直接判离线——只按 lastHeartbeatAt 时间差判定（见 §3）

## 3. 离线判定（统一口径）

| 距上次心跳 | 状态 | 颜色 |
|---|---|---|
| 0 ~ 2 分钟 | 在线 | 绿 |
| 2 ~ 5 分钟 | 连接不稳定 | 黄 |
| > 5 分钟 | 离线 | 红 |

- 服务端每分钟定时任务刷新 healthStatus（用于列表与告警）
- 单次网络失败不影响判定（45s 一次心跳，容忍 2 分钟窗口）

## 4. 告警规则（服务端定时任务，每分钟评估）

| 规则 | 触发条件 |
|---|---|
| 连续 3 次同步失败 | consecutiveSyncFailures ≥ 3（success 时清零） |
| 超过 24 小时未上线 | lastHeartbeatAt 距今 > 24h（一次，已 open 不重复） |
| 心跳超时 | > 5 分钟无心跳 → healthStatus=offline + 告警 |
| 任务运行时间异常 | collecting > 30 分钟 / syncing > 20 分钟 / updating > 30 分钟（按 taskStartedAt） |
| 自动更新失败 | update.state = failed |
| 版本过旧 | companionVersion < latestVersion（latest 发布 > 24h） |
| 403/404/500 异常增加 | recentHttpErrors 窗口内任一计数 ≥ 10，或 5 分钟窗口 ≥ 3 |
| 大量登录态失效 | 组织内 expiredCount 合计 / accountCount 合计 > 50% |

告警列表：未确认置顶、可确认（ack）；同类型同设备去重（open 期间不重复建）。

## 5. 后台页面（网站超管 → 伴侣监控）

- 权限：SUPER_ADMIN / OWNER / ADMIN（组织隔离）
- **顶部健康度卡**：正常设备 / 异常设备 / 离线设备 / 版本过旧 + 今日采集成功率 / 今日同步成功率 / 抖店同步成功率 / 视频号采集成功率
- **列表列**：设备 · 使用人 · 版本 · 在线状态（三色点）· 当前任务 · 平台状态（抖音/视频号/抖店三枚小标签：ok绿/expired红/unbound灰/error橙）· 最后采集 · 最后同步 · 最近异常 · 最后心跳
- **筛选**：全部 / 在线 / 离线 / 异常 / 版本过旧 / 正在采集 / 正在同步
- **设备抽屉**：详情字段 + 时间线（7/30 天切换）：上线 / 采集 / 失败 / 更新 / 错误次数（来自 Heartbeat 历史 + Alert）
- **告警面板**：未确认告警列表 + 确认操作
- 自动刷新 30 秒

## 6. 伴侣侧（companion_heartbeat.py）

- deviceId：首次生成存 companion_config.json，更新包不携带配置 → 天然不丢
- 心跳线程：45s 间隔；token 401 时刷新重试一次；其余网络失败静默
- 状态组装来源（只读）：
  - taskStatus/taskDetail：companion_state._doudian_active_task / _collector_progress / scan_status / updater 状态
  - platformStatus：本地 accounts（cookie/login_state）+ doudian stores（login_state）
  - lastCollection：local_db.collection_runs 最近一条
  - lastSync：doudian stores last_synced_at + 上报统计
  - update：companion_updater._get_update_status()
  - resources：psutil 只读 Process(os.getpid()) 的 cpu_percent / memory_info().rss —— 不枚举任何其他进程
- 明确不做：屏幕截图、进程枚举、键盘/网络嗅探、远程控制指令

## 7. 实施顺序（确认设计后）

1. Prisma 模型 + migration（3 模型 + 索引）
2. 后端 companion-monitor 模块：heartbeat 接收/upsert、设备列表/历史/概览/告警接口、每分钟评估+清理定时任务、单测
3. 伴侣 companion_heartbeat.py + companion_app 启动心跳线程
4. 前端 AdminView「伴侣监控」页（列表/筛选/抽屉/告警/健康度）
5. 联调验证（本地模拟多设备心跳 → 状态/告警/历史全链路）
6. 与噪声词修复、finder 复用等一起打包发布 3.2.101 + 后端部署
