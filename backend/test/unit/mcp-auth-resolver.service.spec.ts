import { McpAuthResolverService } from '../../src/modules/mcp/mcp-auth-resolver.service'

describe('McpAuthResolverService', () => {
  const createService = (keys: any[], user: any = null) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
      },
    }
    const mcpService = {
      getConfiguredKeys: jest.fn().mockResolvedValue(keys),
    }
    const mcpOAuthService = {
      resolveAccessToken: jest.fn().mockResolvedValue(null),
    }
    return {
      service: new McpAuthResolverService(prisma as any, mcpService as any, mcpOAuthService as any),
      prisma,
      mcpService,
      mcpOAuthService,
    }
  }

  it('binds DB MCP keys to the creator organization when available', async () => {
    const { service, prisma } = createService(
      [
        {
          id: 'key-1',
          clientId: 'client-1',
          token: 'secret-token',
          source: 'db',
          createdBy: 'user-1',
        },
      ],
      { id: 'user-1', organizationId: 'org-1' },
    )

    await expect(service.resolveAuthorization('secret-token')).resolves.toEqual({
      authType: 'mcp_key',
      userId: 'user-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      token: 'secret-token',
      scopes: ['mcp:read'],
      isLegacyGlobalKey: false,
    })
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, organizationId: true },
    })
  })

  it('keeps env MCP keys as legacy global keys', async () => {
    const { service, prisma } = createService([
      {
        id: 'env-0',
        clientId: 'env-client',
        token: 'env-token',
        source: 'env',
        createdBy: null,
      },
    ])

    await expect(service.resolveAuthorization('env-token')).resolves.toMatchObject({
      authType: 'mcp_key',
      clientId: 'env-client',
      organizationId: undefined,
      isLegacyGlobalKey: true,
    })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('does not authenticate unknown tokens', async () => {
    const { service } = createService([
      {
        id: 'key-1',
        clientId: 'client-1',
        token: 'known-token',
        source: 'db',
        createdBy: 'user-1',
      },
    ])

    await expect(service.resolveAuthorization('missing-token')).resolves.toBeNull()
  })

  it('prefers OAuth access tokens before legacy MCP keys', async () => {
    const { service, mcpOAuthService, mcpService } = createService([])
    mcpOAuthService.resolveAccessToken.mockResolvedValueOnce({
      authType: 'oauth',
      clientId: 'oauth-client',
      token: 'oauth-token',
      scopes: ['mcp:read'],
      userId: 'user-1',
      organizationId: 'org-1',
      isLegacyGlobalKey: false,
    })

    await expect(service.resolveAuthorization('oauth-token')).resolves.toMatchObject({
      authType: 'oauth',
      organizationId: 'org-1',
      isLegacyGlobalKey: false,
    })
    expect(mcpService.getConfiguredKeys).not.toHaveBeenCalled()
  })
})
