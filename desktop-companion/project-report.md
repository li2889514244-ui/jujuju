# 披星云桌面伴侣 (Pixingyun Desktop Companion) — 项目分析报告

**分析日期**: 2026-06-01
**项目版本**: v3.1（正在重构为 v3.2）
**项目路径**: `C:\Users\EDY\jujuju\desktop-companion`

---

## 1. 项目概览

"披星云桌面伴侣"是一套**多平台社交媒体矩阵账号管理桌面工具**，核心能力包括：

- 一键扫码登录（抖音/小红书/快手/视频号）
- 自动化数据采集（粉丝、播放量、点赞、收入、店铺指标等）
- 数字人视频自动合成（披星云 Worker）
- 本地账号管理与 Cookie 持久化

---

## 2. 目录结构

```
desktop-companion/
├── companion_app.py              # 主应用（Flask + UI + 采集引擎）2329 行
├── chrome_cdp.py                 # Chrome CDP 进程管理器 247 行
├── local_db.py                   # 本地 SQLite 数据库 144 行
├── pixing_worker.py              # 数字人视频 Worker 368 行
├── launcher.py                   # 应用启动器 112 行
├── conf.py                       # 配置常量 8 行
├── test_collect.py               # 采集测试脚本 32 行
├── _check_cc.py                  # Cookie 检查脚本
│
├── requirements.txt              # Python 依赖（81 项）
├── companion_config.json         # 运行时配置 ⚠️ 含明文密码
├── companion_config_default.json # 默认配置模板
├── 披星云伴侣.spec               # PyInstaller 打包配置
├── 披星云伴侣-便携版.zip         # 打包产物 (76MB)
│
├── README.txt                    # 简易使用说明
├── CHANGES_20260529.md           # v3.1 → v3.2 变更日志
├── app_icon.ico                  # 应用图标
├── companion-icon.svg            # SVG 图标
│
├── setup.bat                     # 一键安装脚本
├── start.bat                     # 快捷启动
├── 启动伴侣.bat                  # 中文启动脚本
├── 启动伴侣-调试.bat             # 调试启动
├── 启动伴侣.vbs                  # 静默启动
├── MatrixFlow桌面伴侣.pyw        # 无窗口启动
│
├── static/
│   ├── index.html                # SPA 入口（实际 UI 内嵌在 companion_app.py）
│   └── vue.global.prod.js        # Vue 3 CDN 备用
│
├── .venv/                        # Python 虚拟环境
├── chrome_profile/               # Chrome 持久化 Profile
├── build/                        # PyInstaller 构建产物
└── dist/                         # 分发输出
```

---

## 3. 技术栈

### 3.1 后端

| 层级 | 技术 | 版本 |
|------|------|------|
| 语言 | Python | 3.13.12 |
| Web 框架 | Flask（async 模式） | 3.1.1 |
| 跨域 | Flask-CORS | 6.0.0 |
| 浏览器自动化 | Playwright（async） | 1.52.0 |
| 浏览器管理 | Chrome CDP Protocol（自定义） | — |
| 本地数据库 | SQLite（WAL 模式） | — |
| HTTP 客户端 | requests / aiohttp | 2.32.3 / 3.11+ |
| 图像处理 | Pillow | 11.2.1 |
| 视频下载 | yt-dlp / streamlink / biliup | 最新 |

### 3.2 前端

| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | Vue 3 | 通过 CDN 引入（vue.global.prod.js） |
| 模板方式 | 内联 HTML 字符串 | UI_HTML 变量嵌入 Python 源码 |
| 样式 | 原生 CSS | 无预处理器、无 CSS 框架 |
| 构建工具 | 无 | 零构建步骤 SPA |
| 路由 | 无 | 单页状态机（v-if 切换视图） |

### 3.3 部署

- **开发运行**: `python companion_app.py`
- **打包分发**: PyInstaller → `pixingyun-mate.exe`
- **端口**: Flask 5409，CDP UI 9222，CDP 采集 9223

---

## 4. 功能模块详解

### 4.1 浏览器管理 (`chrome_cdp.py`)

ChromeCDP 类提供完整的 Chrome 生命周期管理：

- 多路径 Chrome/Edge 自动探测
- 便携模式 Profile 管理（user-data-dir）
- 精准进程终止（通过 netstat + taskkill 定位 CDP 端口占用）
- CDP 端口就绪检测（轮询 `/json/version`）
- 超时重试与异常处理

**评价**: 设计完善，逻辑清晰，247 行代码职责明确。

### 4.2 应用启动 (`launcher.py`)

- 自动检测托管 Python（.workbuddy/binaries/python）
- 多级回退（托管 Python → 系统 Python）
- 端口占用检测（避免重复启动）
- DETACHED_PROCESS 模式启动 Flask 子进程

### 4.3 扫码绑定流程 (`companion_app.py` — `_make_login_worker`)

核心流程：

```
选择平台 → SSE 事件流 → CDP Chrome 打开登录页
    → 用户扫码 → 点击"已完成登录" → 提取 Cookie
    → 存本地 Profile (state.json) → 立即采集初始数据
    → 上报后端
```

- SSE 实时推送状态（loading → browser → uploading → done/error）
- 双队列架构（UI → ctrl_queue → Worker，Worker → event_queue → UI）
- 扫码后自动深采（dashboard + data_center + video_list + monetization）
- 按平台隔离 Context（clear_cookies 防污染）

### 4.4 自动化数据采集 (`companion_app.py` — `_scrape_all` / `_scrape_account_pages`)

| 采集目标 | 实现方式 |
|----------|----------|
| 基础指标（粉丝/关注/获赞） | 正则匹配页面文本 |
| 数据看板 | Playwright 页面导航 + innerText 抓取 |
| 视频列表 | DOM 选择器批量抓取 |
| 变现数据（GMV/收入/佣金） | 正则 + 表格双重提取 |
| 店铺指标（抖店/微信小店） | 正则 + DOM 遍历 |
| 历史数据（7/30 天） | 表格解析 + 日期推断 |
| 昵称/头像 | 多策略 DOM 提取（4 层回退） |

架构亮点：

```
可见 Chrome (9222)  ← UI + 扫码绑定（单窗口 TAB 模式）
无头 Chrome (9223)  ← 数据采集专用（真指纹，零窗口，用完即回收）
```

采集间隔：白天 30 分钟，夜间 2 小时。

### 4.5 数字人视频 Worker (`pixing_worker.py`)

后台轮询任务队列（15s 间隔），自动执行：

1. Playwright 打开披星教育 SPA
2. 导航"视频创作"→ 选择老师形象 → 选择音频
3. 粘贴文案 → 合成视频 → 等待完成
4. 下载/提取字幕（页面提取 → 下载 SRT → 自动生成）

**注意**: Worker 目前只支持披星教育（pixingjiaoyu.com.cn）的自动化，且 UI 中对该功能几乎没有展示（仅 `fetchPixingStatus` 轮询）。

### 4.6 本地账号管理 (`local_db.py`)

SQLite 表结构：

```sql
accounts (
    id TEXT PRIMARY KEY,        -- 后端 accountId
    platform TEXT NOT NULL,     -- DOUYIN/XIAOHONGSHU/KUAISHOU/WECHAT_VIDEO
    platform_uid TEXT,          -- 平台用户 ID
    nickname TEXT,
    profile_dir TEXT NOT NULL,  -- 独立 Profile 目录名
    status TEXT DEFAULT 'active',
    last_collected_at TEXT,
    created_at TEXT
)
```

核心设计原则：**Cookie 永远留在本地 Profile 目录，不上传后端。后端只记录绑定状态。**

---

## 5. 代码质量评估

### 5.1 优点

| 项目 | 评价 |
|------|------|
| Chrome CDP 管理 | 设计合理，状态检测完善，进程清理健壮 |
| 数据采集容错 | 多层 try/except + 正则回退，各平台适配较好 |
| Cookie 本地化存储 | 安全设计正确（state.json 存本机 Profile） |
| 异常处理 | 关键路径全覆盖，page.close / context.close 均有兜底 |
| SSE 进度推送 | 扫码流程的用户体验设计流畅 |
| 双 Chrome 架构 | UI Chrome + 采集 Chrome 隔离，避免窗口泛滥 |
| CI/CD | 有 PyInstaller 打包配置，分工明确 |

### 5.2 问题与风险

#### 🔴 严重

1. **明文密码存储** — `companion_config.json` 以明文保存 `saved_password`，任何人可读取

   ```json
   {"api_url": "https://ddddkiii.com/api/v1", "saved_email": "xxx@xxx.com", "saved_password": "plaintext"}
   ```

   **建议**: 使用 Windows DPAPI (`win32crypt`) 或 keyring 加密存储。

2. **本地 API 无认证** — 所有 Flask 路由无需认证即可调用（localhost 上任何进程可触发扫码/采集/删除账号）。

   **建议**: Flask 路由添加简单的 token 校验，或限制请求来源为 localhost only。

3. **超大单体文件** — `companion_app.py` 共 2329 行，混合了：
   - 内联 Vue SPA HTML（~440 行）
   - Flask 路由定义
   - 正则指标提取引擎
   - Playwright 自动化
   - 配置管理
   - 后台采集循环

   **建议**: 拆分为 `routes.py` / `scraper.py` / `ui.py` / `config.py`。

4. **UI HTML 嵌入 Python 字符串** — 440 行 `UI_HTML = r'''...'''`，无语法高亮、无 lint、无热更新。

   **建议**: 将 UI_HTML 提取到 `static/index.html`，用 `send_from_directory` 或 Jinja2 模板渲染。

#### 🟡 中等

5. **无结构化日志** — 全部使用 `print()`，没有日志级别、没有文件轮转。

6. **正则采集脆弱** — 数据采集依赖大量正则表达式匹配页面文本，平台 HTML 改动即失效。

7. **无测试** — 仅有 `test_collect.py`（32 行），无单元测试、无集成测试。

8. **Vue 3 CDN 模式** — 无 Tree-shaking、无类型检查、无构建流程，前端代码全部内联在 Python 字符串中。

9. **硬编码 API URL** — `https://ddddkiii.com/api/v1` 出现在多个默认配置中。

#### 🟢 轻微

10. **混用中英文命名** — 部分脚本用中文命名（`启动伴侣.bat`），部分用英文（`start.bat`）。
11. **残留文件** — `sau_backend.py.bak`（已废弃的 social-auto-upload 模块）。
12. **requirements.txt 冗余** — 81 个依赖中部分为间接依赖（`sniffio`/`h11` 等），且版本全部锁死。
13. **`conf.py` 几乎未使用** — 定义了 `BASE_DIR`/`XHS_SERVER` 等常量，但主应用未引用。
14. **`static/index.html` 不是真正的入口** — 实际 UI 在 `companion_app.py` 的 `UI_HTML` 变量中，`static/index.html` 是一个独立的 Vue SPA（443 行），两者可能是不同版本。

---

## 6. 文件完整性检查

| 文件 | 状态 | 行数 | 说明 |
|------|------|------|------|
| companion_app.py | ✅ | 2329 | 主应用，混合了全部逻辑 |
| chrome_cdp.py | ✅ | 247 | Chrome CDP 管理 |
| local_db.py | ✅ | 144 | SQLite 数据库 |
| pixing_worker.py | ✅ | 368 | 数字人视频 Worker |
| launcher.py | ✅ | 112 | 启动器 |
| conf.py | ✅ | 8 | 配置常量（几乎未用） |
| requirements.txt | ✅ | 81 | 依赖列表 |
| companion_config.json | ✅ | 11 | 运行时配置（含敏感信息） |
| 披星云伴侣.spec | ✅ | 68 | PyInstaller 打包配置 |
| static/index.html | ✅ | 443 | Vue SPA（可能为旧版 UI） |
| static/vue.global.prod.js | ✅ | — | Vue 3 CDN 备用 |
| test_collect.py | ✅ | 32 | 采集测试 |
| _check_cc.py | ✅ | — | Cookie 检查脚本 |
| sau_backend.py.bak | ⚠️ | — | 废弃备份文件 |

---

## 7. 架构图示

```
┌─────────────────────────────────────────────────────────┐
│                  披星云桌面伴侣 v3.1                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐     ┌──────────────────────────────────┐  │
│  │ launcher │────▶│       companion_app.py           │  │
│  │  .py     │     │  ┌──────────┐ ┌────────────────┐ │  │
│  └──────────┘     │  │ UI_HTML  │ │ Flask Routes   │ │  │
│                   │  │ (Vue 3)  │ │ /api/scan-bind │ │  │
│  ┌──────────┐     │  │          │ │ /api/config    │ │  │
│  │ setup.bat│     │  └──────────┘ │ /api/login     │ │  │
│  └──────────┘     │               └───────┬────────┘ │  │
│                   │                       │          │  │
│  ┌──────────┐     │  ┌────────────────────▼────────┐ │  │
│  │ conf.py  │     │  │     Data Collection         │ │  │
│  └──────────┘     │  │  _scrape_all → _scrape_*    │ │  │
│                   │  │  (CDP headless :9223)       │ │  │
│  ┌──────────┐     │  └─────────────────────────────┘ │  │
│  │local_db  │     │                                   │  │
│  │  .py     │◀────│  ┌─────────────────────────────┐ │  │
│  └──────────┘     │  │  Pixing Worker (thread)     │ │  │
│                   │  │  pixing_worker.py           │ │  │
│  ┌──────────┐     │  └─────────────────────────────┘ │  │
│  │chrome_   │     │                                   │  │
│  │ cdp.py   │◀────│  ┌─────────────────────────────┐ │  │
│  └──────────┘     │  │  Scan-Bind Sessions         │ │  │
│                   │  │  active_sessions (Queue)    │ │  │
│  ┌──────────┐     │  │  scan_status dict           │ │  │
│  │companion_│     │  └─────────────────────────────┘ │  │
│  │ config   │     └──────────────────────────────────┘  │
│  └──────────┘                                           │
│                                                         │
│  外部依赖:                                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ MatrixFlow API (https://ddddkiii.com/api/v1)     │  │
│  │   - /auth/login          (认证)                   │  │
│  │   - /accounts            (账号 CRUD)              │  │
│  │   - /platforms/report-metrics  (指标上报)         │  │
│  │   - /pixing-video/tasks  (数字人任务)             │  │
│  │                                                    │  │
│  │ Playwright + Chrome CDP                           │  │
│  │   - CDP :9222 (UI Chrome)                         │  │
│  │   - CDP :9223 (Headless 采集 Chrome)              │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 8. 总结与建议

### 总体评价

项目核心功能完整，Chrome CDP 管理和数据采集引擎设计具有一定复杂度且容错良好，扫码绑定流程的用户体验设计流畅（SSE 实时推送）。但代码组织存在明显问题：**2329 行的单体 Python 文件混合了 UI、路由、采集逻辑、配置管理**，不利于维护和扩展。

### 优先级建议

| 优先级 | 事项 | 影响 |
|--------|------|------|
| P0 | 移除明文密码存储，改用加密方案 | 安全性 |
| P0 | 本地 API 添加认证 | 安全性 |
| P1 | 拆分 companion_app.py（路由/采集/UI 分离） | 可维护性 |
| P1 | UI_HTML 提取为独立文件，加 Jinja2 模板渲染 | 开发体验 |
| P2 | 引入 logging 模块替代 print() | 可观测性 |
| P2 | 添加采集数据单元测试 | 质量保障 |
| P3 | 前端 Vue 3 改为构建模式（Vite） | 工程化 |
| P3 | 清理残留文件（sau_backend.py.bak） | 整洁性 |

### 关键指标

| 指标 | 数值 |
|------|------|
| 总 Python 代码行数 | ~3,200 行 |
| 核心文件数 | 6 个 (.py) |
| 支持平台数 | 6 个（抖音/快手/小红书/B站/微博/视频号） |
| 店铺平台 | 3 个（抖店/微信小店/小红书商家） |
| API 端点 | 14 个 |
| 正则提取模式 | 60+ 个 |