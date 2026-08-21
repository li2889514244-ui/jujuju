import { del, get, post } from './request'

export interface McpCatalogEntry {
  name: string
  title: string
  description: string
}

export interface McpConnectionInfo {
  enabled: boolean
  serverName: string
  transports: string[]
  endpoint: string
  endpointPath: string
  sseEndpoint: string
  messagesEndpoint: string
  auth: {
    type: 'bearer'
    header: string
    keyCount: number
    clients: Array<{ clientId: string; source: string }>
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
}

export interface McpKey {
  id: string
  clientId: string
  token: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
  source: 'db' | 'env'
}

export interface McpKeyList {
  dbKeys: McpKey[]
  envKeys: McpKey[]
}

export const mcpApi = {
  getConnectionInfo() {
    return get<McpConnectionInfo>('/mcp/connection')
  },

  listKeys() {
    return get<McpKeyList>('/mcp/keys')
  },

  createKey(clientId: string) {
    return post<McpKey>('/mcp/keys', { clientId })
  },

  deleteKey(id: string) {
    return del<{ success: boolean }>(`/mcp/keys/${id}`)
  },
}
