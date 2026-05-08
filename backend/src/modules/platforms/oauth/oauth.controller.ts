/**
 * OAuth回调处理控制器
 */

import {
  Controller,
  Get,
  Query,
  Res,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { OAuthService } from './oauth.service';

@ApiTags('platforms-oauth')
@Controller('platforms/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(private readonly oauthService: OAuthService) {}

  /**
   * 获取授权URL — 前端跳转到此URL进行授权
   */
  @Get('authorize/:platform')
  @ApiOperation({ summary: '获取平台OAuth授权URL' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'teamId', required: false })
  getAuthorizeUrl(
    @Query('platform') platform: string,
    @Query('userId') userId: string,
    @Query('teamId') teamId?: string,
  ) {
    const url = this.oauthService.buildAuthorizeUrl(platform, userId, teamId);
    return { url };
  }

  /**
   * OAuth回调 — 平台授权后重定向到此
   */
  @Get('callback/:platform')
  @ApiOperation({ summary: 'OAuth回调处理' })
  @ApiQuery({ name: 'code', required: true })
  @ApiQuery({ name: 'state', required: true })
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('platform') platform: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.oauthService.handleCallback(code, state);

      if (result.success) {
        // 重定向到前端的成功页面
        const redirectUrl = `/platforms?status=success&platform=${result.platform}&accountId=${result.accountId}`;
        return res.redirect(redirectUrl);
      } else {
        const redirectUrl = `/platforms?status=error&platform=${result.platform}&message=${encodeURIComponent(result.message)}`;
        return res.redirect(redirectUrl);
      }
    } catch (error: any) {
      this.logger.error('OAuth回调处理失败', error);
      const redirectUrl = `/platforms?status=error&message=${encodeURIComponent(error.message)}`;
      return res.redirect(redirectUrl);
    }
  }
}
