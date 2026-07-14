import { timingSafeEqual } from 'crypto'
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { Public } from '../../common/decorators/public.decorator'
import { McpService } from './mcp.service'

@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name)
  private sseTransports = new Map<string, SSEServerTransport>()

  constructor(private readonly mcpService: McpService) {}

  // ==================== Key 管理 (需要 JWT 登录) ====================

  @Get('keys')
  async listKeys() {
    const [keys, configuredKeys] = await Promise.all([
      this.mcpService.listKeys(),
      this.mcpService.getConfiguredKeys(),
    ])
    const envKeys = configuredKeys.filter((k) => k.source === 'env')
    return {
      dbKeys: keys.map((k) => ({
        id: k.id,
        clientId: k.clientId,
        token: k.token,
        createdBy: k.createdBy,
        createdAt: k.createdAt.toISOString(),
        updatedAt: k.updatedAt.toISOString(),
        source: 'db',
      })),
      envKeys: envKeys.map((k) => ({
        id: k.id,
        clientId: k.clientId,
        token: k.token,
        source: 'env',
      })),
    }
  }

  @Post('keys')
  @HttpCode(HttpStatus.CREATED)
  async createKey(@Body() body: { clientId: string }, @Req() req: Request) {
    const createdBy = (req as any).user?.userId || null
    const key = await this.mcpService.createKey(body.clientId, createdBy)
    return {
      id: key.id,
      clientId: key.clientId,
      token: key.token,
      createdBy: key.createdBy,
      createdAt: key.createdAt.toISOString(),
      updatedAt: key.updatedAt.toISOString(),
      source: 'db',
    }
  }

  @Delete('keys/:id')
  async deleteKey(@Param('id') id: string) {
    await this.mcpService.deleteKey(id)
    return { success: true }
  }

  // ==================== 连接信息 (需要 JWT 登录) ====================

  @Get('connection')
  async getConnectionInfo(@Req() req: Request) {
    const configuredKeys = await this.mcpService.getConfiguredKeys()
    const catalog = this.mcpService.getCatalog()
    const endpointPath = '/api/v1/mcp'
    const endpoint = `${this.getPublicBaseUrl(req)}${endpointPath}`
    const sseEndpoint = `${this.getPublicBaseUrl(req)}/api/v1/mcp/sse`
    const messagesEndpoint = `${this.getPublicBaseUrl(req)}/api/v1/mcp/messages`
    const allowedOrigins = this.getAllowedOrigins()

    return {
      enabled: configuredKeys.length > 0,
      serverName: 'matrixflow-readonly',
      transports: ['streamable-http', 'sse'],
      endpoint,
      endpointPath,
      sseEndpoint,
      messagesEndpoint,
      auth: {
        type: 'bearer',
        header: 'Authorization: Bearer <MCP key>',
        keyCount: configuredKeys.length,
        clients: configuredKeys.map((key) => ({
          clientId: key.clientId,
          source: key.source,
        })),
      },
      limits: {
        maxRows: Number(process.env.MCP_MAX_ROWS || 500),
        maxRangeDays: Number(process.env.MCP_MAX_RANGE_DAYS || 366),
      },
      originPolicy: {
        mode: allowedOrigins.length > 0 ? 'allowlist' : 'any',
        allowedOrigins,
      },
      tools: catalog.tools,
      resources: catalog.resources,
    }
  }

  // ==================== Streamable HTTP 传输 (无状态) ====================

  @Public()
  @Post()
  async handleMcpPost(@Req() req: Request, @Res() res: Response) {
    const auth = await this.authenticate(req, res)
    if (!auth) return

    const server = this.mcpService.createServer(auth)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })

    let cleaned = false
    const cleanup = async () => {
      if (cleaned) return
      cleaned = true
      await Promise.allSettled([transport.close(), server.close()])
    }

    res.on('close', () => {
      void cleanup()
    })

    try {
      ;(req as any).auth = {
        token: auth.token,
        clientId: auth.clientId,
        scopes: auth.scopes,
      }

      await server.connect(transport)
      await transport.handleRequest(req as any, res as any, req.body)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal MCP error'
      this.logger.error(
        `MCP request failed for ${auth.clientId}: ${message}`,
        error instanceof Error ? error.stack : '',
      )

      if (!res.headersSent) {
        this.writeMcpError(res, HttpStatus.INTERNAL_SERVER_ERROR, -32603, 'Internal server error')
      }
      await cleanup()
    }
  }

  @Public()
  @Get()
  async handleMcpGet(@Req() req: Request, @Res() res: Response) {
    const auth = await this.authenticate(req, res)
    if (!auth) return
    this.writeMcpError(
      res,
      HttpStatus.METHOD_NOT_ALLOWED,
      -32000,
      'Method not allowed. Use POST for this stateless MCP endpoint.',
    )
  }

  @Public()
  @Delete()
  async handleMcpDelete(@Req() req: Request, @Res() res: Response) {
    const auth = await this.authenticate(req, res)
    if (!auth) return
    this.writeMcpError(
      res,
      HttpStatus.METHOD_NOT_ALLOWED,
      -32000,
      'Method not allowed. This MCP endpoint is stateless.',
    )
  }

  // ==================== SSE 传输 (旧协议, 兼容更多客户端) ====================

  @Public()
  @Get('sse')
  async handleSseConnection(@Req() req: Request, @Res() res: Response) {
    const auth = await this.authenticate(req, res)
    if (!auth) return

    const transport = new SSEServerTransport('/api/v1/mcp/messages', res)
    this.sseTransports.set(transport.sessionId, transport)

    const server = this.mcpService.createServer(auth)

    res.on('close', () => {
      this.sseTransports.delete(transport.sessionId)
      void server.close().catch(() => {})
    })

    try {
      ;(req as any).auth = {
        token: auth.token,
        clientId: auth.clientId,
        scopes: auth.scopes,
      }
      await server.connect(transport)
    } catch (error) {
      this.logger.error(
        `SSE connection failed for ${auth.clientId}: ${error instanceof Error ? error.message : 'unknown'}`,
      )
      this.sseTransports.delete(transport.sessionId)
      if (!res.headersSent) {
        this.writeMcpError(res, HttpStatus.INTERNAL_SERVER_ERROR, -32603, 'Internal server error')
      }
    }
  }

  @Public()
  @Post('messages')
  async handleSseMessage(
    @Req() req: Request,
    @Res() res: Response,
    @Query('sessionId') sessionId: string,
  ) {
    const auth = await this.authenticate(req, res)
    if (!auth) return

    const transport = this.sseTransports.get(sessionId)
    if (!transport) {
      this.writeMcpError(res, HttpStatus.NOT_FOUND, -32000, `Session not found: ${sessionId}`)
      return
    }

    try {
      ;(req as any).auth = {
        token: auth.token,
        clientId: auth.clientId,
        scopes: auth.scopes,
      }
      await transport.handlePostMessage(req as any, res as any, req.body)
    } catch (error) {
      this.logger.error(
        `SSE message handling failed for session ${sessionId}: ${error instanceof Error ? error.message : 'unknown'}`,
      )
      if (!res.headersSent) {
        this.writeMcpError(res, HttpStatus.INTERNAL_SERVER_ERROR, -32603, 'Internal server error')
      }
    }
  }

  // ==================== 认证 ====================

  private async authenticate(req: Request, res: Response) {
    if (!this.isOriginAllowed(req.headers.origin)) {
      this.writeMcpError(
        res,
        HttpStatus.FORBIDDEN,
        -32000,
        'Origin is not allowed for MatrixFlow MCP.',
      )
      return null
    }

    const configuredKeys = await this.mcpService.getConfiguredKeys()
    if (configuredKeys.length === 0) {
      this.writeMcpError(
        res,
        HttpStatus.SERVICE_UNAVAILABLE,
        -32000,
        'MatrixFlow MCP is disabled until MCP keys are configured.',
      )
      return null
    }

    const token = this.extractBearerToken(req.headers.authorization)
    if (!token) {
      this.writeAuthError(res, 'Missing bearer token.')
      return null
    }

    const key = configuredKeys.find((candidate) => this.safeTokenEquals(token, candidate.token))
    if (!key) {
      this.writeAuthError(res, 'Invalid bearer token.')
      return null
    }

    this.logger.log(`MCP request authenticated for ${key.clientId} (source: ${key.source})`)
    return {
      clientId: key.clientId,
      token,
      scopes: ['mcp:read'],
    }
  }

  // ==================== 工具方法 ====================

  private extractBearerToken(header: string | string[] | undefined): string | null {
    const value = Array.isArray(header) ? header[0] : header
    if (!value) return null

    const match = value.match(/^Bearer\s+(.+)$/i)
    return match?.[1]?.trim() || null
  }

  private safeTokenEquals(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual)
    const expectedBuffer = Buffer.from(expected)

    if (actualBuffer.length !== expectedBuffer.length) return false
    return timingSafeEqual(actualBuffer, expectedBuffer)
  }

  private isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) return true

    const allowed = this.getAllowedOrigins()
    if (allowed.length === 0) return true

    return allowed.includes('*') || allowed.includes(origin)
  }

  private getAllowedOrigins(): string[] {
    return (process.env.MCP_ALLOWED_ORIGINS || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }

  private getPublicBaseUrl(req: Request): string {
    const forwardedHost = this.firstHeader(req.headers['x-forwarded-host'])
    // Always use https in production (behind Cloudflare Tunnel)
    const proto = 'https'
    const host = forwardedHost || req.headers.host || 'localhost:3000'
    return `${proto}://${host}`.replace(/\/$/, '')
  }

  private firstHeader(value: string | string[] | undefined): string | null {
    if (Array.isArray(value)) return value[0] || null
    return value || null
  }

  private writeAuthError(res: Response, message: string) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="MatrixFlow MCP"')
    this.writeMcpError(res, HttpStatus.UNAUTHORIZED, -32001, message)
  }

  private writeMcpError(res: Response, status: number, code: number, message: string) {
    if (res.headersSent) return

    res.setHeader('Cache-Control', 'no-store')
    res.status(status).json({
      jsonrpc: '2.0',
      error: { code, message },
      id: null,
    })
  }
}
