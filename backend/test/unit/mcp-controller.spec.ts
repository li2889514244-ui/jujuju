import type { Request } from 'express'
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator'
import { Role } from '../../src/common/prisma-enums'
import { McpController } from '../../src/modules/mcp/mcp.controller'

describe('McpController', () => {
  const originalEnv = {
    MCP_MAX_ROWS: process.env.MCP_MAX_ROWS,
    MCP_MAX_RANGE_DAYS: process.env.MCP_MAX_RANGE_DAYS,
  }

  const restoreEnv = () => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }

  afterEach(() => {
    restoreEnv()
  })

  it('returns finite bounded MCP limits when env values are malformed or oversized', async () => {
    process.env.MCP_MAX_ROWS = 'abc'
    process.env.MCP_MAX_RANGE_DAYS = '999999'

    const controller = new McpController({
      getConfiguredKeys: jest.fn().mockResolvedValue([]),
      getCatalog: jest.fn().mockReturnValue({ tools: [], resources: [] }),
    } as any, { resolveAuthorization: jest.fn() } as any)

    const result = await controller.getConnectionInfo({
      headers: { host: 'matrixflow.local' },
    } as unknown as Request)

    expect(result.limits).toEqual({
      maxRows: 500,
      maxRangeDays: 3660,
    })
  })

  it('limits MCP key and connection management to admin roles', () => {
    const allowed = [Role.SUPER_ADMIN, Role.OWNER, Role.ADMIN]
    for (const method of ['listKeys', 'createKey', 'deleteKey', 'getConnectionInfo'] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, McpController.prototype[method])).toEqual(allowed)
    }
  })

  it('rejects SSE messages when bearer auth does not match the session auth context', async () => {
    const sessionAuth = {
      authType: 'mcp_key',
      clientId: 'client-a',
      token: 'token-a',
      scopes: ['mcp:read'],
      organizationId: 'org-a',
      userId: 'user-a',
      isLegacyGlobalKey: false,
    }
    const messageAuth = { ...sessionAuth, token: 'token-b' }
    const transport = { handlePostMessage: jest.fn() }
    const controller = new McpController({ getConfiguredKeys: jest.fn() } as any, {
      resolveAuthorization: jest.fn(),
    } as any)

    ;(controller as any).sseSessions.set('session-1', { transport, auth: sessionAuth })
    jest.spyOn(controller as any, 'authenticate').mockResolvedValue(messageAuth)

    const res = {
      headersSent: false,
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }

    await controller.handleSseMessage({ headers: {}, body: {} } as any, res as any, 'session-1')

    expect(transport.handlePostMessage).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })
})
