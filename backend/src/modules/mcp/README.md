# MCP 数据查询模块 (MatrixFlow MCP Server)

## 概述

基于 Model Context Protocol (MCP) 的数据查询服务，集成在 MatrixFlow 后端中。用户通过自然语言即可查询数据库中的账号数据、排行榜、生成报表、导出 CSV，所有操作均为只读。

## 目录结构

```
src/modules/mcp/
├── mcp.module.ts      # NestJS Module 定义
├── mcp.controller.ts  # HTTP REST 端点
├── mcp.service.ts     # 核心逻辑：自然语言匹配、Tool 调度、数据查询
├── mcp-tools.ts       # MCP Tool 定义（5 个 Tool）
└── README.md          # 本文档
```

## API 端点

### POST `/api/mcp/query`

处理自然语言查询或直接 Tool 调用。

**请求体**：

```json
{
  "query": "查询张三最近一周的数据",
  "toolName": "query_account_data",  // 可选：直接指定 Tool
  "params": {}                        // 可选：额外参数
}
```

**响应格式**：

```json
{
  "success": true,
  "data": { ... },
  "toolUsed": "query_account_data"
}
```

### GET `/api/mcp/tools`

返回所有已注册的 MCP Tool 定义。

## 支持的 Tool

| # | Tool 名称 | 功能 | 必填参数 |
|---|----------|------|---------|
| 1 | `query_account_data` | 查询账号在时间段内的详细数据 | accountName, startDate, endDate |
| 2 | `get_top_rankings` | 获取排行榜（GMV/粉丝/点赞/播放） | metric, period |
| 3 | `compare_accounts` | 对比多个账号的指标表现 | accountNames(≥2), metric, startDate, endDate |
| 4 | `generate_report` | 生成周报/月报（支持全平台） | period |
| 5 | `export_data` | 导出 CSV 格式数据 | startDate, endDate |

## 自然语言示例

| 输入 | 匹配 Tool |
|------|----------|
| "查张三最近一周的数据" | query_account_data |
| "小红书本月数据明细" | query_account_data |
| "Top10 粉丝最多的账号" | get_top_rankings |
| "本月GMV排行前20" | get_top_rankings |
| "对比张三和李四的粉丝数 2025-05-01 到 2025-05-31" | compare_accounts |
| "生成周报" / "本月汇总" | generate_report |
| "生成本周数据报表" | generate_report |
| "导出5月1日到5月31日的数据" | export_data |
| "下载抖音账号数据CSV" | export_data |

## 安全设计

- **只读保证**：所有 Prisma 查询仅使用 `findMany` / `findFirst`，不涉及 `create` / `update` / `delete` / `deleteMany`
- **参数化查询**：所有数据库操作通过 Prisma ORM 参数绑定，杜绝 SQL 注入
- **统一错误处理**：`try/catch` 包裹所有查询逻辑，返回 `{ success: false, error: "..." }` 格式
- **JWT 认证**：本模块受全局 `JwtAuthGuard` 保护，需携带有效 Bearer Token 访问

## 依赖

- `@modelcontextprotocol/sdk`: MCP 协议 SDK
- `@prisma/client`: 数据库 ORM（已存在）

## 测试

```bash
# 启动后端
cd backend && npm run dev

# 列出所有 Tool
curl http://localhost:3000/api/mcp/tools \
  -H "Authorization: Bearer <token>"

# 自然语言查询
curl -X POST http://localhost:3000/api/mcp/query \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "本月GMV排行前5"}'
```