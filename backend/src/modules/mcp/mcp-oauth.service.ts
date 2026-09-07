import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { Request } from 'express'
import { PrismaService } from '../../prisma/prisma.service'
import { RedisService } from '../../redis/redis.service'
import {
  MCP_OAUTH_SCOPE,
  MCP_OAUTH_SCOPES,
  McpOAuthAuthorizeQuery,
  McpOAuthRegisterRequest,
  McpOAuthTokenRequest,
} from './mcp-oauth.types'
import { McpAuthContext } from './mcp-auth-context'

const ACCESS_TOKEN_SECONDS = 60 * 60
const REFRESH_TOKEN_SECONDS = 60 * 60 * 24 * 30
const AUTH_CODE_SECONDS = 5 * 60
const AUTH_TRANSACTION_SECONDS = 10 * 60

interface McpOAuthTransaction {
  clientId: string
  clientName: string | null
  redirectUri: string
  state?: string
  scope: string
  resource: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
  createdAt: string
}

@Injectable()
export class McpOAuthService {
  private readonly logger = new Logger(McpOAuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  getProtectedResourceMetadata(req: Request) {
    const baseUrl = this.getPublicBaseUrl(req)
    return {
      resource: this.getResource(req),
      authorization_servers: [baseUrl],
      scopes_supported: [...MCP_OAUTH_SCOPES],
      bearer_methods_supported: ['header'],
      resource_documentation: `${baseUrl}/api/v1/mcp/connection`,
    }
  }

  getAuthorizationServerMetadata(req: Request) {
    const baseUrl = this.getPublicBaseUrl(req)
    return {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      scopes_supported: [...MCP_OAUTH_SCOPES],
      service_documentation: `${baseUrl}/api/v1/mcp/connection`,
    }
  }

  async registerClient(body: McpOAuthRegisterRequest, req: Request) {
    const redirectUris = this.validateRedirectUris(body.redirect_uris)
    const grantTypes = body.grant_types?.length ? body.grant_types : ['authorization_code', 'refresh_token']
    const responseTypes = body.response_types?.length ? body.response_types : ['code']
    const authMethod = body.token_endpoint_auth_method || 'none'

    if (!grantTypes.every((grant) => ['authorization_code', 'refresh_token'].includes(grant))) {
      throw new BadRequestException({ error: 'invalid_client_metadata', error_description: 'Unsupported grant type.' })
    }
    if (!responseTypes.every((type) => type === 'code')) {
      throw new BadRequestException({ error: 'invalid_client_metadata', error_description: 'Unsupported response type.' })
    }
    if (!['none', 'client_secret_post'].includes(authMethod)) {
      throw new BadRequestException({ error: 'invalid_client_metadata', error_description: 'Unsupported token auth method.' })
    }

    const clientId = `mcp_${this.randomToken(24)}`
    const clientSecret = authMethod === 'client_secret_post' ? this.randomToken(32) : undefined
    const client = await (this.prisma as any).mcpOAuthClient.create({
      data: {
        clientId,
        clientSecretHash: clientSecret ? this.hash(clientSecret) : null,
        redirectUris,
        clientName: this.cleanClientName(body.client_name),
        grantTypes,
        responseTypes,
        tokenEndpointAuthMethod: authMethod,
      },
    })

    this.logger.log(`MCP OAuth client registered: ${client.clientId}`)
    return {
      client_id: client.clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      redirect_uris: redirectUris,
      client_name: client.clientName,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: authMethod,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    }
  }

  async createAuthorizationTransaction(query: McpOAuthAuthorizeQuery, req: Request) {
    if (query.response_type !== 'code') throw this.oauthBadRequest('unsupported_response_type')
    if (!query.client_id || !query.redirect_uri || !query.code_challenge) {
      throw this.oauthBadRequest('invalid_request')
    }
    if (query.code_challenge_method !== 'S256') throw this.oauthBadRequest('invalid_request', 'PKCE S256 is required.')

    const scope = this.normalizeScope(query.scope)
    const resource = this.normalizeResource(query.resource, req)
    const client = await this.findActiveClient(query.client_id)
    if (!client) throw this.oauthBadRequest('invalid_client')
    if (!this.redirectUriRegistered(client.redirectUris, query.redirect_uri)) {
      throw this.oauthBadRequest('invalid_request', 'redirect_uri mismatch.')
    }

    const transactionId = `mcp_tx_${this.randomToken(24)}`
    const transaction: McpOAuthTransaction = {
      clientId: client.clientId,
      clientName: client.clientName,
      redirectUri: query.redirect_uri,
      ...(query.state ? { state: query.state } : {}),
      scope,
      resource,
      codeChallenge: query.code_challenge,
      codeChallengeMethod: 'S256',
      createdAt: new Date().toISOString(),
    }

    await this.redis.setWithTTL(this.transactionKey(transactionId), JSON.stringify(transaction), AUTH_TRANSACTION_SECONDS)
    return {
      transactionId,
      redirectTo: `/oauth/consent?transaction=${encodeURIComponent(transactionId)}`,
    }
  }

  async getAuthorizationTransaction(transactionId: string) {
    const transaction = await this.readTransaction(transactionId)
    return {
      transactionId,
      clientName: transaction.clientName || 'ChatGPT',
      scope: transaction.scope,
      resource: transaction.resource,
      description: 'ChatGPT 希望读取矩阵流账号、视频和运营分析数据。',
    }
  }

  async approveAuthorizationTransaction(transactionId: string, user: any) {
    if (!user?.id || !user?.organizationId) {
      throw new UnauthorizedException('User must be logged in and belong to an organization.')
    }
    const transaction = await this.readTransaction(transactionId)
    const redirectTo = await this.createAuthorizationCodeRedirect(transaction, user)
    await this.redis.del(this.transactionKey(transactionId))
    return { redirectTo }
  }

  async denyAuthorizationTransaction(transactionId: string) {
    const transaction = await this.readTransaction(transactionId)
    await this.redis.del(this.transactionKey(transactionId))
    const redirect = new URL(transaction.redirectUri)
    redirect.searchParams.set('error', 'access_denied')
    if (transaction.state) redirect.searchParams.set('state', transaction.state)
    return { redirectTo: redirect.toString() }
  }

  private async createAuthorizationCodeRedirect(transaction: McpOAuthTransaction, user: any): Promise<string> {
    const code = this.randomToken(32)
    await (this.prisma as any).mcpOAuthAuthorizationCode.create({
      data: {
        codeHash: this.hash(code),
        clientId: transaction.clientId,
        userId: user.id,
        organizationId: user.organizationId,
        redirectUri: transaction.redirectUri,
        scope: transaction.scope,
        resource: transaction.resource,
        codeChallenge: transaction.codeChallenge,
        codeChallengeMethod: 'S256',
        expiresAt: new Date(Date.now() + AUTH_CODE_SECONDS * 1000),
      },
    })

    const redirect = new URL(transaction.redirectUri)
    redirect.searchParams.set('code', code)
    if (transaction.state) redirect.searchParams.set('state', transaction.state)
    return redirect.toString()
  }

  async token(body: McpOAuthTokenRequest, req: Request) {
    if (body.grant_type === 'authorization_code') return this.exchangeCode(body, req)
    if (body.grant_type === 'refresh_token') return this.refreshToken(body, req)
    throw new BadRequestException({ error: 'unsupported_grant_type' })
  }

  async resolveAccessToken(token: string): Promise<McpAuthContext | null> {
    const row = await (this.prisma as any).mcpOAuthToken.findUnique({
      where: { accessTokenHash: this.hash(token) },
    })
    if (!row || row.revokedAt || row.accessExpiresAt <= new Date()) return null
    return {
      authType: 'oauth',
      userId: row.userId,
      organizationId: row.organizationId,
      clientId: row.clientId,
      token,
      scopes: this.scopeList(row.scope),
      isLegacyGlobalKey: false,
    }
  }

  private async exchangeCode(body: McpOAuthTokenRequest, req: Request) {
    if (!body.code || !body.client_id || !body.redirect_uri || !body.code_verifier) {
      throw new BadRequestException({ error: 'invalid_request' })
    }
    const client = await this.authenticateClient(body)
    const codeHash = this.hash(body.code)
    const code = await (this.prisma as any).mcpOAuthAuthorizationCode.findUnique({ where: { codeHash } })
    if (!code || code.consumedAt || code.expiresAt <= new Date()) throw new BadRequestException({ error: 'invalid_grant' })
    if (code.clientId !== client.clientId || code.redirectUri !== body.redirect_uri) {
      throw new BadRequestException({ error: 'invalid_grant' })
    }
    if (code.resource !== this.normalizeResource(body.resource, req)) throw new BadRequestException({ error: 'invalid_target' })
    if (!this.verifyPkce(body.code_verifier, code.codeChallenge)) throw new BadRequestException({ error: 'invalid_grant' })

    await (this.prisma as any).mcpOAuthAuthorizationCode.update({
      where: { codeHash },
      data: { consumedAt: new Date() },
    })

    const issued = await this.issueTokens(client.clientId, code.userId, code.organizationId, code.scope, code.resource)
    return issued.response
  }

  private async refreshToken(body: McpOAuthTokenRequest, req: Request) {
    if (!body.refresh_token || !body.client_id) throw new BadRequestException({ error: 'invalid_request' })
    const client = await this.authenticateClient(body)
    const refreshHash = this.hash(body.refresh_token)
    const current = await (this.prisma as any).mcpOAuthToken.findUnique({ where: { refreshTokenHash: refreshHash } })
    if (!current || current.revokedAt || current.refreshExpiresAt <= new Date()) {
      throw new BadRequestException({ error: 'invalid_grant' })
    }
    if (current.clientId !== client.clientId) throw new BadRequestException({ error: 'invalid_grant' })
    if (current.resource !== this.normalizeResource(body.resource, req)) throw new BadRequestException({ error: 'invalid_target' })

    await (this.prisma as any).mcpOAuthToken.update({
      where: { refreshTokenHash: refreshHash },
      data: { revokedAt: new Date() },
    })
    const issued = await this.issueTokens(
      current.clientId,
      current.userId,
      current.organizationId,
      current.scope,
      current.resource,
    )
    await (this.prisma as any).mcpOAuthToken.update({
      where: { refreshTokenHash: refreshHash },
      data: { replacedById: issued.tokenId },
    })
    return issued.response
  }

  private async issueTokens(clientId: string, userId: string, organizationId: string, scope: string, resource: string) {
    const accessToken = `mcp_at_${this.randomToken(32)}`
    const refreshToken = `mcp_rt_${this.randomToken(40)}`
    const token = await (this.prisma as any).mcpOAuthToken.create({
      data: {
        accessTokenHash: this.hash(accessToken),
        refreshTokenHash: this.hash(refreshToken),
        clientId,
        userId,
        organizationId,
        scope,
        resource,
        accessExpiresAt: new Date(Date.now() + ACCESS_TOKEN_SECONDS * 1000),
        refreshExpiresAt: new Date(Date.now() + REFRESH_TOKEN_SECONDS * 1000),
      },
    })
    this.logger.log(`MCP OAuth token issued for client ${clientId}, token ${this.fingerprint(accessToken)}`)
    return {
      tokenId: token.id,
      response: {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_SECONDS,
        refresh_token: refreshToken,
        scope,
      },
    }
  }

  private async authenticateClient(body: McpOAuthTokenRequest) {
    const client = await this.findActiveClient(body.client_id || '')
    if (!client) throw new UnauthorizedException({ error: 'invalid_client' })
    if (client.tokenEndpointAuthMethod === 'client_secret_post') {
      if (!body.client_secret || !client.clientSecretHash || !this.safeEquals(this.hash(body.client_secret), client.clientSecretHash)) {
        throw new UnauthorizedException({ error: 'invalid_client' })
      }
    }
    return client
  }

  private async findActiveClient(clientId: string) {
    return (this.prisma as any).mcpOAuthClient.findFirst({
      where: { clientId, revokedAt: null },
    })
  }

  private validateRedirectUris(values?: string[]): string[] {
    if (!values?.length) throw new BadRequestException({ error: 'invalid_client_metadata', error_description: 'redirect_uris required.' })
    const unique = [...new Set(values)]
    for (const value of unique) {
      const url = this.parseUrl(value, 'redirect_uri')
      if (url.protocol !== 'https:') throw new BadRequestException({ error: 'invalid_redirect_uri' })
      if (url.hash) throw new BadRequestException({ error: 'invalid_redirect_uri' })
      if (!this.isAllowedRedirectHost(url.hostname)) throw new BadRequestException({ error: 'invalid_redirect_uri' })
    }
    return unique
  }

  private isAllowedRedirectHost(hostname: string): boolean {
    const allowed = (process.env.MCP_OAUTH_REDIRECT_HOSTS || 'chatgpt.com,chat.openai.com')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
    return allowed.includes(hostname.toLowerCase())
  }

  private redirectUriRegistered(redirectUris: unknown, requested: string): boolean {
    return Array.isArray(redirectUris) && redirectUris.includes(requested)
  }

  private normalizeScope(scope?: string): string {
    const requested = (scope || MCP_OAUTH_SCOPE).split(/\s+/).filter(Boolean)
    if (requested.length === 0 || !requested.every((entry) => entry === MCP_OAUTH_SCOPE)) {
      throw this.oauthBadRequest('invalid_scope')
    }
    return MCP_OAUTH_SCOPE
  }

  private normalizeResource(resource: string | undefined, req: Request): string {
    const expected = this.getResource(req)
    if (!resource) return expected
    if (resource !== expected) {
      throw new BadRequestException({ error: 'invalid_target' })
    }
    return resource
  }

  getResource(req: Request): string {
    return `${this.getPublicBaseUrl(req)}/api/v1/mcp`
  }

  private getPublicBaseUrl(req: Request): string {
    const configuredBaseUrl = process.env.MCP_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL
    if (configuredBaseUrl) return configuredBaseUrl.replace(/\/$/, '')

    const forwardedHost = this.firstHeader(req.headers['x-forwarded-host'])
    const proto = this.firstHeader(req.headers['x-forwarded-proto']) || 'https'
    const host = forwardedHost || req.headers.host || 'ddddkiii.com'
    return `${proto}://${host}`.replace(/\/$/, '')
  }

  private firstHeader(value: string | string[] | undefined): string | null {
    if (Array.isArray(value)) return value[0] || null
    return value || null
  }

  private transactionKey(transactionId: string): string {
    return `mcp:oauth:transaction:${transactionId}`
  }

  private async readTransaction(transactionId: string): Promise<McpOAuthTransaction> {
    if (!transactionId?.startsWith('mcp_tx_')) {
      throw this.oauthBadRequest('invalid_request', 'Invalid authorization transaction.')
    }
    const raw = await this.redis.get(this.transactionKey(transactionId))
    if (!raw) throw this.oauthBadRequest('invalid_request', 'Authorization transaction expired.')
    try {
      return JSON.parse(raw) as McpOAuthTransaction
    } catch {
      await this.redis.del(this.transactionKey(transactionId))
      throw this.oauthBadRequest('invalid_request', 'Invalid authorization transaction.')
    }
  }

  private verifyPkce(verifier: string, challenge: string): boolean {
    const actual = createHash('sha256').update(verifier).digest('base64url')
    return this.safeEquals(actual, challenge)
  }

  private safeEquals(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual)
    const expectedBuffer = Buffer.from(expected)
    if (actualBuffer.length !== expectedBuffer.length) return false
    return timingSafeEqual(actualBuffer, expectedBuffer)
  }

  private parseUrl(value: string, field: string): URL {
    try {
      return new URL(value)
    } catch {
      throw new BadRequestException({ error: 'invalid_request', error_description: `${field} must be a valid URL.` })
    }
  }

  private randomToken(bytes: number): string {
    return randomBytes(bytes).toString('base64url')
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }

  private fingerprint(value: string): string {
    return this.hash(value).slice(0, 8)
  }

  private cleanClientName(value?: string): string | null {
    const trimmed = value?.trim()
    return trimmed ? trimmed.slice(0, 120) : null
  }

  private scopeList(scope: string): string[] {
    return scope.split(/\s+/).filter(Boolean)
  }

  private oauthBadRequest(error: string, description?: string) {
    return new BadRequestException({
      error,
      ...(description ? { error_description: description } : {}),
    })
  }
}
