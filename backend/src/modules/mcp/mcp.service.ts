import { Injectable, Logger } from '@nestjs/common'
import { createHash, randomBytes } from 'crypto'
import { Prisma } from '@prisma/client'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'
import { PrismaService } from '../../prisma/prisma.service'

export interface McpClientAuth {
  clientId: string
  token: string
  scopes: string[]
}

export interface McpCatalogEntry {
  name: string
  title: string
  description: string
}

export interface McpCatalog {
  tools: McpCatalogEntry[]
  resources: McpCatalogEntry[]
}

export interface McpKeyEntry {
  id: string
  clientId: string
  token: string
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ConfiguredKey {
  id: string
  clientId: string
  token: string
  source: 'db' | 'env'
}

type RankingMetric =
  | 'followers'
  | 'views'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'gmv'
  | 'orders'
  | 'revenue'
  | 'commission'
  | 'buyerCount'

const PLATFORMS = [
  'DOUYIN',
  'KUAISHOU',
  'XIAOHONGSHU',
  'BILIBILI',
  'WEIBO',
  'WECHAT_VIDEO',
  'TIKTOK',
  'DOUDIAN',
  'XIAOHONGSHU_SHOP',
  'WECHAT_SHOP',
] as const

const ACCOUNT_STATUSES = ['ACTIVE', 'EXPIRED', 'DISABLED'] as const

const EXPORT_COLUMNS = [
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
  'productCount',
  'avgOrderValue',
] as const

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name)

  constructor(private readonly prisma: PrismaService) {}

  // ==================== Key 管理 (DB CRUD) ====================

  async listKeys(): Promise<McpKeyEntry[]> {
    return this.prisma.mcpKey.findMany({
      orderBy: { createdAt: 'desc' },
    })
  }

  async createKey(clientId: string, createdBy?: string): Promise<McpKeyEntry> {
    const sanitized = clientId.trim().replace(/[^a-zA-Z0-9_-]/g, '-') || 'mcp-client'
    const token = this.generateToken()
    return this.prisma.mcpKey.create({
      data: { clientId: sanitized, token, createdBy },
    })
  }

  async deleteKey(id: string): Promise<void> {
    await this.prisma.mcpKey.delete({ where: { id } })
  }

  /**
   * 从 DB 和环境变量合并获取所有已配置的 key。
   * DB 优先，env 作为 fallback。
   */
  async getConfiguredKeys(): Promise<ConfiguredKey[]> {
    const dbKeys = await this.prisma.mcpKey.findMany()
    const envKeys = this.parseEnvKeys()

    // DB key 优先，env key 中 clientId 不冲突的追加
    const dbClientIds = new Set(dbKeys.map((k) => k.clientId))
    const envExtras = envKeys.filter((k) => !dbClientIds.has(k.clientId))

    return [
      ...dbKeys.map((k) => ({
        id: k.id,
        clientId: k.clientId,
        token: k.token,
        source: 'db' as const,
      })),
      ...envExtras,
    ]
  }

  private parseEnvKeys(): ConfiguredKey[] {
    const raw = process.env.MCP_API_KEYS || process.env.MCP_READ_TOKEN || ''
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry, index) => {
        const separator = entry.indexOf(':')
        if (separator > 0) {
          return {
            id: `env-${index}`,
            clientId: entry.slice(0, separator).trim(),
            token: entry.slice(separator + 1).trim(),
            source: 'env' as const,
          }
        }
        const fingerprint = createHash('sha256').update(entry).digest('hex').slice(0, 8)
        return {
          id: `env-${index}`,
          clientId: `mcp-client-${index + 1}-${fingerprint}`,
          token: entry,
          source: 'env' as const,
        }
      })
      .filter((entry) => entry.token.length > 0)
  }

  private generateToken(): string {
    return randomBytes(32)
      .toString('base64url')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }

  getCatalog(): McpCatalog {
    return {
      tools: [
        {
          name: 'list_accounts',
          title: 'List accounts',
          description: 'List MatrixFlow accounts without returning credentials or tokens.',
        },
        {
          name: 'query_account_data',
          title: 'Query account daily data',
          description:
            'Read daily account stats for an account id, account name, or platform within a date range.',
        },
        {
          name: 'get_top_rankings',
          title: 'Get top rankings',
          description: 'Rank accounts by followers or aggregated daily metrics.',
        },
        {
          name: 'compare_accounts',
          title: 'Compare accounts',
          description: 'Compare 2 to 10 accounts over a date range for one metric.',
        },
        {
          name: 'generate_report',
          title: 'Generate account report',
          description: 'Generate a weekly or monthly read-only summary for matching accounts.',
        },
        {
          name: 'export_data',
          title: 'Export daily stats CSV',
          description: 'Return daily stats as CSV text. The result is capped by MCP_MAX_ROWS.',
        },
      ],
      resources: [
        {
          name: 'matrixflow-schema',
          title: 'MatrixFlow read schema',
          description: 'matrixflow://schema',
        },
        {
          name: 'matrixflow-metrics',
          title: 'MatrixFlow metrics catalog',
          description: 'matrixflow://metrics',
        },
      ],
    }
  }

  createServer(auth: McpClientAuth): McpServer {
    const server = new McpServer(
      {
        name: 'matrixflow-readonly',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      },
    )

    this.registerResources(server)
    this.registerTools(server, auth)
    return server
  }

  private registerResources(server: McpServer) {
    server.registerResource(
      'matrixflow-schema',
      'matrixflow://schema',
      {
        title: 'MatrixFlow read schema',
        description: 'Safe read-only schema exposed to MCP clients.',
        mimeType: 'application/json',
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(this.getSchemaResource(), null, 2),
          },
        ],
      }),
    )

    server.registerResource(
      'matrixflow-metrics',
      'matrixflow://metrics',
      {
        title: 'MatrixFlow metrics catalog',
        description: 'Metric names accepted by the read-only MCP tools.',
        mimeType: 'application/json',
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(this.getMetricsResource(), null, 2),
          },
        ],
      }),
    )
  }

  private registerTools(server: McpServer, _auth: McpClientAuth) {
    server.registerTool(
      'list_accounts',
      {
        title: 'List accounts',
        description: 'List MatrixFlow accounts without returning credentials or tokens.',
        inputSchema: {
          platform: z.enum(PLATFORMS).optional(),
          status: z.enum(ACCOUNT_STATUSES).optional(),
          search: z.string().min(1).max(80).optional(),
          limit: z.number().int().min(1).max(200).optional(),
        },
        annotations: { readOnlyHint: true },
      },
      async (args) => this.asToolResult(await this.listAccounts(args)),
    )

    server.registerTool(
      'query_account_data',
      {
        title: 'Query account daily data',
        description:
          'Read daily account stats for an account id, account name, or platform within a date range.',
        inputSchema: {
          accountId: z.string().min(1).max(100).optional(),
          accountName: z.string().min(1).max(120).optional(),
          platform: z.enum(PLATFORMS).optional(),
          startDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          endDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          limit: z.number().int().min(1).max(1000).optional(),
        },
        annotations: { readOnlyHint: true },
      },
      async (args) => this.asToolResult(await this.queryAccountData(args)),
    )

    server.registerTool(
      'get_top_rankings',
      {
        title: 'Get top rankings',
        description: 'Rank accounts by followers or aggregated daily metrics.',
        inputSchema: {
          metric: z.enum([
            'followers',
            'views',
            'likes',
            'comments',
            'shares',
            'gmv',
            'orders',
            'revenue',
            'commission',
            'buyerCount',
          ]),
          period: z.enum(['week', 'month', 'total']).default('week'),
          platform: z.enum(PLATFORMS).optional(),
          limit: z.number().int().min(1).max(100).optional(),
        },
        annotations: { readOnlyHint: true },
      },
      async (args) => this.asToolResult(await this.getTopRankings(args)),
    )

    server.registerTool(
      'compare_accounts',
      {
        title: 'Compare accounts',
        description: 'Compare 2 to 10 accounts over a date range for one metric.',
        inputSchema: {
          accountNames: z.array(z.string().min(1).max(120)).min(2).max(10),
          metric: z.enum([
            'followers',
            'views',
            'likes',
            'comments',
            'shares',
            'gmv',
            'orders',
            'revenue',
            'commission',
            'buyerCount',
          ]),
          startDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          endDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          platform: z.enum(PLATFORMS).optional(),
        },
        annotations: { readOnlyHint: true },
      },
      async (args) => this.asToolResult(await this.compareAccounts(args)),
    )

    server.registerTool(
      'generate_report',
      {
        title: 'Generate account report',
        description: 'Generate a weekly or monthly read-only summary for matching accounts.',
        inputSchema: {
          accountName: z.string().min(1).max(120).optional(),
          platform: z.enum(PLATFORMS).optional(),
          period: z.enum(['week', 'month']).default('week'),
        },
        annotations: { readOnlyHint: true },
      },
      async (args) => this.asToolResult(await this.generateReport(args)),
    )

    server.registerTool(
      'export_data',
      {
        title: 'Export daily stats CSV',
        description: 'Return daily stats as CSV text. The result is capped by MCP_MAX_ROWS.',
        inputSchema: {
          accountName: z.string().min(1).max(120).optional(),
          platform: z.enum(PLATFORMS).optional(),
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          columns: z.array(z.enum(EXPORT_COLUMNS)).optional(),
          limit: z.number().int().min(1).max(5000).optional(),
        },
        annotations: { readOnlyHint: true },
      },
      async (args) => this.asToolResult(await this.exportData(args)),
    )
  }

  private async listAccounts(args: {
    platform?: string
    status?: string
    search?: string
    limit?: number
  }) {
    const limit = this.clampLimit(args.limit, 100, 200)
    const where: Prisma.AccountWhereInput = {
      ...(args.platform ? { platform: this.normalizePlatform(args.platform) } : {}),
      ...(args.status
        ? { status: this.normalizeStatus(args.status) }
        : { status: 'ACTIVE' as any }),
      ...(args.search ? { nickname: { contains: args.search } } : {}),
    }

    const accounts = await this.prisma.account.findMany({
      where,
      select: this.accountSelect(),
      orderBy: [{ platform: 'asc' }, { followers: 'desc' }],
      take: limit,
    })

    return {
      accounts: accounts.map((account) => this.sanitizeAccount(account)),
      limit,
      returned: accounts.length,
    }
  }

  private async queryAccountData(args: {
    accountId?: string
    accountName?: string
    platform?: string
    startDate?: string
    endDate?: string
    limit?: number
  }) {
    const limit = this.clampLimit(args.limit, this.getMaxRows(), this.getMaxRows())
    const range = this.buildDateRange(args.startDate, args.endDate, 30)
    const accounts = await this.findMatchingAccounts({
      accountId: args.accountId,
      accountName: args.accountName,
      platform: args.platform,
      limit: 100,
    })

    if (accounts.length === 0) {
      return {
        accounts: [],
        dailyStats: [],
        period: { startDate: range.startDate, endDate: range.endDate },
        message: 'No matching accounts found.',
      }
    }

    const stats = await this.prisma.dailyStats.findMany({
      where: {
        accountId: { in: accounts.map((account) => account.id) },
        date: { gte: range.start, lte: range.end },
      },
      include: {
        account: { select: { id: true, nickname: true, platform: true } },
      },
      orderBy: [{ date: 'desc' }, { accountId: 'asc' }],
      take: limit,
    })

    const rows = stats
      .map((stat) => this.sanitizeDailyStat(stat))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))

    return {
      accounts: accounts.map((account) => this.sanitizeAccount(account)),
      dailyStats: rows,
      period: { startDate: range.startDate, endDate: range.endDate },
      limit,
      returned: rows.length,
      truncated: stats.length === limit,
    }
  }

  private async getTopRankings(args: {
    metric: RankingMetric
    period?: 'week' | 'month' | 'total'
    platform?: string
    limit?: number
  }) {
    const limit = this.clampLimit(args.limit, 10, 100)
    const period = args.period || 'week'
    const range = this.periodToRange(period)
    const accountWhere: Prisma.AccountWhereInput = {
      status: 'ACTIVE' as any,
      ...(args.platform ? { platform: this.normalizePlatform(args.platform) } : {}),
    }

    const accounts = await this.prisma.account.findMany({
      where: accountWhere,
      select: this.accountSelect(),
    })

    if (args.metric === 'followers') {
      const rankings = accounts
        .sort((a, b) => b.followers - a.followers)
        .slice(0, limit)
        .map((account, index) => ({
          rank: index + 1,
          account: this.sanitizeAccount(account),
          value: account.followers,
        }))

      return { metric: args.metric, period, rankings, totalAccounts: accounts.length }
    }

    const stats = await this.prisma.dailyStats.findMany({
      where: {
        accountId: { in: accounts.map((account) => account.id) },
        ...(range.start ? { date: { gte: range.start, lte: range.end } } : {}),
      },
      select: {
        accountId: true,
        views: true,
        likes: true,
        comments: true,
        shares: true,
        gmv: true,
        orders: true,
        revenue: true,
        commission: true,
        buyerCount: true,
      },
    })

    const totals = new Map<string, number>()
    for (const stat of stats) {
      totals.set(
        stat.accountId,
        (totals.get(stat.accountId) || 0) + this.metricValue(stat, args.metric),
      )
    }

    const rankings = accounts
      .map((account) => ({ account, value: totals.get(account.id) || 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit)
      .map((row, index) => ({
        rank: index + 1,
        account: this.sanitizeAccount(row.account),
        value: row.value,
      }))

    return {
      metric: args.metric,
      period,
      periodRange: range.start
        ? { startDate: this.formatDate(range.start), endDate: this.formatDate(range.end) }
        : null,
      rankings,
      totalAccounts: accounts.length,
    }
  }

  private async compareAccounts(args: {
    accountNames: string[]
    metric: RankingMetric
    startDate?: string
    endDate?: string
    platform?: string
  }) {
    const range = this.buildDateRange(args.startDate, args.endDate, 30)
    const platform = args.platform ? this.normalizePlatform(args.platform) : undefined

    const found = await Promise.all(
      args.accountNames.map((name) =>
        this.prisma.account.findFirst({
          where: {
            nickname: { contains: name },
            status: 'ACTIVE' as any,
            ...(platform ? { platform } : {}),
          },
          select: this.accountSelect(),
          orderBy: { followers: 'desc' },
        }),
      ),
    )

    const accounts = found.filter((account): account is NonNullable<typeof account> =>
      Boolean(account),
    )
    const missing = args.accountNames.filter((_, index) => !found[index])

    if (accounts.length < 2) {
      return {
        metric: args.metric,
        period: { startDate: range.startDate, endDate: range.endDate },
        comparison: accounts.map((account) => ({
          account: this.sanitizeAccount(account),
          value: 0,
        })),
        missing,
        message: 'Fewer than two matching accounts were found.',
      }
    }

    if (args.metric === 'followers') {
      return this.compareRows(
        args.metric,
        range,
        accounts.map((account) => ({
          account: this.sanitizeAccount(account),
          value: account.followers,
        })),
        missing,
      )
    }

    const stats = await this.prisma.dailyStats.findMany({
      where: {
        accountId: { in: accounts.map((account) => account.id) },
        date: { gte: range.start, lte: range.end },
      },
    })

    const totals = new Map<string, number>()
    for (const stat of stats) {
      totals.set(
        stat.accountId,
        (totals.get(stat.accountId) || 0) + this.metricValue(stat, args.metric),
      )
    }

    return this.compareRows(
      args.metric,
      range,
      accounts.map((account) => ({
        account: this.sanitizeAccount(account),
        value: totals.get(account.id) || 0,
      })),
      missing,
    )
  }

  private async generateReport(args: {
    accountName?: string
    platform?: string
    period?: 'week' | 'month'
  }) {
    const period = args.period || 'week'
    const days = period === 'month' ? 30 : 7
    const current = this.buildDateRange(undefined, undefined, days)
    const previousEnd = new Date(current.start)
    previousEnd.setDate(previousEnd.getDate() - 1)
    previousEnd.setHours(23, 59, 59, 999)
    const previousStart = new Date(previousEnd)
    previousStart.setDate(previousStart.getDate() - (days - 1))
    previousStart.setHours(0, 0, 0, 0)

    const accounts = await this.findMatchingAccounts({
      accountName: args.accountName,
      platform: args.platform,
      limit: 500,
    })

    if (accounts.length === 0) {
      return {
        reportType: period,
        accounts: [],
        message: 'No matching active accounts found.',
      }
    }

    const accountIds = accounts.map((account) => account.id)
    const [currentStats, previousStats, topPosts] = await Promise.all([
      this.prisma.dailyStats.findMany({
        where: { accountId: { in: accountIds }, date: { gte: current.start, lte: current.end } },
      }),
      this.prisma.dailyStats.findMany({
        where: { accountId: { in: accountIds }, date: { gte: previousStart, lte: previousEnd } },
      }),
      this.prisma.post.findMany({
        where: {
          accountId: { in: accountIds },
          status: 'PUBLISHED' as any,
          publishAt: { gte: current.start, lte: current.end },
        },
        include: { stats: true, account: { select: { id: true, nickname: true, platform: true } } },
        orderBy: { publishAt: 'desc' },
        take: 20,
      }),
    ])

    const currentSummary = this.aggregateStats(currentStats)
    const previousSummary = this.aggregateStats(previousStats)

    return {
      reportType: period,
      period: { startDate: current.startDate, endDate: current.endDate },
      accountCount: accounts.length,
      accounts: accounts.map((account) => this.sanitizeAccount(account)),
      summary: {
        current: currentSummary,
        previous: previousSummary,
        changePercent: this.changePercent(currentSummary, previousSummary),
      },
      topContent: topPosts
        .filter((post) => post.stats)
        .sort((a, b) => (b.stats?.views || 0) - (a.stats?.views || 0))
        .slice(0, 10)
        .map((post) => ({
          id: post.id,
          title: post.title,
          account: post.account,
          publishAt: post.publishAt?.toISOString() || null,
          views: post.stats?.views || 0,
          likes: post.stats?.likes || 0,
          comments: post.stats?.comments || 0,
          shares: post.stats?.shares || 0,
        })),
      platformBreakdown: this.platformBreakdown(accounts),
    }
  }

  private async exportData(args: {
    accountName?: string
    platform?: string
    startDate: string
    endDate: string
    columns?: string[]
    limit?: number
  }) {
    const limit = this.clampLimit(args.limit, this.getMaxRows(), this.getMaxRows())
    const range = this.buildDateRange(args.startDate, args.endDate, 30)
    const accounts = await this.findMatchingAccounts({
      accountName: args.accountName,
      platform: args.platform,
      limit: 500,
    })
    const accountIds = accounts.map((account) => account.id)
    const columns = args.columns?.length ? args.columns : [...EXPORT_COLUMNS]

    if (accountIds.length === 0) {
      return {
        format: 'csv',
        filename: `matrixflow_export_${range.startDate}_${range.endDate}.csv`,
        rowCount: 0,
        columns,
        csvContent: columns.join(','),
      }
    }

    const stats = await this.prisma.dailyStats.findMany({
      where: {
        accountId: { in: accountIds },
        date: { gte: range.start, lte: range.end },
      },
      include: { account: { select: { id: true, nickname: true, platform: true } } },
      orderBy: [{ date: 'asc' }, { accountId: 'asc' }],
      take: limit,
    })

    const rows = stats.map((stat) => this.sanitizeDailyStat(stat))
    const csvRows = [
      columns.join(','),
      ...rows.map((row) => columns.map((column) => this.csvCell(row[column])).join(',')),
    ]

    return {
      format: 'csv',
      filename: `matrixflow_export_${range.startDate}_${range.endDate}.csv`,
      period: { startDate: range.startDate, endDate: range.endDate },
      rowCount: rows.length,
      columns,
      truncated: rows.length === limit,
      csvContent: csvRows.join('\n'),
    }
  }

  private async findMatchingAccounts(args: {
    accountId?: string
    accountName?: string
    platform?: string
    limit: number
  }) {
    const where: Prisma.AccountWhereInput = {
      status: 'ACTIVE' as any,
      ...(args.accountId ? { id: args.accountId } : {}),
      ...(args.accountName ? { nickname: { contains: args.accountName } } : {}),
      ...(args.platform ? { platform: this.normalizePlatform(args.platform) } : {}),
    }

    return this.prisma.account.findMany({
      where,
      select: this.accountSelect(),
      orderBy: [{ platform: 'asc' }, { followers: 'desc' }],
      take: args.limit,
    })
  }

  private accountSelect() {
    return {
      id: true,
      platform: true,
      platformUserId: true,
      nickname: true,
      avatar: true,
      bio: true,
      followers: true,
      likes: true,
      following: true,
      status: true,
      lastActiveAt: true,
      storeScore: true,
      teamId: true,
      groupId: true,
      createdAt: true,
      updatedAt: true,
    } satisfies Prisma.AccountSelect
  }

  private sanitizeAccount(
    account: Prisma.AccountGetPayload<{ select: ReturnType<McpService['accountSelect']> }>,
  ) {
    return {
      ...account,
      lastActiveAt: account.lastActiveAt?.toISOString() || null,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    }
  }

  private sanitizeDailyStat(stat: any): Record<string, unknown> {
    return {
      date: this.formatDate(stat.date),
      accountId: stat.accountId,
      platform: stat.platform,
      nickname: stat.account?.nickname || '',
      followers: stat.followers,
      views: stat.views,
      likes: stat.likes,
      comments: stat.comments,
      shares: stat.shares,
      followersIncrement: stat.followersIncrement,
      viewsIncrement: stat.viewsIncrement,
      likesIncrement: stat.likesIncrement,
      commentsIncrement: stat.commentsIncrement,
      sharesIncrement: stat.sharesIncrement,
      unfollows: stat.unfollows,
      revenue: stat.revenue,
      gmv: stat.gmv,
      orders: stat.orders,
      commission: stat.commission,
      buyerCount: stat.buyerCount,
      productCount: stat.productCount,
      avgOrderValue: stat.avgOrderValue,
    }
  }

  private aggregateStats(stats: Array<Record<string, any>>) {
    return {
      views: stats.reduce((sum, stat) => sum + (stat.views || 0), 0),
      likes: stats.reduce((sum, stat) => sum + (stat.likes || 0), 0),
      comments: stats.reduce((sum, stat) => sum + (stat.comments || 0), 0),
      shares: stats.reduce((sum, stat) => sum + (stat.shares || 0), 0),
      revenue: stats.reduce((sum, stat) => sum + (stat.revenue || 0), 0),
      gmv: stats.reduce((sum, stat) => sum + (stat.gmv || 0), 0),
      orders: stats.reduce((sum, stat) => sum + (stat.orders || 0), 0),
      commission: stats.reduce((sum, stat) => sum + (stat.commission || 0), 0),
      buyerCount: stats.reduce((sum, stat) => sum + (stat.buyerCount || 0), 0),
    }
  }

  private compareRows(
    metric: RankingMetric,
    range: { startDate: string; endDate: string },
    rows: Array<{ account: Record<string, unknown>; value: number }>,
    missing: string[],
  ) {
    const max = Math.max(...rows.map((row) => row.value), 0)

    return {
      metric,
      period: { startDate: range.startDate, endDate: range.endDate },
      comparison: rows
        .sort((a, b) => b.value - a.value)
        .map((row, index) => ({
          rank: index + 1,
          ...row,
          diffFromTop: max - row.value,
          percentageOfTop: max > 0 ? Number(((row.value / max) * 100).toFixed(1)) : 0,
        })),
      missing,
    }
  }

  private changePercent(current: Record<string, number>, previous: Record<string, number>) {
    return Object.fromEntries(
      Object.entries(current).map(([key, value]) => {
        const base = previous[key] || 0
        return [key, base > 0 ? Number((((value - base) / base) * 100).toFixed(1)) : null]
      }),
    )
  }

  private platformBreakdown(accounts: Array<{ platform: unknown }>) {
    return accounts.reduce(
      (acc, account) => {
        const platform = String(account.platform)
        acc[platform] = (acc[platform] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )
  }

  private metricValue(stat: Record<string, any>, metric: RankingMetric): number {
    return Number(stat[metric] || 0)
  }

  private buildDateRange(startDate?: string, endDate?: string, defaultDays = 30) {
    const end = endDate ? this.parseDate(endDate, 'endDate') : new Date()
    end.setHours(23, 59, 59, 999)

    const start = startDate ? this.parseDate(startDate, 'startDate') : new Date(end)
    if (!startDate) start.setDate(start.getDate() - (defaultDays - 1))
    start.setHours(0, 0, 0, 0)

    if (start.getTime() > end.getTime()) {
      throw new Error('startDate must be before or equal to endDate.')
    }

    const rangeDays = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1
    const maxDays = this.getMaxRangeDays()
    if (rangeDays > maxDays) {
      throw new Error(`Date range is too large. Maximum allowed range is ${maxDays} days.`)
    }

    return {
      start,
      end,
      startDate: this.formatDate(start),
      endDate: this.formatDate(end),
    }
  }

  private periodToRange(period: 'week' | 'month' | 'total') {
    if (period === 'total') return { start: null, end: null }
    const days = period === 'month' ? 30 : 7
    const range = this.buildDateRange(undefined, undefined, days)
    return { start: range.start, end: range.end }
  }

  private parseDate(value: string, field: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime())) {
      throw new Error(`${field} must be a valid YYYY-MM-DD date.`)
    }
    return date
  }

  private normalizePlatform(platform: string) {
    const normalized = platform.trim().toUpperCase()
    if (!PLATFORMS.includes(normalized as any)) {
      throw new Error(`Unsupported platform: ${platform}`)
    }
    return normalized as any
  }

  private normalizeStatus(status: string) {
    const normalized = status.trim().toUpperCase()
    if (!ACCOUNT_STATUSES.includes(normalized as any)) {
      throw new Error(`Unsupported account status: ${status}`)
    }
    return normalized as any
  }

  private clampLimit(value: number | undefined, fallback: number, max: number): number {
    const parsed = Number(value || fallback)
    if (!Number.isFinite(parsed)) return fallback
    return Math.max(1, Math.min(Math.floor(parsed), max))
  }

  private getMaxRows(): number {
    return this.clampLimit(Number(process.env.MCP_MAX_ROWS || 500), 500, 5000)
  }

  private getMaxRangeDays(): number {
    return this.clampLimit(Number(process.env.MCP_MAX_RANGE_DAYS || 366), 366, 3660)
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10)
  }

  private csvCell(value: unknown): string {
    if (value === null || value === undefined) return ''
    const text = String(value)
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }

  private asToolResult(data: Record<string, unknown>): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
      structuredContent: data,
    }
  }

  private getSchemaResource() {
    return {
      tables: {
        Account: {
          description:
            'Public account profile and current counters. Credentials are never exposed.',
          fields: [
            'id',
            'platform',
            'platformUserId',
            'nickname',
            'avatar',
            'bio',
            'followers',
            'likes',
            'following',
            'status',
            'lastActiveAt',
            'storeScore',
            'teamId',
            'groupId',
            'createdAt',
            'updatedAt',
          ],
        },
        DailyStats: {
          description: 'Daily account performance and commerce metrics.',
          fields: [...EXPORT_COLUMNS],
        },
        Post: {
          description: 'Published content metadata used by generate_report.',
          fields: ['id', 'title', 'publishAt', 'status', 'platformUrl', 'accountId'],
        },
        PostStats: {
          description: 'Content performance metrics used by generate_report.',
          fields: ['views', 'likes', 'comments', 'shares', 'completionRate', 'avgPlayDuration'],
        },
      },
      limits: {
        maxRows: this.getMaxRows(),
        maxRangeDays: this.getMaxRangeDays(),
      },
    }
  }

  private getMetricsResource() {
    return {
      rankingMetrics: [
        'followers',
        'views',
        'likes',
        'comments',
        'shares',
        'gmv',
        'orders',
        'revenue',
        'commission',
        'buyerCount',
      ],
      platforms: [...PLATFORMS],
      periods: ['week', 'month', 'total'],
    }
  }
}
