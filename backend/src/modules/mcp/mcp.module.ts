import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpAuthResolverService } from './mcp-auth-resolver.service';
import { McpOAuthController } from './mcp-oauth.controller';
import { McpOAuthService } from './mcp-oauth.service';

@Module({
  controllers: [McpController, McpOAuthController],
  providers: [McpService, McpAuthResolverService, McpOAuthService],
  exports: [McpService, McpAuthResolverService, McpOAuthService],
})
export class McpModule {}
