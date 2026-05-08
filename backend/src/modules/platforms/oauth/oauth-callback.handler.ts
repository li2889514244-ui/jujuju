/**
 * OAuth回调处理器
 * 处理各平台的OAuth回调，统一格式
 */

import { Injectable, Logger } from '@nestjs/common';
import { OAuthService } from './oauth.service';

export interface CallbackResult {
  success: boolean;
  platform: string;
  accountId?: string;
  message: string;
  errorCode?: string;
}

export interface CallbackPayload {
  code: string;
  state: string;
  platform: string;
  error?: string;
  errorDescription?: string;
}

@Injectable()
export class OAuthCallbackHandler {
  private readonly logger = new Logger(OAuthCallbackHandler.name);

  constructor(private readonly oauthService: OAuthService) {}

  /**
   * 处理OAuth回调
   */
  async handle(payload: CallbackPayload): Promise<CallbackResult> {
    const { code, state, platform, error, errorDescription } = payload;

    // 处理用户拒绝授权的情况
    if (error) {
      this.logger.warn(`用户拒绝授权: ${platform}, error=${error}`);
      return {
        success: false,
        platform,
        message: errorDescription || '用户拒绝了授权请求',
        errorCode: error,
      };
    }

    if (!code) {
      return {
        success: false,
        platform,
        message: '缺少授权码',
        errorCode: 'MISSING_CODE',
      };
    }

    try {
      const result = await this.oauthService.handleCallback(code, state);
      return {
        success: result.success,
        platform: result.platform || platform,
        accountId: result.accountId,
        message: result.message,
      };
    } catch (err: any) {
      this.logger.error(`回调处理异常: ${platform}`, err);
      return {
        success: false,
        platform,
        message: err.message || '回调处理异常',
        errorCode: 'CALLBACK_ERROR',
      };
    }
  }

  /**
   * 批量处理多个回调（用于并发授权场景）
   */
  async handleBatch(payloads: CallbackPayload[]): Promise<CallbackResult[]> {
    const results: CallbackResult[] = [];

    for (const payload of payloads) {
      const result = await this.handle(payload);
      results.push(result);
    }

    return results;
  }
}
