export interface McpTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}
export declare const ALL_MCP_TOOLS: McpTool[];
export declare function getToolByName(name: string): McpTool | undefined;
