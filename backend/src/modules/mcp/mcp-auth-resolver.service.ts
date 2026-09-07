import { Injectable, Logger } from '@nestjs/common'
import { timingSafeEqual } from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { McpService } from './mcp.service'
import { McpAuthContext } from './mcp-auth-context'
import { McpOAuthService } from './mcp-oauth.service'

@Injectable()
export class McpAuthResolverService {
  private readonly logger = new Logger(McpAuthResolverService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mcpService: McpService,
    private readonly mcpOAuthService: McpOAuthService,
  ) {}

  async resolveAuthorization(token: string): Promise<McpAuthContext | null> {
    return (await this.mcpOAuthService.resolveAccessToken(token)) || this.resolveLegacyMcpKey(token)
  }

  private async resolveLegacyMcpKey(token: string): Promise<McpAuthContext | null> {
    const configuredKeys = await this.mcpService.getConfiguredKeys()
    const key = configuredKeys.find((candidate) => this.safeTokenEquals(token, candidate.token))
    if (!key) return null

    let user: { id: string; organizationId: string | null } | null = null
    if (key.source === 'db' && key.createdBy) {
      user = await this.prisma.user.findUnique({
        where: { id: key.createdBy },
        select: { id: true, organizationId: true },
      })
    }

    const organizationId = user?.organizationId || undefined
    const isLegacyGlobalKey = key.source === 'env' || !organizationId
    if (key.source === 'db' && !organizationId) {
      this.logger.warn(`MCP DB key ${key.clientId} has no organization binding; preserving global read compatibility`)
    }

    return {
      authType: 'mcp_key',
      userId: user?.id,
      organizationId,
      clientId: key.clientId,
      token,
      scopes: ['mcp:read'],
      isLegacyGlobalKey,
    }
  }

  private safeTokenEquals(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual)
    const expectedBuffer = Buffer.from(expected)

    if (actualBuffer.length !== expectedBuffer.length) return false
    return timingSafeEqual(actualBuffer, expectedBuffer)
  }
}
