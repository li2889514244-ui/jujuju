export const MCP_OAUTH_SCOPE = 'mcp:read'
export const MCP_OAUTH_SCOPES = [MCP_OAUTH_SCOPE] as const

export interface McpOAuthRegisterRequest {
  redirect_uris?: string[]
  client_name?: string
  grant_types?: string[]
  response_types?: string[]
  token_endpoint_auth_method?: string
}

export interface McpOAuthAuthorizeQuery {
  response_type?: string
  client_id?: string
  redirect_uri?: string
  state?: string
  scope?: string
  code_challenge?: string
  code_challenge_method?: string
  resource?: string
  approve?: string
}

export interface McpOAuthTokenRequest {
  grant_type?: string
  code?: string
  redirect_uri?: string
  client_id?: string
  client_secret?: string
  code_verifier?: string
  refresh_token?: string
  resource?: string
}
