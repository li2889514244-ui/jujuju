/**
 * 抖音开放平台API客户端
 */

import { BasePlatformClient, PlatformToken, PlatformApiError } from './base-client';
import { DOUYIN_CONFIG, PlatformApiConfig } from '../config/platform-config';

interface DouyinTokenResponse {
  data: {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    refresh_expires_in: number;
    open_id: string;
    scope: string;
  };
  error_code: number;
  description: string;
}

interface DouyinUserInfo {
  data: {
    user: {
      open_id: string;
      nickname: string;
      avatar: string;
      bio_description?: string;
      follower_count?: number;
      following_count?: number;
    };
  };
  error_code: number;
  description: string;
}

interface DouyinVideoList {
  data: {
    list: Array<{
      item_id: string;
      title: string;
      cover: string;
      create_time: number;
      statistics: {
        play_count: number;
        digg_count: number;
        comment_count: number;
        share_count: number;
      };
    }>;
    cursor: number;
    has_more: boolean;
  };
  error_code: number;
}

export class DouyinClient extends BasePlatformClient {
  constructor(config?: PlatformApiConfig) {
    super('DOUYIN', config || DOUYIN_CONFIG.api);
  }

  buildAuthorizeUrl(state: string): string {
    const { clientId, callbackUrl, scopes } = DOUYIN_CONFIG.oauth;
    const params = new URLSearchParams({
      client_key: clientId,
      response_type: 'code',
      scope: scopes.join(','),
      redirect_uri: callbackUrl,
      state,
    });
    return `${DOUYIN_CONFIG.oauth.authorizeUrl}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<PlatformToken> {
    const { clientId, clientSecret, tokenUrl } = DOUYIN_CONFIG.oauth;

    const response = await this.http.post<DouyinTokenResponse>(tokenUrl, {
      client_key: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    });

    if (response.data.error_code !== 0) {
      throw new PlatformApiError(
        `抖音Token交换失败: ${response.data.description}`,
        response.data.error_code,
        'DOUYIN',
      );
    }

    const tokenData = response.data.data;
    const token: PlatformToken = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      scope: tokenData.scope,
    };

    this.setToken(token);
    return token;
  }

  protected async refreshToken(): Promise<PlatformToken> {
    if (!this.token?.refreshToken) {
      throw new PlatformApiError('无可用的刷新Token', 401, 'DOUYIN');
    }

    const { clientId, clientSecret, refreshTokenUrl } = DOUYIN_CONFIG.oauth;

    const response = await this.http.post<DouyinTokenResponse>(refreshTokenUrl, {
      client_key: clientId,
      client_secret: clientSecret,
      refresh_token: this.token.refreshToken,
      grant_type: 'refresh_token',
    });

    if (response.data.error_code !== 0) {
      throw new PlatformApiError(
        `抖音Token刷新失败: ${response.data.description}`,
        response.data.error_code,
        'DOUYIN',
        undefined,
        true,
      );
    }

    const tokenData = response.data.data;
    const token: PlatformToken = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      scope: tokenData.scope,
    };

    this.setToken(token);
    return token;
  }

  async getUserInfo(): Promise<{
    platformUserId: string;
    nickname: string;
    avatar: string;
    bio?: string;
    followers?: number;
    following?: number;
  }> {
    const response = await this.get<DouyinUserInfo>('/douyin/v1/user/info/');

    if (response.error_code !== 0) {
      throw new PlatformApiError(
        '获取抖音用户信息失败',
        response.error_code,
        'DOUYIN',
      );
    }

    const user = response.data.user;
    return {
      platformUserId: user.open_id,
      nickname: user.nickname,
      avatar: user.avatar,
      bio: user.bio_description,
      followers: user.follower_count,
      following: user.following_count,
    };
  }

  /**
   * 获取用户视频列表
   */
  async getVideoList(cursor = 0, count = 20) {
    return this.get<DouyinVideoList>('/douyin/v1/video/list/', {
      cursor,
      count,
    });
  }

  /**
   * 获取视频数据
   */
  async getVideoData(itemIds: string[]) {
    return this.post('/douyin/v1/video/data/', { item_ids: itemIds });
  }

  protected extractData<T>(response: any): T {
    return response.data as T;
  }
}
