import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
import { McpService, McpQueryRequest, McpQueryResponse } from './mcp.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcpService: McpService) {}

  /**
   * POST /api/v1/mcp/query
   * 接收自然语言查询或明确 Tool 调用请求，返回结构化 JSON。
   */
  @Public()
  @Post('query')
  async query(@Body() body: McpQueryRequest): Promise<McpQueryResponse> {
    this.logger.log(`MCP query: ${body.query || body.toolName || '(direct call)'}`);
    return this.mcpService.handleQuery(body);
  }

  /**
   * GET /api/v1/mcp/tools
   * 返回所有已注册的 MCP Tool 定义列表。
   */
  @Public()
  @Get('tools')
  getTools() {
    return {
      success: true,
      data: this.mcpService.getTools(),
    };
  }
}