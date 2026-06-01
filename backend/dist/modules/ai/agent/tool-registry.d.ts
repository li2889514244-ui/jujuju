import { PrismaService } from '../../../prisma/prisma.service';
import { AccountsService } from '../../accounts/accounts.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { ContentService } from '../../content/content.service';
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}
export interface ToolCall {
    name: string;
    arguments: Record<string, any>;
}
export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
}
export declare class ToolRegistry {
    private prisma;
    private accountsService;
    private analyticsService;
    private contentService;
    private readonly logger;
    private tools;
    private handlers;
    constructor(prisma: PrismaService, accountsService: AccountsService, analyticsService: AnalyticsService, contentService: ContentService);
    getDefinitions(): ToolDefinition[];
    execute(tool: ToolCall, userId: string): Promise<ToolResult>;
    private registerAll;
    private register;
}
