import { get } from './request'

export interface McpCatalogEntry {
  name: string
  title: string
  description: string
}

export interface McpConnectionInfo {
  enabled: boolean
  serverName: string
  transport: 'streamable-http'
  endpoint: string
  endpointPath: string
  auth: {
    type: 'bearer'
    header: string
    keyCount: number
    clients: Array<{ clientId: string }>
  }
  limits: {
    maxRows: number
    maxRangeDays: number
  }
  originPolicy: {
    mode: 'any' | 'allowlist'
    allowedOrigins: string[]
  }
  tools: McpCatalogEntry[]
  resources: McpCatalogEntry[]
  examples: {
    genericHttp: {
      type: 'http'
      url: string
      headers: {
        Authorization: string
      }
    }
  }
}

export const mcpApi = {
  getConnectionInfo() {
    return get<McpConnectionInfo>('/mcp/connection')
  },
}
