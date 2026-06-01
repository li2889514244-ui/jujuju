import { McpService, McpQueryRequest, McpQueryResponse } from './mcp.service';
export declare class McpController {
    private readonly mcpService;
    private readonly logger;
    constructor(mcpService: McpService);
    query(body: McpQueryRequest): Promise<McpQueryResponse>;
    getTools(): {
        success: boolean;
        data: import("./mcp-tools").McpTool[];
    };
}
