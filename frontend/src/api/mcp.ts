import { get, post } from './request'

export interface MCPTool {
  name: string
  description: string
  parameters?: Record<string, unknown>
}

export interface MCPTableData {
  columns: string[]
  rows: Record<string, unknown>[]
}

export interface MCPQueryResult {
  text?: string
  table?: MCPTableData
  csv_url?: string
}

export const mcpApi = {
  getTools(): Promise<MCPTool[]> {
    return get<MCPTool[]>('/mcp/tools').then((res) => res.data)
  },

  query(query: string): Promise<MCPQueryResult> {
    return post<MCPQueryResult>('/mcp/query', { query }).then((res) => res.data)
  },
}
