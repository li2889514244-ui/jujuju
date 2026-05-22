/**
 * 快手开放平台API客户端
 */

import { BasePlatformClient, PlatformToken, PlatformApiError } from './base-client';
import { KUAISHOU_CONFIG, PlatformApiConfig } from '../config/platform-config';

interface KuaishouTokenResponse {
  result: number;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  open_id: string;
  scopes: string;
  error_msg?: string;
}

interface KuaishouUserInfo {
  result: number;
  data: {
    open_id: string;
    user_name: string;
    head_url: string;
    user_desc?: string;
    follower_count?: number;
    following_count?: number;
  };
  error_msg?: string;
}

interface KuaishouVideoList {
  result: number;
  data: {
    list: Array<{
      photo_id: string;
      caption: string;
      cover_url: string;
      create_time: number;
      view_count: number;
      like_count: number;
      comment_count: number;
      share_count: number;
    }>;
    total_count: number;
    pcursor: string;
  };
  error_msg?: string;
}

export class KuaishouClient extends BasePlatformClient {
  constructor(config?: PlatformApiConfig) {
    super('KUAISHOU', config || KUAISHOU_CONFIG.api);
  }

  buildAuthorizeUrl(state: string): string {
    const { clientId, callbackUrl, scopes, authorizeUrl } = KUAISHOU_CONFIG.oauth;
    const params = new URLSearchParams({
      app_id: clientId,
      scope: scopes.join(','),
      redirect_uri: callbackUrl,
      response_type: 'code',
      state,
    });
    return `${authorizeUrl}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<PlatformToken> {
    const { clientId, clientSecret, tokenUrl } = KUAISHOU_CONFIG.oauth;

    const response = await this.http.post<KuaishouTokenResponse>(tokenUrl, {
      app_id: clientId,
      app_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    });

    if (response.data.result !== 1) {
      throw new PlatformApiError(
        `快手Token交换失败: ${response.data.error_msg}`,
        response.data.result,
        'KUAISHOU',
      );
    }

    const token: PlatformToken = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
      scope: response.data.scopes,
    };

    this.setToken(token);
    return token;
  }

  protected async refreshToken(): Promise<PlatformToken> {
    if (!this.token?.refreshToken) {
      throw new PlatformApiError('无可用的刷新Token', 401, 'KUAISHOU');
    }

    const { clientId, clientSecret, refreshTokenUrl } = KUAISHOU_CONFIG.oauth;

    const response = await this.http.post<KuaishouTokenResponse>(refreshTokenUrl, {
      app_id: clientId,
      app_secret: clientSecret,
      refresh_token: this.token.refreshToken,
      grant_type: 'refresh_token',
    });

    if (response.data.result !== 1) {
      throw new PlatformApiError(
        `快手Token刷新失败: ${response.data.error_msg}`,
        response.data.result,
        'KUAISHOU',
        undefined,
        true,
      );
    }

    const token: PlatformToken = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
      scope: response.data.scopes,
    };

    this.setToken(token);
    return token;
  }

  async getUserInfo() {
    const response = await this.post<KuaishouUserInfo>('/openapi/photo/user/info', {});

    if (response.result !== 1) {
      throw new PlatformApiError(
        `获取快手用户信息失败: ${response.error_msg}`,
        response.result,
        'KUAISHOU',
      );
    }

    return {
      platformUserId: response.data.open_id,
      nickname: response.data.user_name,
      avatar: response.data.head_url,
      bio: response.data.user_desc,
      followers: response.data.follower_count,
      following: response.data.following_count,
    };
  }

  /**
   * 获取视频列表
   */
  async getVideoList(pcursor = '', count = 20) {
    return this.post<KuaishouVideoList>('/openapi/photo/list', {
      pcursor,
      count,
    });
  }

  /**
   * 获取视频数据
   */
  async getVideoData(photoIds: string[]) {
    return this.post('/openapi/photo/data', { photo_ids: photoIds });
  }
}
