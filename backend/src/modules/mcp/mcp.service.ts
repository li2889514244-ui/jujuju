import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ALL_MCP_TOOLS, getToolByName, McpTool } from './mcp-tools';

// ==================== 类型定义 ====================

export interface McpQueryRequest {
  /** 自然语言查询文本 */
  query: string;
  /** 可选：直接指定 toolName + params，跳过自然语言匹配 */
  toolName?: string;
  params?: Record<string, unknown>;
}

export interface McpQueryResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  /** 匹配到的 Tool 名称（调试用） */
  toolUsed?: string;
}

interface ToolMatchResult {
  tool: McpTool;
  extractedParams: Record<string, unknown>;
  confidence: number;
}

// ==================== Service ====================

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---- 公开入口 ----

  /** 获取所有已注册的 Tool 定义 */
  getTools(): McpTool[] {
    return ALL_MCP_TOOLS;
  }

  /** 处理查询请求：自然语言 → Tool 匹配 → 执行 → 返回结果 */
  async handleQuery(req: McpQueryRequest): Promise<McpQueryResponse> {
    try {
      // 如果直接指定了 toolName，跳过自然语言匹配
      let toolName = req.toolName;
      let params = req.params || {};

      if (!toolName && req.query) {
        const match = this.matchTool(req.query);
        if (!match) {
          return {
            success: false,
            error: `无法理解查询意图。支持的操作：${ALL_MCP_TOOLS.map((t) => t.name).join('、')}`,
          };
        }
        toolName = match.tool.name;
        params = { ...match.extractedParams, ...params };
      }

      if (!toolName) {
        return { success: false, error: '请提供 query 或 toolName' };
      }

      // 执行对应 Tool
      const result = await this.executeTool(toolName, params);

      return {
        success: true,
        data: result,
        toolUsed: toolName,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`Query failed: ${message}`, error instanceof Error ? error.stack : '');
      return { success: false, error: message };
    }
  }

  // ---- 自然语言匹配 ----

  private matchTool(query: string): ToolMatchResult | null {
    const q = query.toLowerCase();

    const patterns: Array<{
      keywords: string[];
      toolName: string;
      paramExtractor: (q: string) => Record<string, unknown>;
    }> = [
      // query_account_data: "查XXX账号7月数据" "张三最近一周的数据"
      {
        keywords: ['数据', '账号', '查询', '明细', '表现'],
        toolName: 'query_account_data',
        paramExtractor: (q) => {
          const params: Record<string, unknown> = {};
          // 尝试提取账号名
          const accountMatch = q.match(/[""](.+?)[""]|'(.+?)'|账号[：:]?\s*(\S+)/);
          if (accountMatch) {
            params.accountName = accountMatch[1] || accountMatch[2] || accountMatch[3];
          }
          // 尝试提取日期
          const dateRange = this.extractDateRange(q);
          if (dateRange.startDate) params.startDate = dateRange.startDate;
          if (dateRange.endDate) params.endDate = dateRange.endDate;
          // 平台
          const platform = this.extractPlatform(q);
          if (platform) params.platform = platform;
          return params;
        },
      },
      // get_top_rankings: "排行榜" "GMV排名" "粉丝最多的账号"
      {
        keywords: ['排行', '排名', 'top', '榜', '最多', '最高', '前十'],
        toolName: 'get_top_rankings',
        paramExtractor: (q) => {
          const params: Record<string, unknown> = { limit: 10 };
          if (q.includes('gmv') || q.includes('交易') || q.includes('销售额'))
            params.metric = 'gmv';
          else if (q.includes('粉丝') || q.includes('关注'))
            params.metric = 'followers';
          else if (q.includes('点赞') || q.includes('赞'))
            params.metric = 'likes';
          else if (q.includes('播放') || q.includes('观看'))
            params.metric = 'views';
          else params.metric = 'followers';

          if (q.includes('周') || q.includes('7天') || q.includes('七天')) params.period = 'week';
          else if (q.includes('月') || q.includes('30天')) params.period = 'month';
          else params.period = 'total';

          const numMatch = q.match(/(\d+)\s*(个|名|条|位)/);
          if (numMatch) params.limit = parseInt(numMatch[1], 10);
          return params;
        },
      },
      // compare_accounts: "对比张三和李四" "A和B的数据对比"
      {
        keywords: ['对比', '比较', 'vs', '对比分析', '竞品'],
        toolName: 'compare_accounts',
        paramExtractor: (q) => {
          const params: Record<string, unknown> = {};
          // 提取对比指标
          if (q.includes('粉丝')) params.metric = 'followers';
          else if (q.includes('gmv') || q.includes('销售额')) params.metric = 'gmv';
          else if (q.includes('点赞')) params.metric = 'likes';
          else if (q.includes('播放')) params.metric = 'views';
          else params.metric = 'followers';

          const dateRange = this.extractDateRange(q);
          if (dateRange.startDate) params.startDate = dateRange.startDate;
          if (dateRange.endDate) params.endDate = dateRange.endDate;

          // 提取账号名列表
          const names: string[] = [];
          // 匹配 "张三和李四" "对比A和B" 格式
          const andMatch = q.match(/对比\s*(\S+?)\s*[和与vs]\s*(\S+)/);
          if (andMatch) {
            names.push(andMatch[1], andMatch[2]);
          }
          params.accountNames = names.length >= 2 ? names : [];
          return params;
        },
      },
      // generate_report: "生成周报" "月报" "本周总结"
      {
        keywords: ['报告', '报表', '周报', '月报', '总结', '汇总', '概览'],
        toolName: 'generate_report',
        paramExtractor: (q) => {
          const params: Record<string, unknown> = {};
          params.period = q.includes('月') || q.includes('30天') ? 'month' : 'week';
          // 尝试提取账号名
          const accountMatch = q.match(/[""](.+?)[""]|'(.+?)'|账号[：:]?\s*(\S+)/);
          if (accountMatch) {
            params.accountName = accountMatch[1] || accountMatch[2] || accountMatch[3];
          }
          return params;
        },
      },
      // export_data: "导出" "下载CSV"
      {
        keywords: ['导出', '下载', 'csv', 'excel', '表格'],
        toolName: 'export_data',
        paramExtractor: (q) => {
          const params: Record<string, unknown> = {};
          const dateRange = this.extractDateRange(q);
          if (dateRange.startDate) params.startDate = dateRange.startDate;
          if (dateRange.endDate) params.endDate = dateRange.endDate;
          const accountMatch = q.match(/[""](.+?)[""]|'(.+?)'|账号[：:]?\s*(\S+)/);
          if (accountMatch) {
            params.accountName = accountMatch[1] || accountMatch[2] || accountMatch[3];
          }
          return params;
        },
      },
    ];

    let bestMatch: ToolMatchResult | null = null;
    let bestScore = 0;

    for (const pattern of patterns) {
      const hits = pattern.keywords.filter((kw) => q.includes(kw)).length;
      const score = hits / pattern.keywords.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          tool: getToolByName(pattern.toolName)!,
          extractedParams: pattern.paramExtractor(q),
          confidence: score,
        };
      }
    }

    // 只有匹配分数 > 0 才返回
    return bestScore > 0 ? bestMatch : null;
  }

  private extractDateRange(q: string): { startDate?: string; endDate?: string } {
    const result: { startDate?: string; endDate?: string } = {};

    const now = new Date();

    // 匹配自然语言时间
    if (q.includes('今天')) {
      result.startDate = this.formatDate(now);
      result.endDate = this.formatDate(now);
    } else if (q.includes('昨天')) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      result.startDate = this.formatDate(yesterday);
      result.endDate = this.formatDate(yesterday);
    } else if (q.includes('本周') || q.includes('这周') || q.includes('7天') || q.includes('七天')) {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      result.startDate = this.formatDate(weekAgo);
      result.endDate = this.formatDate(now);
    } else if (q.includes('本月') || q.includes('这个月') || q.includes('30天')) {
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 30);
      result.startDate = this.formatDate(monthAgo);
      result.endDate = this.formatDate(now);
    } else if (q.includes('上月') || q.includes('上个月')) {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      result.startDate = this.formatDate(start);
      result.endDate = this.formatDate(end);
    }

    // 匹配 ISO 日期格式 YYYY-MM-DD
    const isoMatch = q.match(/(\d{4}-\d{2}-\d{2})\s*[到至-]\s*(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) {
      result.startDate = isoMatch[1];
      result.endDate = isoMatch[2];
    }

    return result;
  }

  private extractPlatform(q: string): string | undefined {
    const map: Record<string, string> = {
      抖音: 'DOUYIN',
      douyin: 'DOUYIN',
      快手: 'KUAISHOU',
      kuaishou: 'KUAISHOU',
      小红书: 'XIAOHONGSHU',
      小红薯: 'XIAOHONGSHU',
      xiaohongshu: 'XIAOHONGSHU',
      b站: 'BILIBILI',
      bilibili: 'BILIBILI',
      哔哩哔哩: 'BILIBILI',
      微博: 'WEIBO',
      weibo: 'WEIBO',
      视频号: 'WECHAT_VIDEO',
      tiktok: 'TIKTOK',
    };
    for (const [keyword, platform] of Object.entries(map)) {
      if (q.toLowerCase().includes(keyword.toLowerCase())) return platform;
    }
    return undefined;
  }

  private formatDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  // ---- Tool 执行器 ----

  private async executeTool(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    switch (toolName) {
      case 'query_account_data':
        return this.queryAccountData(params);
      case 'get_top_rankings':
        return this.getTopRankings(params);
      case 'compare_accounts':
        return this.compareAccounts(params);
      case 'generate_report':
        return this.generateReport(params);
      case 'export_data':
        return this.exportData(params);
      default:
        throw new Error(`未知的 Tool: ${toolName}`);
    }
  }

  // ==================== Tool 1: query_account_data ====================

  private async queryAccountData(params: Record<string, unknown>) {
    const accountName = String(params.accountName || '');
    const platform = params.platform ? String(params.platform).toUpperCase() : undefined;
    const startDate = String(params.startDate || '');
    const endDate = String(params.endDate || '');

    if (!accountName) throw new Error('accountName 参数为必填');
    if (!startDate || !endDate) throw new Error('startDate 和 endDate 参数为必填');

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // 参数化查询：查找匹配账号
    const accounts = await this.prisma.account.findMany({
      where: {
        nickname: { contains: accountName },
        ...(platform ? { platform: platform as any } : {}),
      },
      select: {
        id: true,
        nickname: true,
        platform: true,
        avatar: true,
        followers: true,
        likes: true,
        following: true,
      },
    });

    if (accounts.length === 0) {
      return { accounts: [], message: `未找到匹配 "${accountName}" 的账号` };
    }

    // 查询 DailyStats
    const accountIds = accounts.map((a) => a.id);
    const stats = await this.prisma.dailyStats.findMany({
      where: {
        accountId: { in: accountIds },
        date: { gte: start, lte: end },
      },
      orderBy: { date: 'asc' },
    });

    // 按账号聚合
    const result = accounts.map((acc) => {
      const accStats = stats.filter((s) => s.accountId === acc.id);
      const aggregated = {
        totalViews: accStats.reduce((sum, s) => sum + s.views, 0),
        totalLikes: accStats.reduce((sum, s) => sum + s.likes, 0),
        totalComments: accStats.reduce((sum, s) => sum + s.comments, 0),
        totalShares: accStats.reduce((sum, s) => sum + s.shares, 0),
        totalRevenue: accStats.reduce((sum, s) => sum + s.revenue, 0),
        totalGmv: accStats.reduce((sum, s) => sum + s.gmv, 0),
        totalOrders: accStats.reduce((sum, s) => sum + s.orders, 0),
        totalBuyerCount: accStats.reduce((sum, s) => sum + s.buyerCount, 0),
        followerChange:
          accStats.length > 0 ? accStats[accStats.length - 1].followers - accStats[0].followers : 0,
      };
      return {
        id: acc.id,
        nickname: acc.nickname,
        platform: acc.platform,
        avatar: acc.avatar,
        currentFollowers: acc.followers,
        ...aggregated,
        dailyStats: accStats.map((s) => ({
          date: this.formatDate(s.date),
          followers: s.followers,
          views: s.views,
          likes: s.likes,
          comments: s.comments,
          shares: s.shares,
          followersIncrement: s.followersIncrement,
          viewsIncrement: s.viewsIncrement,
          likesIncrement: s.likesIncrement,
          commentsIncrement: s.commentsIncrement,
          sharesIncrement: s.sharesIncrement,
          unfollows: s.unfollows,
          revenue: s.revenue,
          gmv: s.gmv,
          orders: s.orders,
        })),
      };
    });

    return { accounts: result, total: result.length, period: { start: startDate, end: endDate } };
  }

  // ==================== Tool 2: get_top_rankings ====================

  private async getTopRankings(params: Record<string, unknown>) {
    const metric = String(params.metric || 'followers');
    const period = String(params.period || 'total');
    const limit = Math.min(Number(params.limit) || 10, 100);

    let startDate: Date;

    if (period === 'week') {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
    } else {
      // total: 不限时间
      startDate = new Date(0);
    }

    const allAccounts = await this.prisma.account.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, nickname: true, platform: true, avatar: true, followers: true, likes: true },
    });

    if (metric === 'followers') {
      // 粉丝直接取 account.followers
      const sorted = allAccounts
        .sort((a, b) => b.followers - a.followers)
        .slice(0, limit)
        .map((a, i) => ({
          rank: i + 1,
          accountId: a.id,
          nickname: a.nickname,
          platform: a.platform,
          avatar: a.avatar,
          value: a.followers,
        }));
      return { metric: 'followers', period, rankings: sorted, total: allAccounts.length };
    }

    // 其他指标从 DailyStats 聚合
    const accountIds = allAccounts.map((a) => a.id);
    const stats = await this.prisma.dailyStats.findMany({
      where: {
        accountId: { in: accountIds },
        date: period !== 'total' ? { gte: startDate } : undefined,
      },
    });

    const aggMap: Record<string, number> = {};
    for (const s of stats) {
      const val =
        metric === 'views'
          ? s.views
          : metric === 'likes'
            ? s.likes
            : metric === 'gmv'
              ? s.gmv
              : 0;
      aggMap[s.accountId] = (aggMap[s.accountId] || 0) + val;
    }

    const sorted = allAccounts
      .map((a) => ({ ...a, aggValue: aggMap[a.id] || 0 }))
      .sort((a, b) => b.aggValue - a.aggValue)
      .slice(0, limit)
      .map((a, i) => ({
        rank: i + 1,
        accountId: a.id,
        nickname: a.nickname,
        platform: a.platform,
        avatar: a.avatar,
        value: a.aggValue,
      }));

    return { metric, period, rankings: sorted, total: allAccounts.length };
  }

  // ==================== Tool 3: compare_accounts ====================

  private async compareAccounts(params: Record<string, unknown>) {
    const accountNames = (params.accountNames as string[]) || [];
    const metric = String(params.metric || 'followers');
    const startDate = String(params.startDate || '');
    const endDate = String(params.endDate || '');

    if (accountNames.length < 2) throw new Error('至少需要 2 个账号进行对比');
    if (accountNames.length > 10) throw new Error('最多对比 10 个账号');

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const accounts = await this.prisma.account.findMany({
      where: {
        nickname: { in: accountNames },
      },
      select: { id: true, nickname: true, platform: true, followers: true, likes: true },
    });

    if (accounts.length === 0) {
      return { message: '未找到匹配的账号', accounts: [] };
    }

    const accountIds = accounts.map((a) => a.id);

    const stats = await this.prisma.dailyStats.findMany({
      where: { accountId: { in: accountIds }, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });

    const results = accounts.map((acc) => {
      const accStats = stats.filter((s) => s.accountId === acc.id);
      const value = accStats.reduce((sum, s) => {
        const key = metric as keyof typeof s;
        const val = typeof s[key] === 'number' ? (s[key] as number) : 0;
        return sum + val;
      }, 0);
      return { nickname: acc.nickname, platform: acc.platform, metric, value };
    });

    // 计算差异
    if (results.length >= 2) {
      const max = Math.max(...results.map((r) => r.value));
      const min = Math.min(...results.map((r) => r.value));
      const diff = max - min;
      const maxAccount = results.find((r) => r.value === max)?.nickname;
      results.forEach((r) => {
        (r as any).diffFromTop = max - r.value;
        (r as any).percentageOfTop = max > 0 ? ((r.value / max) * 100).toFixed(1) + '%' : '0%';
      });
    }

    return { metric, period: { start: startDate, end: endDate }, comparison: results };
  }

  // ==================== Tool 4: generate_report ====================

  private async generateReport(params: Record<string, unknown>) {
    const accountName = params.accountName ? String(params.accountName) : undefined;
    const period = String(params.period || 'week');

    const now = new Date();
    const startDate = new Date();
    const days = period === 'month' ? 30 : 7;
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // 上周/上月同期用于环比
    const prevStart = new Date(startDate);
    prevStart.setDate(prevStart.getDate() - days);
    const prevEnd = new Date(startDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    prevEnd.setHours(23, 59, 59, 999);

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    // 查账号
    const accountWhere = accountName
      ? { nickname: { contains: accountName } }
      : { status: 'ACTIVE' as const };

    const accounts = await this.prisma.account.findMany({
      where: accountWhere,
      select: { id: true, nickname: true, platform: true, avatar: true, followers: true, likes: true },
    });

    if (accounts.length === 0) {
      return { message: '没有找到匹配的账号', report: null };
    }

    const accountIds = accounts.map((a) => a.id);

    // 当期数据
    const currentStats = await this.prisma.dailyStats.findMany({
      where: { accountId: { in: accountIds }, date: { gte: startDate, lte: endDate } },
    });

    // 上期数据（环比）
    const prevStats = await this.prisma.dailyStats.findMany({
      where: { accountId: { in: accountIds }, date: { gte: prevStart, lte: prevEnd } },
    });

    const aggregate = (stats: typeof currentStats) => ({
      totalViews: stats.reduce((s, x) => s + x.views, 0),
      totalLikes: stats.reduce((s, x) => s + x.likes, 0),
      totalComments: stats.reduce((s, x) => s + x.comments, 0),
      totalShares: stats.reduce((s, x) => s + x.shares, 0),
      totalRevenue: stats.reduce((s, x) => s + x.revenue, 0),
      totalGmv: stats.reduce((s, x) => s + x.gmv, 0),
      totalOrders: stats.reduce((s, x) => s + x.orders, 0),
      totalBuyerCount: stats.reduce((s, x) => s + x.buyerCount, 0),
      followerChange: stats.length > 0
        ? stats.reduce((sum, s) => sum + s.followers, 0) / stats.length - (stats[0]?.followers || 0)
        : 0,
    });

    const current = aggregate(currentStats);
    const prev = aggregate(prevStats);

    const wowChange = {
      views: prev.totalViews > 0 ? ((current.totalViews - prev.totalViews) / prev.totalViews * 100).toFixed(1) : 'N/A',
      likes: prev.totalLikes > 0 ? ((current.totalLikes - prev.totalLikes) / prev.totalLikes * 100).toFixed(1) : 'N/A',
      gmv: prev.totalGmv > 0 ? ((current.totalGmv - prev.totalGmv) / prev.totalGmv * 100).toFixed(1) : 'N/A',
      revenue: prev.totalRevenue > 0 ? ((current.totalRevenue - prev.totalRevenue) / prev.totalRevenue * 100).toFixed(1) : 'N/A',
    };

    // Top 内容（PostStats）
    const topPosts = await this.prisma.post.findMany({
      where: {
        accountId: { in: accountIds },
        status: 'PUBLISHED',
        publishAt: { gte: startDate, lte: endDate },
      },
      include: { stats: true },
      orderBy: { publishAt: 'desc' },
      take: 10,
    });

    const topByViews = topPosts
      .filter((p) => p.stats)
      .sort((a, b) => (b.stats?.views || 0) - (a.stats?.views || 0))
      .slice(0, 5)
      .map((p) => ({
        title: p.title,
        views: p.stats?.views || 0,
        likes: p.stats?.likes || 0,
        completionRate: p.stats?.completionRate || 0,
        danmakuCount: p.stats?.danmakuCount || 0,
        avgPlayDuration: p.stats?.avgPlayDuration || 0,
        publishedAt: p.publishAt,
      }));

    return {
      reportType: period === 'month' ? '月报' : '周报',
      period: {
        start: this.formatDate(startDate),
        end: this.formatDate(endDate),
      },
      accountCount: accounts.length,
      accounts: accounts.map((a) => ({ id: a.id, nickname: a.nickname, platform: a.platform })),
      summary: {
        current,
        previous: prev,
        weekOverWeekChange: wowChange,
      },
      topContent: topByViews,
      platformBreakdown: accounts.reduce(
        (acc, a) => {
          acc[a.platform] = (acc[a.platform] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }

  // ==================== Tool 5: export_data ====================

  private async exportData(params: Record<string, unknown>) {
    const accountName = params.accountName ? String(params.accountName) : undefined;
    const startDate = String(params.startDate || '');
    const endDate = String(params.endDate || '');
    const columns = (params.columns as string[]) || [];

    if (!startDate || !endDate) throw new Error('startDate 和 endDate 参数为必填');

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const accountWhere = accountName
      ? { nickname: { contains: accountName } }
      : { status: 'ACTIVE' as const };

    const accounts = await this.prisma.account.findMany({
      where: accountWhere,
      select: { id: true, nickname: true, platform: true },
    });

    const accountIds = accounts.map((a) => a.id);
    const stats = await this.prisma.dailyStats.findMany({
      where: { accountId: { in: accountIds }, date: { gte: start, lte: end } },
      orderBy: [{ accountId: 'asc' }, { date: 'asc' }],
    });

    // 构建行数据
    const rows = stats.map((s) => {
      const acc = accounts.find((a) => a.id === s.accountId);
      const row: Record<string, unknown> = {
        date: this.formatDate(s.date),
        platform: acc?.platform || '',
        nickname: acc?.nickname || '',
        followers: s.followers,
        views: s.views,
        likes: s.likes,
        comments: s.comments,
        shares: s.shares,
        followersIncrement: s.followersIncrement,
        viewsIncrement: s.viewsIncrement,
        likesIncrement: s.likesIncrement,
        commentsIncrement: s.commentsIncrement,
        sharesIncrement: s.sharesIncrement,
        unfollows: s.unfollows,
        revenue: s.revenue,
        gmv: s.gmv,
        orders: s.orders,
        commission: s.commission,
        buyerCount: s.buyerCount,
      };

      // 如果指定了列，只保留指定列
      if (columns.length > 0) {
        const filtered: Record<string, unknown> = {};
        for (const col of columns) {
          if (col in row) filtered[col] = row[col];
        }
        return filtered;
      }
      return row;
    });

    // 生成 CSV 字符串
    const allColumns =
      columns.length > 0
        ? columns
        : [
            'date',
            'platform',
            'nickname',
            'followers',
            'views',
            'likes',
            'comments',
            'shares',
            'followersIncrement',
            'viewsIncrement',
            'likesIncrement',
            'commentsIncrement',
            'sharesIncrement',
            'unfollows',
            'revenue',
            'gmv',
            'orders',
            'commission',
            'buyerCount',
          ];

    const header = allColumns.join(',');
    const csvRows = rows.map((row) =>
      allColumns.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        const str = String(val);
        // CSV 转义：包含逗号、引号或换行的字段需要加引号
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(','),
    );

    const csv = [header, ...csvRows].join('\n');

    return {
      format: 'csv',
      filename: `export_${startDate}_${endDate}.csv`,
      rowCount: rows.length,
      columns: allColumns,
      csvContent: csv,
    };
  }
}