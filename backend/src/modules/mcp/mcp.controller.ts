import { createHash, timingSafeEqual } from 'crypto'
import { Controller, Delete, Get, HttpStatus, Logger, Post, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { Public } from '../../common/decorators/public.decorator'
import { McpClientAuth, McpService } from './mcp.service'

interface ConfiguredMcpKey {
  clientId: string
  token: string
}

@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name)

  constructor(private readonly mcpService: McpService) {}

  @Get('connection')
  getConnectionInfo(@Req() req: Request) {
    const configuredKeys = this.getConfiguredKeys()
    const catalog = this.mcpService.getCatalog()
    const endpointPath = '/api/v1/mcp'
    const endpoint = `${this.getPublicBaseUrl(req)}${endpointPath}`
    const allowedOrigins = this.getAllowedOrigins()

    return {
      enabled: configuredKeys.length > 0,
      serverName: 'matrixflow-readonly',
      transport: 'streamable-http',
      endpoint,
      endpointPath,
      auth: {
        type: 'bearer',
        header: 'Authorization: Bearer <MCP key>',
        keyCount: configuredKeys.length,
        clients: configuredKeys.map((key) => ({ clientId: key.clientId })),
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
      examples: {
        genericHttp: {
          type: 'http',
          url: endpoint,
          headers: {
            Authorization: 'Bearer <MCP key>',
          },
        },
      },
    }
  }

  @Public()
  @Post()
  async handleMcpPost(@Req() req: Request, @Res() res: Response) {
    const auth = this.authenticate(req, res)
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
  handleMcpGet(@Req() req: Request, @Res() res: Response) {
    const auth = this.authenticate(req, res)
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
  handleMcpDelete(@Req() req: Request, @Res() res: Response) {
    const auth = this.authenticate(req, res)
    if (!auth) return
    this.writeMcpError(
      res,
      HttpStatus.METHOD_NOT_ALLOWED,
      -32000,
      'Method not allowed. This MCP endpoint is stateless.',
    )
  }

  private authenticate(req: Request, res: Response): McpClientAuth | null {
    if (!this.isOriginAllowed(req.headers.origin)) {
      this.writeMcpError(
        res,
        HttpStatus.FORBIDDEN,
        -32000,
        'Origin is not allowed for MatrixFlow MCP.',
      )
      return null
    }

    const configuredKeys = this.getConfiguredKeys()
    if (configuredKeys.length === 0) {
      this.writeMcpError(
        res,
        HttpStatus.SERVICE_UNAVAILABLE,
        -32000,
        'MatrixFlow MCP is disabled until MCP_API_KEYS is configured.',
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

    this.logger.log(`MCP request authenticated for ${key.clientId}`)
    return {
      clientId: key.clientId,
      token,
      scopes: ['mcp:read'],
    }
  }

  private getConfiguredKeys(): ConfiguredMcpKey[] {
    const raw = process.env.MCP_API_KEYS || process.env.MCP_READ_TOKEN || ''

    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry, index) => {
        const separator = entry.indexOf(':')
        if (separator > 0) {
          return {
            clientId: entry.slice(0, separator).trim(),
            token: entry.slice(separator + 1).trim(),
          }
        }

        const fingerprint = createHash('sha256').update(entry).digest('hex').slice(0, 8)
        return {
          clientId: `mcp-client-${index + 1}-${fingerprint}`,
          token: entry,
        }
      })
      .filter((entry) => entry.token.length > 0)
  }

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
    const forwardedProto = this.firstHeader(req.headers['x-forwarded-proto'])
    const forwardedHost = this.firstHeader(req.headers['x-forwarded-host'])
    const proto = forwardedProto || req.protocol || 'http'
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
