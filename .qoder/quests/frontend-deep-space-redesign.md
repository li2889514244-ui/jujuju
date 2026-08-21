# 前端视觉系统：深空静谧 (Deep Space Quiet) 全面重塑方案

## 一、Context（背景）

`frontend/` 这套基于 Vue 3 + Element Plus 2.7 的矩阵管理后台，目前视觉表现严重低于专业产品标准，存在多重系统性问题，导致：

1. **登录按钮渲染异常（截图中显示橘黄色）**——根因是 `index.html` 与 `global.scss` 中存在两套互相冲突的 `!important` 主题，强行抢占 Element Plus 的 CSS 变量。
2. **核心首页（矩阵数据 `MatrixDashboard.vue`）样式整片失效**——经 Grep 验证，该视图 15 处引用 `var(--color-bg-elevated)` / `var(--color-border)` / `var(--color-accent)` / `var(--color-text-secondary)` 等 CSS 自定义属性，但**这些变量在全项目从未被定义**（仅有同名 SCSS 变量），导致大量元素背景透明、边框消失、文字色塌缩成浏览器默认色。
3. **视觉语言碎片化**——并存两套设计："Matrix Ops" 柠檬绿 + 暗调玻璃拟态（`_variables.scss` / `global.scss`）vs 大量页面（账号、团队、平台、日历、变现等）使用裸的 `el-card` 包裹器，毫无设计加持。
4. **登录页过度简陋**——一个 400px 卡片孤悬于暗黑空场中，无 Logo、无价值主张、无品牌墙，视觉权重严重不足。
5. **字体声明形同虚设**——`_variables.scss` 排列了 Alibaba PuHuiTi / HarmonyOS Sans SC / MiSans / DIN Alternate 等 6+ 中英文字体，但**项目中没有任何 `@font-face` 或 webfont 引入**，最终回落到 PingFang SC / sans-serif，所有"标题加粗 -0.035em 字距"等精心调校的字体表现全部丢失。
6. **过度装饰**——`body::before` 和 `body::after` 叠加全屏柠檬绿网格 + 屏幕扫描线，加上每个卡片各自的 `::before`/`::after` 发光层，造成视觉噪点过密、缺乏呼吸感、信息层级被装饰盖过。
7. **Element Plus 覆盖不全**——`el-tabs--border-card`、`el-empty`、`el-skeleton`、`el-alert`、`el-popover`、`el-checkbox` / `el-radio`、`el-switch`、`el-progress`、`el-tree`、`el-collapse` 等组件未被覆盖，渲染时露出原版浅色 / 默认蓝色，与暗色主题脱节。
8. **侧栏 Logo 硬编码**——`SidebarInner.vue` 的 SVG 内 `fill="#c7ff45"`，写死柠檬绿，主题切换无法跟进。

**用户已确认的三个关键决策**：
- 🎨 **设计方向**：深空静谧 (Linear / Vercel / Stripe 风格，靛紫主调)
- 🔧 **改造范围**：全面重塑（设计系统 + 登录页 + 所有页面 + 所有 Bug）
- 📦 **资源引入**：允许 Webfont (Inter + Noto Sans SC + JetBrains Mono) 通过 Google Fonts CDN 引入，Lucide 暂缓

**预期产出**：一套以 `#6366f1`（靛紫）为主调、节制装饰、字体优雅、组件统一、登录页有质感的深空风格管理后台，无任何 CSS 变量未定义 / 主题冲突 / 颜色串戏的渲染缺陷。

---

## 二、问题清单（按严重度分级）

| 级别 | 类别 | 问题点 | 影响范围 |
|---|---|---|---|
| 🔴 P0 | Bug | `MatrixDashboard.vue` 使用 15 处未定义的 `var(--color-*)` CSS 变量 | 首页（默认登录后跳转的页面）整体崩坏 |
| 🔴 P0 | Bug | `index.html` 与 `global.scss` 双 `!important` 色板冲突，登录按钮渲染成橘黄 | 全站按钮 / 链接 / 强调色 |
| 🟠 P1 | 设计 | 两套设计语言（Matrix Ops vs 裸 el-card）并存 | 11 个视图页 |
| 🟠 P1 | 设计 | 登录页缺乏品牌叙事 | LoginView.vue |
| 🟡 P2 | 资源 | 字体声明但未加载 | 全站字体表现 |
| 🟡 P2 | 设计 | `body::before`/`::after` + 卡片装饰层叠加过密 | 整体视觉噪点 |
| 🟡 P2 | 覆盖 | Element Plus 多个常用组件未被主题覆盖 | tabs-border-card / empty / skeleton 等 |
| 🟢 P3 | 细节 | `SidebarInner.vue` 中 SVG `fill="#c7ff45"` 硬编码 | 侧栏 Logo |
| 🟢 P3 | 细节 | 装饰用 emoji 📊 出现在生产代码（MatrixDashboard 空态） | 个别视图 |

---

## 三、设计令牌（Design Tokens）

### 3.1 色板（深空靛紫 · Indigo Nebula）

```scss
// 背景层次（5 层）
$bg-deep:      #0a0b14;  // 最底层（页面）
$bg-base:      #0f1018;  // 主区
$bg-elevated:  #161823;  // 卡片
$bg-overlay:   #1c1f2e;  // Dialog / Popover
$bg-hover:     #232639;  // 悬停态

// 文本层次（4 阶）
$text-primary:     #e6e8f0;  // 主文本
$text-secondary:   #a0a4b8;  // 次要文本
$text-tertiary:    #6b7290;  // 辅助说明
$text-placeholder: #4a4f6b;  // 占位符

// 边框层次（4 阶 + Focus）
$border-subtle:  rgba(255, 255, 255, 0.06);  // 默认
$border-base:    rgba(255, 255, 255, 0.08);  // 卡片
$border-strong:  rgba(255, 255, 255, 0.12);  // 悬停
$border-focus:   rgba(99, 102, 241, 0.5);    // 聚焦环

// 强调色 - 靛紫（Indigo 7 阶）
$accent-50:  #eef0ff;
$accent-100: #e0e4ff;
$accent-300: #a5b0ff;
$accent-500: #6366f1;  // ★ 主强调
$accent-600: #5558e3;  // 主强调-按下
$accent-700: #4348c7;  // 深色文字 on light
$accent-glow: rgba(99, 102, 241, 0.35);  // 发光 / Focus Ring

// 语义色
$success: #10b981;  // emerald
$warning: #f59e0b;  // amber
$danger:  #ef4444;  // red
$info:    #06b6d4;  // cyan

// 平台色（保留品牌识别，仅用于平台徽标 / 数据图例）
$douyin:      #ffffff;
$kuaishou:    #ff6a21;
$xiaohongshu: #ff3d57;
$bilibili:    #00a1d6;
$weibo:       #ff8200;
$wechat:      #07c160;
```

### 3.2 字体

```scss
$font-sans: 'Inter', 'Noto Sans SC', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
$font-mono: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', Consolas, monospace;
// 字阶
$text-display: 56px;  // Hero
$text-h1:      32px;
$text-h2:      24px;
$text-h3:      18px;
$text-body:    14px;
$text-sm:      13px;
$text-xs:      12px;
// 行高 1.5 / 1.4 / 1.2，字距 -0.01em（标题）
```

### 3.3 间距 / 圆角 / 阴影 / 缓动

```scss
// 间距（4px 基线）
$space-1: 4px;  $space-2: 8px;  $space-3: 12px; $space-4: 16px;
$space-5: 20px; $space-6: 24px; $space-8: 32px; $space-10: 40px;
$space-12: 48px; $space-16: 64px; $space-20: 80px;

// 圆角
$radius-sm: 6px; $radius-md: 10px; $radius-lg: 14px; $radius-xl: 20px; $radius-full: 9999px;

// 阴影（节制，仅 3 级）
$shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
$shadow-md: 0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04);
$shadow-lg: 0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06);
$shadow-glow: 0 0 24px rgba(99, 102, 241, 0.18);  // 强调发光

// 缓动
$ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
$ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
$ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

// 布局
$sidebar-w: 240px;
$sidebar-collapsed-w: 64px;
$topbar-h: 56px;
$content-max-w: 1440px;
$content-padding: 32px;
```

### 3.4 CSS 自定义属性（运行时）

所有上述令牌**必须同时**以 `--color-*` / `--space-*` / `--radius-*` / `--ease-*` 形式注入 `:root, .dark`，让 `MatrixDashboard.vue` 内的 `var(--color-bg-elevated)` 等引用立即生效（P0 修复路径）。

---

## 四、关键文件与改造计划

### 4.1 设计系统层（4 个文件）

| 文件 | 操作 | 说明 |
|---|---|---|
| `frontend/src/assets/styles/_variables.scss` | **重写** | 替换为 §3 全套靛紫令牌；同时输出 SCSS 变量与 `:root { --color-* }` 双源 |
| `frontend/src/assets/styles/global.scss` | **重写** | 精简 body 背景（去掉柠檬绿网格 + 扫描线），保留极轻 vignette；移除所有 `!important` 主题色覆盖；保留排版、滚动条、动画工具类 |
| `frontend/src/assets/styles/_element-overrides.scss` | **新建** | 集中 Element Plus 主题覆盖（通过 CSS 变量，**不使用 !important**） |
| `frontend/src/main.ts` | **保持** | 仅确认 `import '@/assets/styles/global.scss'` 顺序在 Element Plus 之后 |

### 4.2 入口 HTML（1 个文件）

| 文件 | 操作 | 说明 |
|---|---|---|
| `frontend/index.html` | **大改** | 删除第 23-98 行整段冲突的 `<style>` 块；在 `<head>` 加入 Google Fonts 预连接 + Inter / Noto Sans SC / JetBrains Mono 引入；调整 `<meta name="theme-color">` 为 `#0a0b14` |

### 4.3 布局层（4 个文件）

| 文件 | 操作 | 说明 |
|---|---|---|
| `frontend/src/components/layout/AppLayout.vue` | **改造** | 移除多余装饰，建立 240px 侧栏 + 56px 顶栏 + 主区的简洁三栏 |
| `frontend/src/components/layout/Sidebar.vue` | **改造** | 配色靛紫，去除发光遮罩 |
| `frontend/src/components/layout/SidebarInner.vue` | **重构** | SVG Logo 改用 `currentColor`；菜单项 active 用细微 indigo 高亮 + 左侧 2px 竖条，不再叠 box-shadow 光晕；侧栏宽 240px |
| `frontend/src/components/layout/Topbar.vue` | **改造** | 高度 56px；左侧面包屑，右侧搜索（cmd+k 提示）+ 通知 + 头像；底部 1px hairline border |

### 4.4 通用组件（4 个文件）

| 文件 | 操作 | 说明 |
|---|---|---|
| `frontend/src/components/common/StatCard.vue` | **改造** | 统一卡片：`$bg-elevated` + `$border-base` + 节制 hover；标签 12px 大写 + 数字 32px tabular + 趋势 ±x.x% 用 success/danger 色 |
| `frontend/src/components/common/GlassCard.vue` | **改造** | 减薄玻璃感，去除厚重发光；保留 backdrop-filter blur(20px) 但降低饱和度 |
| `frontend/src/components/common/PlatformBadge.vue` | **保持** | 仅微调圆角与字距 |
| `frontend/src/components/common/AnimatedNumber.vue` | **保持** | 字体改为 `$font-mono` + tabular-nums |
| `frontend/src/composables/useChartTheme.ts` | **新建** | 输出 ECharts 主题对象（背景透明、网格细线 rgba 白 0.06、强调色 `$accent-500`、tooltip 暗色玻璃），所有 ECharts 实例统一调用 |

### 4.5 视图层（11 个文件）

| 文件 | 操作 | 说明 |
|---|---|---|
| `frontend/src/views/login/LoginView.vue` | **重写** | 左右分栏：左侧品牌墙（Logo + 标语 + 3 条核心价值 + 漂浮光斑）+ 右侧极简表单卡片；按钮使用 `$accent-500` 实色无渐变；移除冲突样式来源后橘黄 Bug 自然消失 |
| `frontend/src/views/dashboard/MatrixDashboard.vue` | **P0 修复 + 改造** | 因为已统一注入 `--color-*` CSS 变量（§3.4），原 15 处引用自动生效；同步替换 ECharts 配色为 `useChartTheme`；移除 emoji 📊 → `el-empty` 自定义图标 |
| `frontend/src/views/dashboard/DashboardView.vue` | **退役 / 保留** | 当前路由未指向；保留代码但加注释标记 deprecated（避免误用） |
| `frontend/src/views/accounts/AccountListView.vue` | **改造** | 顶部筛选条 + 表格视图 / 卡片视图切换；表格行高 56px，状态 tag 用语义色 |
| `frontend/src/views/accounts/AccountDetailView.vue` | **改造** | 头部信息条 + Tabs（概览 / 内容 / 数据 / 设置）|
| `frontend/src/views/analytics/AnalyticsView.vue` | **改造** | 时间范围 segment + 4 个核心 KPI + 2-3 个图表，统一 `useChartTheme` |
| `frontend/src/views/data-center/DataCenterView.vue` | **改造** | 数据源卡片 + 表格 + 导出按钮 |
| `frontend/src/views/team/TeamView.vue` | **改造** | 成员列表 + 角色 tag + 邀请抽屉 |
| `frontend/src/views/team/PermissionView.vue` | **改造** | 树形权限分组 |
| `frontend/src/views/platforms/PlatformManageView.vue` | **改造** | 卡片网格，每张卡显示平台 Logo / 接入数 / 操作 |
| `frontend/src/views/monetization/MonetizationView.vue` | **改造** | 商品 / 订单 Tabs + KPI 条 |
| `frontend/src/views/calendar/CalendarView.vue` | **改造** | 月历视图 + 当日发布卡片 |
| `frontend/src/views/ai/AIAssistantView.vue` | **改造** | 对话式 UI，消息气泡靛紫强调 |
| `frontend/src/views/mcp/MCPAssistantView.vue` | **改造** | 同上风格 |

---

## 五、关键页面详细规格

### 5.1 LoginView.vue（重写）

```
┌──────────────────────────────────┬─────────────────────────────┐
│                                  │                             │
│   [Logo]  MatrixFlow             │      欢迎回来               │
│                                  │      继续您的矩阵运营       │
│   一站式矩阵账号                 │                             │
│   管理 · 内容 · 数据             │   ┌─────────────────────┐   │
│                                  │   │ 用户名               │   │
│   ✓ 多平台账号统一接入           │   ├─────────────────────┤   │
│   ✓ 内容发布与日历调度           │   │ 密码                │   │
│   ✓ 数据中台与商业洞察           │   └─────────────────────┘   │
│                                  │                             │
│   （漂浮光斑 2 个 indigo blur）  │   [    登录    ]            │
│                                  │   忘记密码？  注册账号       │
│                                  │                             │
└──────────────────────────────────┴─────────────────────────────┘
   左 55% bg-base + glow             右 45% bg-elevated 卡片居中
```

要点：
- 移除 index.html 内冲突样式后，按钮自然变为 `$accent-500` 实色（不再橘）
- 左侧 2 个 320x320 `filter: blur(80px)` 的 `$accent-500` 圆形 + 1 个 480x480 `#0891b2` 圆形，做星云感
- 右侧卡片 400x520，`$radius-xl` + `$shadow-lg`
- 输入框聚焦时 `$border-focus` 2px ring，不要 `!important`

### 5.2 MatrixDashboard.vue（P0 修复 + 改造）

**修复路径**：因为 §3.4 已将所有 `$color-*` SCSS 变量同步注入为 `:root { --color-* }`，文件内 15 处 `var(--color-bg-elevated)` / `var(--color-border)` / `var(--color-accent)` / `var(--color-text-secondary)` 等会自动获得真实值。**额外只需替换三处**：
1. ECharts 系列 `itemStyle.color: '#4ade80'` → `var(--color-accent)`（或调用 `useChartTheme`）
2. 空态 emoji `'📊'` → `<el-empty :image-size="120">` 或 `<svg>` 内置图标
3. 顶部 KPI 卡用 `<StatCard>` 替代裸 `el-card`

### 5.3 AppLayout / Sidebar / Topbar（装饰收敛）

| 元素 | Before | After |
|---|---|---|
| body 背景 | 柠檬绿网格 + 扫描线 + 两处 radial | 纯 `$bg-deep` + 极轻 1 个 indigo radial（顶部左 8% 透明度） |
| 侧栏 active | 玻璃背景 + box-shadow glow | 文字 `$accent-500` + 背景 `rgba(99,102,241,0.08)` + 左 2px 竖条 |
| 卡片 hover | translateY + 边框变色 + box-shadow | translateY(-2px) + 边框 `$border-strong`，移除 glow |
| 字体 | 未加载的中文字体回落 | Inter (英数) + Noto Sans SC (中文) |

---

## 六、Element Plus 主题覆盖策略

**核心原则**：所有覆盖在 `_element-overrides.scss`，通过覆盖 `--el-*` CSS 变量实现，**不使用 `!important`，不直接覆盖 class**（极少数边界 case 除外）。

```scss
:root, .dark {
  --el-color-primary: #{$accent-500};
  --el-color-primary-light-3: #{$accent-300};
  --el-color-primary-dark-2: #{$accent-600};
  --el-color-success: #{$success};
  --el-color-warning: #{$warning};
  --el-color-danger: #{$danger};
  --el-color-info: #{$info};
  --el-bg-color: #{$bg-base};
  --el-bg-color-page: #{$bg-deep};
  --el-bg-color-overlay: #{$bg-overlay};
  --el-text-color-primary: #{$text-primary};
  --el-text-color-regular: #{$text-secondary};
  --el-text-color-placeholder: #{$text-placeholder};
  --el-border-color: #{$border-base};
  --el-border-color-light: #{$border-subtle};
  --el-fill-color: rgba(255, 255, 255, 0.04);
  --el-fill-color-light: rgba(255, 255, 255, 0.06);
  --el-mask-color: rgba(10, 11, 20, 0.7);
  --el-border-radius-base: #{$radius-md};
  --el-font-family: #{$font-sans};
}
```

需要额外样式覆盖的 20 个常用组件：`el-button`（plain/text 三态）、`el-input`/`el-textarea`、`el-select`、`el-dropdown`、`el-table`、`el-pagination`、`el-tabs`（含 border-card）、`el-card`、`el-dialog`、`el-message`、`el-message-box`、`el-notification`、`el-tag`、`el-badge`、`el-empty`、`el-skeleton`、`el-alert`、`el-popover`、`el-switch`、`el-progress`、`el-checkbox`/`el-radio`/`el-radio-button`、`el-form-item__label`、`el-breadcrumb`、`el-tree`、`el-collapse`、`el-date-picker` 面板。

---

## 七、资源引入

### 7.1 Webfont

在 `frontend/index.html` `<head>` 加入：

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap"
  rel="stylesheet"
/>
```

降级方案：浏览器无法访问 Google CDN 时，自动回落到 `-apple-system, PingFang SC, sans-serif`。若用户后续要求离线可用，再切换到 `@fontsource/inter` + `@fontsource/noto-sans-sc` 通过 npm 自托管（本次先用 CDN）。

### 7.2 图标

继续使用 `@element-plus/icons-vue`（已在 `package.json`），不引入 Lucide。

---

## 八、实施任务（14 步顺序）

> 每完成 1 步即可在浏览器肉眼验证，避免大爆炸式提交。

| # | 任务 | 关键文件 | 验证 |
|---|------|---------|------|
| 1 | 重写设计令牌（SCSS + CSS 变量双源） | `_variables.scss` | `npm run build` 无 SCSS 错误 |
| 2 | 新建 `_element-overrides.scss`，重写 `global.scss`（去 !important / 减装饰） | `global.scss`, `_element-overrides.scss`, `main.ts` | 主题靛紫，无 ::before 网格 |
| 3 | 改 `index.html`（删冲突 style + 加 Webfont + meta） | `index.html` | 按钮颜色不再橘黄 |
| 4 | **🔴 P0：MatrixDashboard CSS 变量修复 + ECharts 主题 + 空态去 emoji** | `MatrixDashboard.vue`, `useChartTheme.ts` | 矩阵数据页恢复完整渲染 |
| 5 | 重构 AppLayout / Sidebar / SidebarInner / Topbar | layout/*.vue | 三栏布局 240/56/auto |
| 6 | 重写 LoginView（双栏品牌墙） | `LoginView.vue` | 登录页有质感、按钮靛紫 |
| 7 | 统一 StatCard / GlassCard / PlatformBadge / AnimatedNumber | common/*.vue | 卡片视觉一致 |
| 8 | 迁移 AccountListView + AccountDetailView | accounts/*.vue | 表格 + 详情和谐 |
| 9 | 迁移 AnalyticsView + DataCenterView | analytics/, data-center/ | 图表用 useChartTheme |
| 10 | 迁移 TeamView + PermissionView + PlatformManageView | team/, platforms/ | 卡片网格统一 |
| 11 | 迁移 MonetizationView + CalendarView | monetization/, calendar/ | KPI + 日历样式 |
| 12 | 迁移 AIAssistantView + MCPAssistantView | ai/, mcp/ | 对话气泡风格 |
| 13 | 清理 deprecated DashboardView，移除未用 SCSS 工具类、未用 emoji | dashboard/, global.scss | grep 确认无 var(--color-undefined) |
| 14 | 全站回归：登录 → 仪表盘 → 各模块跳转，含 dialog / message / table / form / dropdown / tag | 所有 | 无视觉回归 |

---

## 九、关键约束与风险

| 项 | 约束 |
|---|---|
| 不动后端 | 不修改 `backend/`、`backend_new/`、`desktop-companion/` 任何文件 |
| 不动路由结构 | `router/index.ts` 路径与 name 保持不变，仅可调 `meta.icon` |
| 不动 Store | `store/` 下接口数据流不动 |
| 不动业务 API | `api/` 调用签名不动 |
| 浏览器兼容 | 仅保证主流 Chrome / Edge 最新版（与现状一致） |
| 字体降级 | 国内网络 Google Fonts 不可达时自动回落系统字体，不阻塞渲染 |
| 双源令牌一致性 | SCSS 变量与 CSS 变量必须一一对应，避免再次出现"声明了没生效" |
| Element Plus 升级风险 | 覆盖通过 `--el-*` 变量为主，避免硬覆盖 class 名以适配未来 minor 版本 |

---

## 十、验证（Verification）

### 10.1 构建验证
```powershell
cd c:\Users\EDY\jujuju\frontend
npm run build
```
预期：无 SCSS 报错、无 `Cannot find module`、产物体积同量级。

### 10.2 开发服务器
```powershell
cd c:\Users\EDY\jujuju\frontend
npm run dev
```
浏览器打开 `http://localhost:5173`。

### 10.3 手动回归清单
- [ ] `/login` 登录按钮为靛紫 `#6366f1`（**不再橘黄**），输入框聚焦有靛紫 ring
- [ ] 登录后 `/dashboard` 矩阵数据页：KPI 卡片有背景、有边框、文字色正常（**不再透明塌陷**）
- [ ] 侧栏 active 项左侧 2px 竖条 + 靛紫文字，无柠檬绿
- [ ] 顶栏面包屑、搜索、头像三栏对齐
- [ ] Dialog / Message / Notification / Dropdown 弹层为深空玻璃风
- [ ] 表格行 hover 有微弱靛紫高亮
- [ ] Tag primary 为靛紫，success/warning/danger 语义色正确
- [ ] 切换到 Account / Analytics / Team / Platform / Calendar / Monetization 任一页面，无裸 el-card，无样式断层
- [ ] 浏览器 DevTools Console 无 CSS warning
- [ ] 浏览器 Network 面板：Inter / Noto Sans SC 字体成功加载（或确认降级到系统字体）

### 10.4 验证脚本（可选）
```powershell
cd c:\Users\EDY\jujuju\frontend
# 确认无未定义的 CSS 变量
Select-String -Path src\views\**\*.vue -Pattern "var\(--color-" | ForEach-Object { $_.Matches.Value } | Sort-Object -Unique
# 输出列表应全部在 _variables.scss 的 :root 中定义
```

---

## 十一、交付物

1. 重写的设计令牌系统（`_variables.scss` + `_element-overrides.scss`）
2. 精简的全局样式（`global.scss`）
3. 清洁的入口 HTML（`index.html`）+ Webfont 引入
4. 4 个布局组件改造（AppLayout / Sidebar / SidebarInner / Topbar）
5. 重写的登录页（LoginView）
6. P0 修复的矩阵数据页（MatrixDashboard）
7. 统一风格的 4 个通用组件 + 1 个新 `useChartTheme.ts`
8. 11 个业务视图的视觉迁移
9. 全站回归通过的深空静谧风格 v1.0
