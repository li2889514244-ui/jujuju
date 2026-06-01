"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_MCP_TOOLS = void 0;
exports.getToolByName = getToolByName;
const queryAccountDataTool = {
    name: 'query_account_data',
    description: '查询指定账号在某个时间段内的详细数据，包括粉丝、播放量、点赞、评论、分享、GMV、订单等。支持按平台过滤。',
    inputSchema: {
        type: 'object',
        properties: {
            accountName: {
                type: 'string',
                description: '账号昵称或账号ID，支持模糊匹配',
            },
            platform: {
                type: 'string',
                description: '平台名称，可选：DOUYIN/KUAISHOU/XIAOHONGSHU/BILIBILI/WEIBO/WECHAT_VIDEO/TIKTOK',
            },
            startDate: {
                type: 'string',
                description: '开始日期，格式 YYYY-MM-DD',
            },
            endDate: {
                type: 'string',
                description: '结束日期，格式 YYYY-MM-DD',
            },
        },
        required: ['accountName', 'startDate', 'endDate'],
    },
};
const getTopRankingsTool = {
    name: 'get_top_rankings',
    description: '获取指定指标的排行榜，按降序排列。支持 GMV、粉丝数、点赞数、播放量等维度，可按周/月/总计筛选。',
    inputSchema: {
        type: 'object',
        properties: {
            metric: {
                type: 'string',
                enum: ['gmv', 'followers', 'likes', 'views'],
                description: '排行指标',
            },
            period: {
                type: 'string',
                enum: ['week', 'month', 'total'],
                description: '统计周期：week=近7天，month=近30天，total=全部历史',
            },
            limit: {
                type: 'number',
                description: '返回数量，默认 10，最大 100',
                default: 10,
            },
        },
        required: ['metric', 'period'],
    },
};
const compareAccountsTool = {
    name: 'compare_accounts',
    description: '对比多个账号在同一指标上的表现，返回每个账号的数据及差异分析。适用于竞品分析或团队内部账号对比。',
    inputSchema: {
        type: 'object',
        properties: {
            accountNames: {
                type: 'array',
                items: { type: 'string' },
                description: '账号昵称列表，至少 2 个，最多 10 个',
            },
            metric: {
                type: 'string',
                description: '对比指标：followers/views/likes/comments/shares/gmv/orders',
            },
            startDate: {
                type: 'string',
                description: '开始日期，格式 YYYY-MM-DD',
            },
            endDate: {
                type: 'string',
                description: '结束日期，格式 YYYY-MM-DD',
            },
        },
        required: ['accountNames', 'metric', 'startDate', 'endDate'],
    },
};
const generateReportTool = {
    name: 'generate_report',
    description: '生成周报或月报，汇总指定账号（或全平台）的数据，包括粉丝增长、播放量、互动率、GMV 等关键指标。',
    inputSchema: {
        type: 'object',
        properties: {
            accountName: {
                type: 'string',
                description: '账号昵称，不传则汇总全平台所有账号',
            },
            period: {
                type: 'string',
                enum: ['week', 'month'],
                description: '报表周期：week=近7天，month=近30天',
            },
        },
        required: ['period'],
    },
};
const exportDataTool = {
    name: 'export_data',
    description: '导出指定账号在时间段内的数据为 CSV 格式。可选指定导出列，默认导出全部字段。',
    inputSchema: {
        type: 'object',
        properties: {
            accountName: {
                type: 'string',
                description: '账号昵称，不传则导出全平台数据',
            },
            startDate: {
                type: 'string',
                description: '开始日期，格式 YYYY-MM-DD',
            },
            endDate: {
                type: 'string',
                description: '结束日期，格式 YYYY-MM-DD',
            },
            columns: {
                type: 'array',
                items: { type: 'string' },
                description: '导出列名，可选：date/platform/nickname/followers/views/likes/comments/shares/revenue/gmv/orders/commission/buyerCount。不传则全部导出。',
            },
        },
        required: ['startDate', 'endDate'],
    },
};
exports.ALL_MCP_TOOLS = [
    queryAccountDataTool,
    getTopRankingsTool,
    compareAccountsTool,
    generateReportTool,
    exportDataTool,
];
function getToolByName(name) {
    return exports.ALL_MCP_TOOLS.find((t) => t.name === name);
}
//# sourceMappingURL=mcp-tools.js.map