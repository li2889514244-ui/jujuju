/**
 * 视频号API客户端（基于微信开放平台）
 */

import { BasePlatformClient, PlatformToken, PlatformApiError } from './base-client';
import { SHIPINHAO_CONFIG, PlatformApiConfig } from '../config/platform-config';

interface WechatTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  openid: string;
  scope: string;
  errcode?: number;
  errmsg?: string;
}

interface WechatUserInfo {
  openid: string;
  nickname: string;
  headimgurl: string;
  errcode?: number;
  errmsg?: string;
}

interface ShipinhaoVideoList {
  errcode: number;
  errmsg: string;
  data: {
    video_list: Array<{
      video_id: string;
      title: string;
      cover_url: string;
      create_time: number;
      stats: {
        view_count: number;
        like_count: number;
        comment_count: number;
        share_count: number;
        favorite_count: number;
      };
    }>;
    next_cursor: string;
    has_more: boolean;
  };
}

export class ShipinhaoClient extends BasePlatformClient {
  constructor(config?: PlatformApiConfig) {
    super('WECHAT_VIDEO', config || SHIPINHAO_CONFIG.api);
  }

  buildAuthorizeUrl(state: string): string {
    const { clientId, callbackUrl, scopes, authorizeUrl } = SHIPINHAO_CONFIG.oauth;
    const params = new URLSearchParams({
      appid: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: scopes.join(','),
      state,
    });
    return `${authorizeUrl}?${params.toString()}#wechat_redirect`;
  }

  async exchangeCode(code: string): Promise<PlatformToken> {
    const { clientId, clientSecret, tokenUrl } = SHIPINHAO_CONFIG.oauth;

    const params = new URLSearchParams({
      appid: clientId,
      secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    });

    const response = await this.http.get<WechatTokenResponse>(
      `${tokenUrl}?${params.toString()}`,
    );

    if (response.data.errcode) {
      throw new PlatformApiError(
        `视频号Token交换失败: ${response.data.errmsg}`,
        response.data.errcode,
        'WECHAT_VIDEO',
      );
    }

    const token: PlatformToken = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
      tokenType: 'Bearer',
      scope: response.data.scope,
    };

    this.setToken(token);
    return token;
  }

  protected async refreshToken(): Promise<PlatformToken> {
    if (!this.token?.refreshToken) {
      throw new PlatformApiError('无可用的刷新Token', 401, 'WECHAT_VIDEO');
    }

    const { clientId, refreshTokenUrl } = SHIPINHAO_CONFIG.oauth;
    const params = new URLSearchParams({
      appid: clientId,
      grant_type: 'refresh_token',
      refresh_token: this.token.refreshToken,
    });

    const response = await this.http.get<WechatTokenResponse>(
      `${refreshTokenUrl}?${params.toString()}`,
    );

    if (response.data.errcode) {
      throw new PlatformApiError(
        `视频号Token刷新失败: ${response.data.errmsg}`,
        response.data.errcode,
        'WECHAT_VIDEO',
        undefined,
        true,
      );
    }

    const token: PlatformToken = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
      tokenType: 'Bearer',
      scope: response.data.scope,
    };

    this.setToken(token);
    return token;
  }

  async getUserInfo() {
    const response = await this.get<WechatUserInfo>('/sns/userinfo', {
      access_token: this.token?.accessToken,
      openid: '', // 需从token响应获取
      lang: 'zh_CN',
    });

    if (response.errcode) {
      throw new PlatformApiError(
        `获取视频号用户信息失败: ${response.errmsg}`,
        response.errcode || 500,
        'WECHAT_VIDEO',
      );
    }

    return {
      platformUserId: response.openid,
      nickname: response.nickname,
      avatar: response.headimgurl,
    };
  }

  /**
   * 获取视频列表
   */
  async getVideoList(cursor = '', count = 20) {
    return this.post<ShipinhaoVideoList>('/finder/video_list', {
      cursor,
      count,
    });
  }

  /**
   * 获取视频数据
   */
  async getVideoData(videoIds: string[]) {
    return this.post('/finder/video_data', { video_ids: videoIds });
  }
}
