# MatrixFlow ERP - API 接口设计

## 1. API 规范

### 1.1 基础规范

- **协议**: HTTPS
- **基础路径**: `/api/v1`
- **数据格式**: JSON
- **字符编码**: UTF-8
- **时间格式**: ISO 8601 (`2026-05-06T00:00:00+08:00`)
- **分页**: 游标分页（大数据集）或偏移分页（小数据集）

### 1.2 统一响应格式

```json
// 成功响应
{
  "code": 0,
  "message": "success",
  "data": { ... },
  "timestamp": "2026-05-06T00:00:00+08:00"
}

// 分页响应
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [ ... ],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "hasMore": true
  }
}

// 错误响应
{
  "code": 40001,
  "message": "参数验证失败",
  "errors": [
    { "field": "email", "message": "邮箱格式不正确" }
  ],
  "timestamp": "2026-05-06T00:00:00+08:00"
}
```

### 1.3 错误码规范

| 错误码范围 | 含义 |
|-----------|------|
| 0 | 成功 |
| 40000-40099 | 参数错误 |
| 40100-40199 | 认证错误 |
| 40300-40399 | 权限错误 |
| 40400-40499 | 资源不存在 |
| 40900-40999 | 冲突错误 |
| 42900-42999 | 频率限制 |
| 50000-50099 | 服务器内部错误 |

### 1.4 请求头规范

| Header | 必填 | 说明 |
|--------|------|------|
| Authorization | 是 | `Bearer <access_token>` |
| Content-Type | 是 | `application/json` |
| X-Request-Id | 否 | 请求追踪ID（自动生成） |
| X-Team-Id | 否 | 团队上下文ID |
| Accept-Language | 否 | 语言偏好 |

## 2. 认证模块 API

### 2.1 用户认证

```yaml
POST /auth/register
  # 用户注册
  Body:
    email: string (required)
    password: string (required, min 8)
    name: string (required)
  Response: { user, tokens }

POST /auth/login
  # 用户登录
  Body:
    email: string
    password: string
  Response: { user, accessToken, refreshToken }

POST /auth/refresh
  # 刷新令牌
  Body:
    refreshToken: string
  Response: { accessToken, refreshToken }

POST /auth/logout
  # 退出登录
  Headers: Authorization
  Body:
    refreshToken: string

GET /auth/me
  # 获取当前用户信息
  Headers: Authorization
  Response: { user }
```

### 2.2 OAuth 第三方登录

```yaml
GET /auth/oauth/{provider}/authorize
  # 获取第三方授权URL
  Params: provider (google | github | wechat)
  Response: { authorizeUrl }

GET /auth/oauth/{provider}/callback
  # OAuth 回调
  Query: code, state
  Response: { user, accessToken, refreshToken }
```

## 3. 账号管理模块 API

### 3.1 账号 CRUD

```yaml
GET /accounts
  # 获取账号列表
  Query:
    platform: string (douyin | kuaishou | xiaohongshu | wxvideo)
    groupId: string
    status: string (active | expired | disabled)
    page: number
    pageSize: number
  Response: { items: Account[], total }

POST /accounts
  # 添加账号
  Body:
    platform: string (required)
    name: string (required)
    platformAccountId: string
    credentials: object (加密存储)
    groupId: string
  Response: { account }

GET /accounts/:id
  # 获取账号详情
  Response: { account }

PATCH /accounts/:id
  # 更新账号信息
  Body:
    name: string
    groupId: string
    status: string
  Response: { account }

DELETE /accounts/:id
  # 删除账号（软删除）

POST /accounts/:id/sync
  # 同步账号信息
  Response: { account, syncResult }
```

### 3.2 账号分组

```yaml
GET /account-groups
  # 获取分组列表
  Response: { items: Group[] }

POST /account-groups
  # 创建分组
  Body:
    name: string
    description: string
  Response: { group }

PATCH /account-groups/:id
  # 更新分组

DELETE /account-groups/:id
  # 删除分组

POST /account-groups/:id/members
  # 添加账号到分组
  Body:
    accountIds: string[]
```

### 3.3 平台授权

```yaml
POST /accounts/authorize/{platform}
  # 发起平台授权
  Params: platform
  Response: { authorizeUrl, sessionId }

POST /accounts/authorize/{platform}/callback
  # 授权回调
  Body:
    sessionId: string
    code: string
  Response: { account }

GET /accounts/:id/token-status
  # 检查 Token 状态
  Response: { valid, expiresAt, platform }
```

## 4. 内容发布模块 API

### 4.1 发布任务

```yaml
GET /publish/tasks
  # 获取发布任务列表
  Query:
    status: string (pending | processing | completed | failed)
    accountIds: string[]
    startDate: string
    endDate: string
    page: number
    pageSize: number
  Response: { items: PublishTask[], total }

POST /publish/tasks
  # 创建发布任务
  Body:
    title: string (required)
    content: string (required)
    platform: string (required)
    accountIds: string[] (required)
    media: MediaItem[]
    scheduledAt: string (定时发布时间)
    settings:
      allowComment: boolean
      location: string
      topics: string[]
      cover: string
  Response: { task }

GET /publish/tasks/:id
  # 获取任务详情
  Response: { task }

DELETE /publish/tasks/:id
  # 取消任务

POST /publish/tasks/:id/retry
  # 重试失败任务
```

### 4.2 素材管理

```yaml
POST /media/upload
  # 上传素材
  Content-Type: multipart/form-data
  Body:
    file: File
    type: string (image | video)
  Response: { media: { id, url, thumbnail, size, type } }

GET /media
  # 获取素材列表
  Query:
    type: string
    page: number
    pageSize: number

DELETE /media/:id
  # 删除素材
```

### 4.3 发布模板

```yaml
GET /publish/templates
  # 获取发布模板
POST /publish/templates
  # 创建模板
PATCH /publish/templates/:id
  # 更新模板
DELETE /publish/templates/:id
  # 删除模板
```

## 5. 内置浏览器模块 API

### 5.1 浏览器会话

```yaml
POST /browser/sessions
  # 创建浏览器会话
  Body:
    accountId: string (required)
    platform: string (required)
    proxy: string (可选代理)
  Response: { sessionId, wsUrl }

GET /browser/sessions
  # 获取活跃会话列表
  Response: { items: Session[] }

GET /browser/sessions/:id
  # 获取会话状态
  Response: { session }

DELETE /browser/sessions/:id
  # 关闭浏览器会话

POST /browser/sessions/:id/navigate
  # 导航到指定URL
  Body:
    url: string
  Response: { title, url }

POST /browser/sessions/:id/screenshot
  # 截图
  Body:
    fullPage: boolean
  Response: { screenshotUrl }
```

### 5.2 浏览器操作

```yaml
POST /browser/sessions/:id/actions
  # 执行浏览器操作
  Body:
    type: string (click | type | scroll | wait | upload)
    selector: string
    value: string
    options: object
  Response: { result }

POST /browser/sessions/:id/execute
  # 执行自定义脚本
  Body:
    script: string
  Response: { result }

GET /browser/sessions/:id/snapshots
  # 获取页面快照（DOM）
  Response: { html, url }
```

## 6. 数据统计模块 API

### 6.1 数据概览

```yaml
GET /stats/overview
  # 总览数据
  Query:
    teamId: string
    startDate: string
    endDate: string
  Response:
    totalAccounts: number
    totalPosts: number
    totalViews: number
    totalLikes: number
    totalFollowers: number
    growthRate: object

GET /stats/trends
  # 趋势数据
  Query:
    metric: string (views | likes | followers | posts)
    platform: string
    startDate: string
    endDate: string
    granularity: string (day | week | month)
  Response: { labels: string[], datasets: Dataset[] }
```

### 6.2 账号数据

```yaml
GET /stats/accounts/:id
  # 单账号数据详情
  Response: { account, metrics, trend }

GET /stats/accounts/ranking
  # 账号排行
  Query:
    metric: string
    platform: string
    limit: number
  Response: { items: AccountRank[] }
```

### 6.3 内容数据

```yaml
GET /stats/posts
  # 内容表现数据
  Query:
    accountId: string
    startDate: string
    endDate: string
    page: number
    pageSize: number
  Response: { items: PostStat[], total }

GET /stats/posts/:id
  # 单条内容数据
  Response: { post, metrics }
```

### 6.4 数据导出

```yaml
POST /stats/export
  # 导出数据
  Body:
    type: string (account | post | overview)
    format: string (xlsx | csv)
    filters: object
  Response: { taskId }

GET /stats/export/:taskId
  # 下载导出文件
  Response: File
```

## 7. 团队协作模块 API

### 7.1 团队管理

```yaml
GET /teams
  # 获取团队列表
POST /teams
  # 创建团队
  Body:
    name: string
    description: string
GET /teams/:id
  # 获取团队详情
PATCH /teams/:id
  # 更新团队信息
DELETE /teams/:id
  # 删除团队
```

### 7.2 成员管理

```yaml
GET /teams/:id/members
  # 获取成员列表
POST /teams/:id/members/invite
  # 邀请成员
  Body:
    email: string
    role: string (admin | editor | viewer)
DELETE /teams/:id/members/:userId
  # 移除成员
PATCH /teams/:id/members/:userId/role
  # 修改成员角色
  Body:
    role: string
```

### 7.3 操作日志

```yaml
GET /audit-logs
  # 获取操作日志
  Query:
    userId: string
    action: string
    resource: string
    startDate: string
    endDate: string
    page: number
    pageSize: number
  Response: { items: AuditLog[], total }
```

## 8. WebSocket 接口

### 连接

```
ws://host/ws?token=<access_token>
```

### 消息格式

```json
// 客户端 → 服务端
{
  "event": "subscribe",
  "data": { "channel": "publish:status" }
}

// 服务端 → 客户端
{
  "event": "publish:status:update",
  "data": {
    "taskId": "xxx",
    "status": "completed",
    "result": { ... }
  },
  "timestamp": "2026-05-06T00:00:00+08:00"
}
```

### 事件类型

| 事件 | 说明 |
|------|------|
| `publish:status:update` | 发布状态变更 |
| `browser:session:update` | 浏览器会话状态 |
| `stats:data:new` | 新统计数据 |
| `team:member:action` | 成员操作通知 |
| `system:notification` | 系统通知 |
