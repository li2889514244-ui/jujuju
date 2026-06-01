# 披星云本地伴侣 v4

## 概览

矩阵账号数据采集桌面工具，NiceGUI 原生窗口，本地 SQLite 存储，不依赖云端 API。

- **目标平台**：抖音 / 快手 / 小红书
- **采集方式**：Chrome CDP 模式（打开创作者后台 → 提取页面数据）
- **数据类型**：账号信息、粉丝历史趋势、作品列表、作品数据增量
- **UI 框架**：NiceGUI 3.12（Python 桌面窗口，无 CDN 依赖）

---

## 架构

```
┌─────────────────────────────────────────────┐
│                 main.py                      │
│          NiceGUI 桌面窗口入口                 │
│  ┌──────────┬──────────┬──────────┐          │
│  │Dashboard │ Accounts │ Collect  │          │
│  │  看板     │  账号管理 │ 采集控制  │          │
│  └──────────┴──────────┴──────────┘          │
│         │              │                      │
│    scheduler.py    collectors/               │
│    定时采集调度     ┌──────────────┐          │
│    快照管理        │ chrome_mgr   │          │
│                    │ douyin       │          │
│                    │ kuaishou     │          │
│                    │ xiaohongshu  │          │
│                    └──────────────┘          │
│              │                              │
│         models/database.py                  │
│         SQLite (WAL mode)                    │
└─────────────────────────────────────────────┘
```

---

## 文件结构

```
pixing-local-companion/
├── main.py                  # 主入口，NiceGUI 窗口 + 全局实例初始化
├── config.py                # 配置管理（端口、间隔、平台开关）
├── scheduler.py             # 后台定时采集调度器 + 快照管理
├── companion_config.json    # 运行时配置（自动生成）
├── companion_data.db        # SQLite 数据库（自动生成）
├── requirements.txt         # nicegui
│
├── models/
│   └── database.py          # 四表 CRUD：accounts / follower_history / contents / content_history
│
├── collectors/
│   ├── __init__.py          # 导出 COLLECTORS 注册表
│   ├── chrome_mgr.py        # Chrome CDP 进程管理器（启动/停止/PID控制/new_page/evaluate）
│   ├── base.py              # 采集基类（通用流程、parse_count、safe_extract）
│   ├── douyin.py            # 抖音采集器 → creator.douyin.com
│   ├── kuaishou.py          # 快手采集器 → cp.kuaishou.com
│   └── xiaohongshu.py       # 小红书采集器 → creator.xiaohongshu.com
│
└── ui/
    ├── dashboard.py          # 数据看板（总览卡片 + 平台分组 + 粉丝趋势）
    ├── accounts.py           # 账号管理（平台分组、认证标识、最后采集时间）
    └── collect.py            # 采集控制（平台勾选、开始/停止、实时日志）
```

**代码统计**

| 模块 | 行数 | 职责 |
|------|------|------|
| models/database.py | 341 | 四表 CRUD + 今日统计 |
| collectors/chrome_mgr.py | 187 | Chrome 生命周期管理 |
| collectors/base.py | 154 | 采集通用流程 |
| collectors/douyin.py | 176 | 抖音专用采集 |
| collectors/kuaishou.py | 131 | 快手专用采集 |
| collectors/xiaohongshu.py | 149 | 小红书专用采集 |
| ui/dashboard.py | 58 | 数据看板 |
| ui/accounts.py | 62 | 账号管理 |
| ui/collect.py | 108 | 采集控制 |
| main.py | 125 | 主入口 |
| scheduler.py | 149 | 调度器 |
| config.py | 39 | 配置 |
| **合计** | **~1680** | |

---

## 数据模型（4 张表）

### accounts — 账号维度

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| platform | TEXT | douyin/kuaishou/xiaohongshu |
| platform_uid | TEXT | 平台用户ID |
| nickname | TEXT | 昵称 |
| avatar_url | TEXT | 头像URL |
| bio | TEXT | 简介 |
| follower_count | INTEGER | 粉丝数 |
| following_count | INTEGER | 关注数 |
| like_count | INTEGER | 获赞数 |
| video_count | INTEGER | 作品数 |
| verified | INTEGER | 是否认证(0/1) |
| verified_type | TEXT | 认证类型(企业/个人/机构) |
| last_collected | TEXT | 最后采集时间(ISO) |

唯一约束：`(platform, platform_uid)`

### follower_history — 粉丝历史趋势

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| account_id | INTEGER FK | → accounts.id |
| date | TEXT | YYYY-MM-DD |
| follower_count | INTEGER | 当日粉丝数 |
| follower_change | INTEGER | 净增（自动计算） |
| following_count | INTEGER | |
| like_count | INTEGER | |
| video_count | INTEGER | |

唯一约束：`(account_id, date)`

### contents — 作品维度

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| platform | TEXT | |
| content_id | TEXT | 平台作品ID |
| account_id | INTEGER FK | → accounts.id |
| title | TEXT | 标题 |
| cover_url | TEXT | 封面 |
| content_url | TEXT | 链接 |
| content_type | TEXT | video/image/article |
| duration | INTEGER | 时长(秒) |
| published_at | TEXT | 发布时间 |
| play_count | INTEGER | 播放量 |
| like_count | INTEGER | 点赞 |
| comment_count | INTEGER | 评论 |
| share_count | INTEGER | 分享 |
| collect_count | INTEGER | 收藏 |

唯一约束：`(platform, content_id)`

### content_history — 作品数据增量

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| content_id | INTEGER FK | → contents.id |
| date | TEXT | YYYY-MM-DD |
| play_count / play_increment | INTEGER | 播放量 + 日增量 |
| like_count / like_increment | INTEGER | 点赞 + 增量 |
| comment_count / comment_increment | INTEGER | 评论 + 增量 |
| share_count / share_increment | INTEGER | 分享 + 增量 |
| collect_count / collect_increment | INTEGER | 收藏 + 增量 |

唯一约束：`(content_id, date)`


## 采集流程

```
1. ChromeManager.start()
   └─ 启动 Chrome --remote-debugging-port=9222

2. BaseCollector.collect()
   ├─ chrome.new_page()         # CDP /json/new
   ├─ chrome.evaluate()          # 导航到目标URL
   ├─ _wait_for_page()           # 等待 innerText > 500
   ├─ _extract_account()         # querySelector 提取账号信息
   ├─ _extract_contents()        # 点击"作品管理" → querySelectorAll 提取列表
   └─ db.upsert_*()              # 写入数据库

3. scheduler 自动触发
   └─ record_follower_snapshot()  # 对比昨日算净增
   └─ record_content_snapshot()   # 对比昨日算增量
```


## 当前状态

### 已验证通过

- [x] 全部 13 个 .py 文件语法检查
- [x] 所有模块交叉导入验证
- [x] SQLite 四表 CRUD 完整测试（upsert/insert/snapshot/increment）
- [x] NiceGUI 3.12.1 已安装
- [x] HTTP 200 在 5409 端口确认运行
- [x] 桌面 bat 入口文件正确

### 已知问题

| 问题 | 影响 | 优先级 |
|------|------|--------|
| CollectPage 用了 `ui.state()` 在函数体内（非 `@ui.refreshable`），上次修改后仍未彻底修复 | 采集页面可能有运行时错误 | 高 |
| 采集器未经过真实 Chrome 页面验证 | 选择器可能对不上实际页面 | 高 |
| `content_id` 用哈希生成，重复概率高 | 作品去重不可靠 | 中 |
| `chrome.evaluate()` 使用 HTTP 发 CDP 命令（非 WebSocket），大结果可能截断 | 复杂页面可能丢数据 | 中 |
| scheduler._notify() 传递 status 字典，但 CollectPage 期望的 update_status 是字符串 | 回调签名不匹配 | 中 |
| 无错误恢复机制：Chrome 崩溃后需手动重启 | 用户体验差 | 低 |

### 待开发

- [ ] 一键分发模块（vp-publish-* skills 集成）
- [ ] 云端同步到 ddddkiii.com
- [ ] 浏览器扫码登录引导
- [ ] PyInstaller 便携打包
- [ ] 快手/小红书采集器实际页面验证
- [ ] 粉丝趋势图表（echarts 嵌入）


## 运行方式

```bat
:: 双击桌面快捷方式
C:\Users\EDY\Desktop\披星云本地伴侣\启动伴侣.bat

:: 或命令行
cd C:\Users\EDY\jujuju\pixing-local-companion
C:\Users\EDY\.workbuddy\binaries\python\versions\3.13.12\python.exe main.py
```

- NiceGUI 窗口自动打开（`native=True`）
- 后台 HTTP 服务监听 `127.0.0.1:5409`
- Chrome CDP 监听 `127.0.0.1:9222`


## 依赖

```
nicegui>=3.0
```

Python 3.13.12（managed）。无需其他第三方库，`chrome_mgr.py` 纯标准库实现 CDP 协议。


## 设计原则

- 零成本：无付费 API，无 SaaS 依赖
- 便携：纯 Python + SQLite，不依赖数据库服务
- 模块化：每个采集器独立，新增平台只需加一个文件
- Karpathy 极简：无提前抽象，无过度工程，可追溯用户请求
