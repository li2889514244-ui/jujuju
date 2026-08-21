# MATRIXFLOW ERP - 数据库设计文档

## 1. 概述

### 1.1 数据库选型
| 项目 | 选型 | 说明 |
|------|------|------|
| 数据库 | PostgreSQL 15 | 支持JSONB、数组类型、全文检索 |
| ORM | Prisma 5.x | 类型安全、自动迁移、直观的API |
| 字符集 | UTF-8 | 支持中文及emoji |
| 时区 | UTC (应用层转换) | 避免时区混乱 |

### 1.2 命名规范
- **表名**：复数形式、snake_case（如 `users`, `team_members`）
- **列名**：snake_case（如 `created_at`, `user_id`）
- **枚举**：PascalCase（如 `UserRole`, `TaskStatus`）
- **索引**：`{table}_{column}_idx`（如 `accounts_status_idx`）
- **外键**：`{table}_{ref_table}_{ref_column}_fkey`
- **UUID**：所有主键使用 UUID v4

---

## 2. ER 关系图（文字版）

```
┌──────────┐     1:N     ┌──────────────┐     N:1     ┌──────────┐
│  users   │◄────────────│ team_members │────────────►│  teams   │
│          │             └──────────────┘             │          │
│  (owner) │─────────────────────────────────────────►│          │
└────┬─────┘                                          └────┬─────┘
     │                                                     │
     │ 1:N                                                 │ 1:N
     ▼                                                     ▼
┌──────────────┐     N:1     ┌──────────┐          ┌──────────────┐
│   accounts   │────────────►│ platforms │          │   accounts   │
└──────┬───────┘             └──────────┘          └──────┬───────┘
       │                                                  │
       │ 1:N                                    1:N       │
       ▼                                                  ▼
┌──────────────────┐                            ┌──────────────────┐
│ browser_sessions │                            │  publish_tasks   │
└──────────────────┘                            └────────┬─────────┘
                                                         │ N:1
       ┌──────────┐                                      ▼
       │ contents │◄─────────────────────────────┘
       └────┬─────┘
            │ 1:N
            ▼
     ┌───────────────┐
     │ analytics_data│
     └───────────────┘

     ┌────────────┐
     │ audit_logs │  (独立审计表)
     └────────────┘
```

---

## 3. 表结构详解

### 3.1 users - 用户表
存储平台用户信息，支持多角色权限体系。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 用户唯一标识 |
| username | VARCHAR(50) | UNIQUE, NOT NULL | 用户名 |
| email | VARCHAR(255) | UNIQUE, NOT NULL | 邮箱 |
| password_hash | VARCHAR(255) | NOT NULL | 密码哈希 (scrypt) |
| phone | VARCHAR(20) | NULL | 手机号 |
| avatar_url | VARCHAR(512) | NULL | 头像URL |
| role | UserRole | DEFAULT MEMBER | 用户角色 |
| status | UserStatus | DEFAULT ACTIVE | 账户状态 |
| last_login_at | TIMESTAMPTZ | NULL | 最后登录时间 |
| created_at | TIMESTAMPTZ | DEFAULT now() | 创建时间 |
| updated_at | TIMESTAMPTZ | AUTO UPDATE | 更新时间 |

**枚举值：**
- `UserRole`: OWNER / ADMIN / MANAGER / MEMBER
- `UserStatus`: ACTIVE / INACTIVE / SUSPENDED / PENDING_VERIFICATION

**索引：** username(U), email(U), status, created_at

---

### 3.2 teams - 团队表
支持企业级多团队管理，每个团队有成员上限和套餐等级。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 团队唯一标识 |
| name | VARCHAR(100) | NOT NULL | 团队名称 |
| description | VARCHAR(500) | NULL | 团队描述 |
| owner_id | UUID | FK→users.id, RESTRICT | 团队拥有者 |
| max_members | INTEGER | DEFAULT 20 | 最大成员数 |
| plan | TeamPlan | DEFAULT FREE | 套餐等级 |
| status | TeamStatus | DEFAULT ACTIVE | 团队状态 |

**套餐等级：** FREE(5人) / BASIC(10人) / PRO(20人) / ENTERPRISE(50人)

---

### 3.3 team_members - 团队成员表
多对多关系表，关联用户与团队，携带角色和细粒度权限。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 记录ID |
| team_id | UUID | FK→teams.id, CASCADE | 所属团队 |
| user_id | UUID | FK→users.id, CASCADE | 用户 |
| role | TeamRole | DEFAULT MEMBER | 团队内角色 |
| permissions | JSONB | NULL | 细粒度权限 |

**权限JSON结构：**
```json
{
  "can_publish": true,
  "can_manage_accounts": false,
  "can_manage_team": false,
  "can_view_analytics": true,
  "can_export_data": false
}
```

**唯一约束：** (team_id, user_id) — 同一用户在同一团队只能有一个角色

---

### 3.4 platforms - 平台表
支持的社交媒体平台配置，可动态扩展。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 平台ID |
| name | VARCHAR(50) | UNIQUE | 平台标识名 |
| display_name | VARCHAR(100) | NOT NULL | 显示名称 |
| icon_url | VARCHAR(512) | NULL | 图标URL |
| api_endpoint | VARCHAR(512) | NULL | API端点 |
| status | PlatformStatus | DEFAULT ACTIVE | 平台状态 |
| sort_order | INTEGER | DEFAULT 0 | 排序权重 |

**预置平台：** 抖音、快手、小红书、视频号、B站、微博

---

### 3.5 accounts - 账号表（核心表）
存储用户的平台账号信息，Cookie数据采用AES-256-GCM加密存储。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 账号记录ID |
| user_id | UUID | FK→users.id, CASCADE | 所属用户 |
| team_id | UUID | FK→teams.id, CASCADE | 所属团队 |
| platform_id | UUID | FK→platforms.id, RESTRICT | 所属平台 |
| platform_acct_id | VARCHAR(255) | NULL | 平台原始账号ID |
| username | VARCHAR(100) | NOT NULL | 平台用户名 |
| nickname | VARCHAR(200) | NULL | 平台昵称 |
| avatar_url | VARCHAR(512) | NULL | 平台头像 |
| **cookie_data** | TEXT | NOT NULL | **AES-256-GCM加密后的Cookie** |
| **cookie_iv** | VARCHAR(32) | NOT NULL | **加密初始化向量 (hex)** |
| **cookie_tag** | VARCHAR(32) | NOT NULL | **GCM认证标签 (hex)** |
| extra_data | JSONB | NULL | 其他平台特定数据 |
| status | AccountStatus | DEFAULT ACTIVE | 账号状态 |
| last_active_at | TIMESTAMPTZ | NULL | 最后活动时间 |
| expire_at | TIMESTAMPTZ | NULL | Cookie过期预估时间 |
| remark | VARCHAR(500) | NULL | 备注 |

**唯一约束：** (platform_id, platform_acct_id) — 同一平台的账号ID唯一

---

### 3.6 browser_sessions - 浏览器会话表
管理内置浏览器的会话状态，支持隔离浏览和代理配置。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 会话ID |
| account_id | UUID | FK→accounts.id, CASCADE | 关联账号 |
| platform_id | UUID | FK→platforms.id, RESTRICT | 所属平台 |
| session_data | TEXT | NOT NULL | 加密的浏览器状态 |
| session_iv / session_tag | VARCHAR(32) | NOT NULL | 加密参数 |
| user_agent | VARCHAR(512) | NULL | 浏览器UA |
| viewport_width / height | INTEGER | NULL | 视窗尺寸 |
| proxy_config | JSONB | NULL | 代理配置 |
| status | SessionStatus | DEFAULT IDLE | 会话状态 |
| last_used_at | TIMESTAMPTZ | NULL | 最后使用时间 |

---

### 3.7 publish_tasks - 发布任务表
管理内容发布任务，支持定时发布和失败重试。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 任务ID |
| creator_id | UUID | FK→users.id, CASCADE | 创建者 |
| account_id | UUID | FK→accounts.id, CASCADE | 目标账号 |
| content_id | UUID | FK→contents.id, CASCADE | 关联内容 |
| title / description | VARCHAR/TEXT | NULL | 可覆盖的内容标题和描述 |
| custom_params | JSONB | NULL | 平台特定发布参数 |
| status | TaskStatus | DEFAULT PENDING | 任务状态 |
| scheduled_time | TIMESTAMPTZ | NULL | 定时发布时间 |
| published_at | TIMESTAMPTZ | NULL | 实际发布时间 |
| published_url | VARCHAR(1024) | NULL | 发布后的链接 |
| platform_post_id | VARCHAR(255) | NULL | 平台帖子ID |
| error_message | TEXT | NULL | 错误信息 |
| retry_count / max_retries | INTEGER | 0 / 3 | 重试计数 |

**状态流转：**
```
PENDING → QUEUED → RUNNING → SUCCESS
                     ↓
                   FAILED → RETRY_PENDING → QUEUED (自动重试)
                     ↓
                 CANCELLED (手动取消)
```

---

### 3.8 contents - 内容表
存储待发布的内容素材。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 内容ID |
| user_id | UUID | FK→users.id, CASCADE | 创建者 |
| title | VARCHAR(200) | NOT NULL | 标题 |
| description | TEXT | NULL | 描述 |
| content_type | ContentType | DEFAULT VIDEO | 内容类型 |
| video_url | VARCHAR(1024) | NULL | 视频URL |
| video_hash | VARCHAR(64) | NULL | 视频SHA-256哈希（去重） |
| thumbnail_url | VARCHAR(1024) | NULL | 缩略图URL |
| cover_url | VARCHAR(1024) | NULL | 封面URL |
| tags | TEXT[] | DEFAULT {} | 标签数组 |
| duration | INTEGER | NULL | 时长(秒) |
| file_size | BIGINT | NULL | 文件大小(字节) |
| metadata | JSONB | NULL | 扩展元数据 |
| status | ContentStatus | DEFAULT DRAFT | 内容状态 |

---

### 3.9 analytics_data - 数据统计表
采集各平台账号的数据指标，支持按天和小时粒度统计。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 记录ID |
| account_id | UUID | FK→accounts.id, CASCADE | 关联账号 |
| publish_task_id | UUID | NULL | 关联发布任务 |
| platform_post_id | VARCHAR(255) | NULL | 平台帖子ID |
| metric_type | MetricType | NOT NULL | 指标类型 |
| metric_value | BIGINT | DEFAULT 0 | 指标值 |
| snapshot_date | DATE | NOT NULL | 快照日期 |
| snapshot_hour | INTEGER | NULL | 快照小时(0-23) |
| metadata | JSONB | NULL | 附加数据 |

**唯一约束：** (account_id, platform_post_id, metric_type, snapshot_date, snapshot_hour)

**指标类型：** VIEWS / LIKES / COMMENTS / SHARES / FOLLOWS / COLLECTS / ENGAGEMENT / WATCH_DURATION / CLICK_THROUGH

---

### 3.10 audit_logs - 审计日志表
记录所有关键操作，用于安全审计和问题追踪。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 日志ID |
| user_id | UUID | NOT NULL | 操作用户 |
| action | VARCHAR(50) | NOT NULL | 操作类型 |
| resource | VARCHAR(50) | NOT NULL | 资源类型 |
| resource_id | UUID | NULL | 资源ID |
| details | JSONB | NULL | 操作详情 |
| ip_address | VARCHAR(45) | NULL | IP地址(支持IPv6) |
| user_agent | VARCHAR(512) | NULL | 浏览器UA |
| created_at | TIMESTAMPTZ | DEFAULT now() | 操作时间 |

---

## 4. 加密存储方案

### 4.1 加密算法
采用 **AES-256-GCM** (Galois/Counter Mode) 加密敏感数据。

### 4.2 加密流程
```
明文 Cookie JSON
       │
       ▼
┌─────────────────────────┐
│ AES-256-GCM Encryption  │
│ Key: 256-bit 密钥       │
│ IV:  随机96-bit         │
│ AAD: account_id         │
└─────────────────────────┘
       │
       ├──► cookie_data (密文, Base64)
       ├──► cookie_iv   (IV, Hex)
       └──► cookie_tag  (认证标签, Hex)
```

### 4.3 存储结构
数据库中每条账号记录存储三个字段：
- `cookie_data`: 加密后的密文（Base64编码）
- `cookie_iv`: 本次加密使用的初始化向量（Hex编码，32字符）
- `cookie_tag`: GCM认证标签，用于验证数据完整性（Hex编码，32字符）

### 4.4 密钥管理
```typescript
// 密钥来源：环境变量（绝不可硬编码）
const ENCRYPTION_KEY = process.env.ACCOUNT_ENCRYPTION_KEY; // 256-bit hex string

// 加密函数示例
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function encryptCookie(plaintext: string, accountId: string): EncryptedData {
  const key = Buffer.from(ENCRYPTION_KEY!, 'hex');
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(accountId)); // 附加认证数据

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();

  return {
    data: encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

function decryptCookie(encrypted: string, iv: string, tag: string, accountId: string): string {
  const key = Buffer.from(ENCRYPTION_KEY!, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAAD(Buffer.from(accountId));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

### 4.5 安全要求
| 要求 | 实施方式 |
|------|----------|
| 密钥存储 | 环境变量 `ACCOUNT_ENCRYPTION_KEY`，不入代码库 |
| 密钥轮换 | 支持双密钥解码 + 重新加密方案 |
| 传输加密 | TLS 1.3 强制 |
| 访问控制 | 仅账号所属用户及其团队管理员可解密 |
| 审计追踪 | 所有解密操作记录到 audit_logs |
| 数据库备份 | 备份文件同样加密存储 |

---

## 5. 索引策略

### 5.1 核心查询索引
| 表 | 索引 | 用途 |
|------|------|------|
| users | email(U) | 登录查询 |
| users | username(U) | 用户名查找 |
| accounts | (platform_id, platform_acct_id)(U) | 平台账号去重 |
| accounts | team_id + status | 团队账号列表 |
| analytics_data | (account_id, snapshot_date) | 按日期查询统计数据 |
| publish_tasks | scheduled_time + status | 定时任务调度 |
| audit_logs | (resource, resource_id) | 资源操作追踪 |

### 5.2 性能考量
- 所有外键字段均建立索引
- 高频查询字段（status, created_at）建立独立索引
- analytics_data 使用复合唯一索引防止重复采集
- 审计日志表按时间分区（建议月分区）

---

## 6. 分区建议（生产环境）

analytics_data 和 audit_logs 预计数据量较大，建议启用表分区：

```sql
-- analytics_data 按月分区
CREATE TABLE analytics_data (
    -- ... 同上
) PARTITION BY RANGE (snapshot_date);

CREATE TABLE analytics_data_y2024m01 PARTITION OF analytics_data
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- audit_logs 按月分区
CREATE TABLE audit_logs (
    -- ... 同上
) PARTITION BY RANGE (created_at);
```

---

## 7. 迁移管理

### 7.1 迁移命令
```bash
# 生成迁移
npx prisma migrate dev --name <migration_name>

# 应用迁移到生产环境
npx prisma migrate deploy

# 查看迁移状态
npx prisma migrate status

# 重置数据库（开发环境）
npx prisma migrate reset
```

### 7.2 种子数据
```bash
npx prisma db seed
```

seed.ts 包含：
- 6个预置平台（抖音、快手、小红书、视频号、B站、微博）
- 3个示例用户（admin、zhangsan、lisi）
- 1个默认团队及成员关系
- 5个示例账号
- 3条示例内容

---

## 8. 技术要点总结

| 特性 | 实现 |
|------|------|
| 主键策略 | UUID v4，无序避免热点 |
| 时间字段 | TIMESTAMPTZ，统一UTC |
| 软删除 | status 字段标记，非物理删除 |
| 加密方案 | AES-256-GCM，认证加密 |
| 并发控制 | Prisma 乐观锁（@updatedAt） |
| 级联策略 | 用户→账号 CASCADE，平台→账号 RESTRICT |
| 审计追踪 | audit_logs 表记录关键操作 |
| 可扩展性 | JSON 字段存储平台特定数据 |
