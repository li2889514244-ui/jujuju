import axios from 'axios'
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

export interface McpOAuthHealth {
  protectedResource: {
    ok: boolean
    resource?: string
    authorizationServers?: string[]
    error?: string
  }
  authorizationServer: {
    ok: boolean
    issuer?: string
    authorizationEndpoint?: string
    tokenEndpoint?: string
    registrationEndpoint?: string
    error?: string
  }
  dcr: {
    ok: boolean
    supported?: boolean
    error?: string
  }
}

export interface McpOAuthAuthorizationInfo {
  transactionId: string
  clientName: string
  scope: string
  resource: string
  description: string
}

export interface McpOAuthAuthorizationResult {
  redirectTo: string
}

function rootUrl(path: string) {
  return new URL(path, window.location.origin).toString()
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

  async checkOAuthHealth(): Promise<McpOAuthHealth> {
    const protectedResource = await axios
      .get(rootUrl('/.well-known/oauth-protected-resource'), { timeout: 10000 })
      .then((res) => ({
        ok: true,
        resource: res.data?.resource,
        authorizationServers: res.data?.authorization_servers,
      }))
      .catch((error) => ({ ok: false, error: error.message || 'request failed' }))

    const authorizationServer = await axios
      .get(rootUrl('/.well-known/oauth-authorization-server'), { timeout: 10000 })
      .then((res) => ({
        ok: true,
        issuer: res.data?.issuer,
        authorizationEndpoint: res.data?.authorization_endpoint,
        tokenEndpoint: res.data?.token_endpoint,
        registrationEndpoint: res.data?.registration_endpoint,
      }))
      .catch((error) => ({ ok: false, error: error.message || 'request failed' }))

    const dcrSupported =
      authorizationServer.ok && 'registrationEndpoint' in authorizationServer
        ? Boolean(authorizationServer.registrationEndpoint)
        : false

    return {
      protectedResource,
      authorizationServer,
      dcr: {
        ok: dcrSupported,
        supported: dcrSupported,
        ...(!authorizationServer.ok && 'error' in authorizationServer
          ? { error: authorizationServer.error }
          : {}),
      },
    }
  },

  getOAuthAuthorization(transactionId: string) {
    return get<McpOAuthAuthorizationInfo>(`/mcp/oauth/authorization/${encodeURIComponent(transactionId)}`)
  },

  approveOAuthAuthorization(transactionId: string) {
    return post<McpOAuthAuthorizationResult>(`/mcp/oauth/authorization/${encodeURIComponent(transactionId)}/approve`)
  },

  denyOAuthAuthorization(transactionId: string) {
    return post<McpOAuthAuthorizationResult>(`/mcp/oauth/authorization/${encodeURIComponent(transactionId)}/deny`)
  },
}
