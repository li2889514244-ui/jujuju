export interface McpAuthContext {
  authType: 'mcp_key' | 'oauth'
  userId?: string
  organizationId?: string
  clientId: string
  token: string
  scopes: string[]
  isLegacyGlobalKey: boolean
}
