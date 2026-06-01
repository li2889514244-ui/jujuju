import { PrismaService } from '../../prisma/prisma.service';
import { McpTool } from './mcp-tools';
export interface McpQueryRequest {
    query: string;
    toolName?: string;
    params?: Record<string, unknown>;
}
export interface McpQueryResponse {
    success: boolean;
    data?: unknown;
    error?: string;
    toolUsed?: string;
}
export declare class McpService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getTools(): McpTool[];
    handleQuery(req: McpQueryRequest): Promise<McpQueryResponse>;
    private matchTool;
    private extractDateRange;
    private extractPlatform;
    private formatDate;
    private executeTool;
    private queryAccountData;
    private getTopRankings;
    private compareAccounts;
    private generateReport;
    private exportData;
}
