import { createHash } from 'crypto'
import { BadRequestException } from '@nestjs/common'
import { McpOAuthService } from '../../src/modules/mcp/mcp-oauth.service'

describe('McpOAuthService', () => {
  const req: any = { headers: { host: 'ddddkiii.com', 'x-forwarded-proto': 'https' } }
  const user = { id: 'user-1', organizationId: 'org-1' }

  const pkceChallenge = (verifier: string) =>
    createHash('sha256').update(verifier).digest('base64url')

  const createService = () => {
    const rows = {
      clients: [] as any[],
      codes: [] as any[],
      tokens: [] as any[],
    }
    const prisma = {
      mcpOAuthClient: {
        create: jest.fn(async ({ data }) => {
          const row = { id: `client-row-${rows.clients.length + 1}`, revokedAt: null, ...data, createdAt: new Date(), updatedAt: new Date() }
          rows.clients.push(row)
          return row
        }),
        findFirst: jest.fn(async ({ where }) =>
          rows.clients.find((row) => row.clientId === where.clientId && row.revokedAt === where.revokedAt) || null,
        ),
      },
      mcpOAuthAuthorizationCode: {
        create: jest.fn(async ({ data }) => {
          const row = { id: `code-${rows.codes.length + 1}`, ...data, createdAt: new Date(), consumedAt: null }
          rows.codes.push(row)
          return row
        }),
        findUnique: jest.fn(async ({ where }) => rows.codes.find((row) => row.codeHash === where.codeHash) || null),
        update: jest.fn(async ({ where, data }) => {
          const row = rows.codes.find((entry) => entry.codeHash === where.codeHash)
          Object.assign(row, data)
          return row
        }),
      },
      mcpOAuthToken: {
        create: jest.fn(async ({ data }) => {
          const row = { id: `token-${rows.tokens.length + 1}`, ...data, createdAt: new Date(), updatedAt: new Date(), revokedAt: null }
          rows.tokens.push(row)
          return row
        }),
        findUnique: jest.fn(async ({ where }) => {
          if (where.accessTokenHash) return rows.tokens.find((row) => row.accessTokenHash === where.accessTokenHash) || null
          return rows.tokens.find((row) => row.refreshTokenHash === where.refreshTokenHash) || null
        }),
        update: jest.fn(async ({ where, data }) => {
          const row = rows.tokens.find((entry) => entry.refreshTokenHash === where.refreshTokenHash)
          Object.assign(row, data)
          return row
        }),
      },
    }
    const cache = new Map<string, string>()
    const redis = {
      get: jest.fn(async (key: string) => cache.get(key) || null),
      setWithTTL: jest.fn(async (key: string, value: string) => {
        cache.set(key, value)
      }),
      del: jest.fn(async (key: string) => {
        cache.delete(key)
      }),
    }
    return { service: new McpOAuthService(prisma as any, redis as any), prisma, rows, redis, cache }
  }

  it('returns OAuth discovery metadata on root well-known endpoints', () => {
    const { service } = createService()

    expect(service.getProtectedResourceMetadata(req)).toMatchObject({
      resource: 'https://ddddkiii.com/api/v1/mcp',
      authorization_servers: ['https://ddddkiii.com'],
      scopes_supported: ['mcp:read'],
    })
    expect(service.getAuthorizationServerMetadata(req)).toMatchObject({
      issuer: 'https://ddddkiii.com',
      authorization_endpoint: 'https://ddddkiii.com/oauth/authorize',
      token_endpoint: 'https://ddddkiii.com/oauth/token',
      registration_endpoint: 'https://ddddkiii.com/oauth/register',
    })
  })

  it('registers ChatGPT redirect URIs and rejects unregistered authorize redirects', async () => {
    const { service } = createService()
    const client = await service.registerClient({
      redirect_uris: ['https://chatgpt.com/connector/oauth/callback'],
      client_name: 'ChatGPT',
    }, req)

    await expect(
      service.createAuthorizationTransaction({
        response_type: 'code',
        client_id: client.client_id,
        redirect_uri: 'https://chatgpt.com/connector/oauth/other',
        scope: 'mcp:read',
        code_challenge: pkceChallenge('verifier'),
        code_challenge_method: 'S256',
      }, req),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('exchanges a PKCE authorization code once and resolves OAuth AuthContext', async () => {
    const { service } = createService()
    const verifier = 'correct-verifier'
    const client = await service.registerClient({
      redirect_uris: ['https://chatgpt.com/connector/oauth/callback'],
    }, req)
    const transaction = await service.createAuthorizationTransaction({
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
      scope: 'mcp:read',
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
      state: 'original-state',
    }, req)
    expect(transaction.redirectTo).toContain('/oauth/consent?transaction=')
    await expect(service.getAuthorizationTransaction(transaction.transactionId)).resolves.toMatchObject({
      clientName: 'ChatGPT',
      scope: 'mcp:read',
      resource: 'https://ddddkiii.com/api/v1/mcp',
    })
    const authorized = await service.approveAuthorizationTransaction(transaction.transactionId, user)
    const code = new URL((authorized as any).redirectTo).searchParams.get('code')!
    expect(new URL((authorized as any).redirectTo).searchParams.get('state')).toBe('original-state')
    const token = await service.token({
      grant_type: 'authorization_code',
      client_id: client.client_id,
      redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
      code,
      code_verifier: verifier,
    }, req)

    await expect(service.resolveAccessToken((token as any).access_token)).resolves.toMatchObject({
      authType: 'oauth',
      clientId: client.client_id,
      userId: 'user-1',
      organizationId: 'org-1',
      scopes: ['mcp:read'],
      isLegacyGlobalKey: false,
    })
    await expect(service.token({
      grant_type: 'authorization_code',
      client_id: client.client_id,
      redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
      code,
      code_verifier: verifier,
    }, req)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rotates refresh tokens and revokes the old refresh token', async () => {
    const { service } = createService()
    const verifier = 'refresh-verifier'
    const client = await service.registerClient({
      redirect_uris: ['https://chatgpt.com/connector/oauth/callback'],
    }, req)
    const transaction = await service.createAuthorizationTransaction({
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
    }, req)
    const authorized = await service.approveAuthorizationTransaction(transaction.transactionId, user)
    const code = new URL((authorized as any).redirectTo).searchParams.get('code')!
    const token = await service.token({
      grant_type: 'authorization_code',
      client_id: client.client_id,
      redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
      code,
      code_verifier: verifier,
    }, req) as any

    const rotated = await service.token({
      grant_type: 'refresh_token',
      client_id: client.client_id,
      refresh_token: token.refresh_token,
    }, req) as any

    expect(rotated.refresh_token).toBeTruthy()
    expect(rotated.refresh_token).not.toBe(token.refresh_token)
    await expect(service.token({
      grant_type: 'refresh_token',
      client_id: client.client_id,
      refresh_token: token.refresh_token,
    }, req)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('denies an authorization transaction with access_denied and preserves state', async () => {
    const { service } = createService()
    const client = await service.registerClient({
      redirect_uris: ['https://chatgpt.com/connector/oauth/callback'],
    }, req)
    const transaction = await service.createAuthorizationTransaction({
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
      code_challenge: pkceChallenge('deny-verifier'),
      code_challenge_method: 'S256',
      state: 'chatgpt-state',
    }, req)

    const denied = await service.denyAuthorizationTransaction(transaction.transactionId)
    const redirect = new URL(denied.redirectTo)

    expect(redirect.searchParams.get('error')).toBe('access_denied')
    expect(redirect.searchParams.get('state')).toBe('chatgpt-state')
  })
})
