import { McpService } from '../../src/modules/mcp/mcp.service'
import { McpAuthContext } from '../../src/modules/mcp/mcp-auth-context'

describe('McpService MCP organization scope', () => {
  const orgAuth: McpAuthContext = {
    authType: 'mcp_key',
    clientId: 'client-1',
    token: 'token-1',
    scopes: ['mcp:read'],
    userId: 'user-1',
    organizationId: 'org-1',
    isLegacyGlobalKey: false,
  }

  const legacyAuth: McpAuthContext = {
    authType: 'mcp_key',
    clientId: 'legacy-client',
    token: 'legacy-token',
    scopes: ['mcp:read'],
    isLegacyGlobalKey: true,
  }

  const createService = () => {
    const prisma = {
      account: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      dailyStats: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      post: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      mcpKey: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    }
    return { service: new McpService(prisma as any), prisma }
  }

  it('scopes list_accounts to the authenticated organization', async () => {
    const { service, prisma } = createService()

    await (service as any).listAccounts(orgAuth, { platform: 'DOUYIN' })

    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          platform: 'DOUYIN',
        }),
      }),
    )
  })

  it('keeps legacy global keys compatible without adding an organization filter', async () => {
    const { service, prisma } = createService()

    await (service as any).listAccounts(legacyAuth, { platform: 'DOUYIN' })

    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          organizationId: expect.any(String),
        }),
      }),
    )
  })

  it('does not query stats when an explicitly requested account is outside the auth scope', async () => {
    const { service, prisma } = createService()
    prisma.account.findMany.mockResolvedValueOnce([])

    const result = await (service as any).queryAccountData(orgAuth, {
      accountId: 'account-from-another-org',
    })

    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'account-from-another-org',
          organizationId: 'org-1',
        }),
      }),
    )
    expect(prisma.dailyStats.findMany).not.toHaveBeenCalled()
    expect(result.message).toBe('No matching accounts found.')
  })

  it('scopes compare account lookups before reading stats', async () => {
    const { service, prisma } = createService()

    await (service as any).compareAccounts(orgAuth, {
      accountNames: ['A', 'B'],
      metric: 'views',
    })

    expect(prisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          nickname: { contains: 'A' },
        }),
      }),
    )
    expect(prisma.dailyStats.findMany).not.toHaveBeenCalled()
  })

  it('scopes report and export account matching to the authenticated organization', async () => {
    const { service, prisma } = createService()

    await (service as any).generateReport(orgAuth, { platform: 'DOUYIN', period: 'week' })
    await (service as any).exportData(orgAuth, {
      platform: 'DOUYIN',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
    })

    expect(prisma.account.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          platform: 'DOUYIN',
        }),
      }),
    )
    expect(prisma.account.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          platform: 'DOUYIN',
        }),
      }),
    )
  })
})
