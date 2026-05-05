/**
 * 微博开放平台API客户端
 */

import { BasePlatformClient, PlatformToken, PlatformApiError } from './base-client';
import { WEIBO_CONFIG, PlatformApiConfig } from '../config/platform-config';

interface WeiboTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  uid: string;
  remind_in?: string;
  error?: string;
  error_code?: number;
  error_description?: string;
}

interface WeiboUserInfo {
  id: number;
  idstr: string;
  screen_name: string;
  profile_image_url: string;
  description?: string;
  followers_count?: number;
  friends_count?: number;
  statuses_count?: number;
  error?: string;
  error_code?: number;
}

interface WeiboStatusList {
  statuses: Array<{
    id: number;
    text: string;
    created_at: string;
    reposts_count: number;
    comments_count: number;
    attitudes_count: number;
    pic_urls?: Array<{ thumbnail_pic: string }>;
    page_info?: {
      type: string;
      page_url: string;
    };
  }>;
  total_number: number;
  hasvisible: boolean;
  previous_cursor: number;
  next_cursor: number;
}

export class WeiboClient extends BasePlatformClient {
  constructor(config?: PlatformApiConfig) {
    super('WEIBO', config || WEIBO_CONFIG.api);
  }

  buildAuthorizeUrl(state: string): string {
    const { clientId, callbackUrl, scopes, authorizeUrl } = WEIBO_CONFIG.oauth;
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: scopes.join(','),
      redirect_uri: callbackUrl,
      state,
    });
    return `${authorizeUrl}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<PlatformToken> {
    const { clientId, clientSecret, tokenUrl } = WEIBO_CONFIG.oauth;

    const response = await this.http.post<WeiboTokenResponse>(
      tokenUrl,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: WEIBO_CONFIG.oauth.callbackUrl,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    if (response.data.error || response.data.error_code) {
      throw new PlatformApiError(
        `微博Token交换失败: ${response.data.error_description || response.data.error}`,
        response.data.error_code || 500,
        'WEIBO',
      );
    }

    const token: PlatformToken = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
    };

    this.setToken(token);
    return token;
  }

  protected async refreshToken(): Promise<PlatformToken> {
    if (!this.token?.refreshToken) {
      throw new PlatformApiError('无可用的刷新Token', 401, 'WEIBO');
    }

    const { clientId, clientSecret, refreshTokenUrl } = WEIBO_CONFIG.oauth;

    const response = await this.http.post<WeiboTokenResponse>(
      refreshTokenUrl,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: this.token.refreshToken,
        grant_type: 'refresh_token',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    if (response.data.error || response.data.error_code) {
      throw new PlatformApiError(
        `微博Token刷新失败: ${response.data.error_description || response.data.error}`,
        response.data.error_code || 500,
        'WEIBO',
        undefined,
        true,
      );
    }

    const token: PlatformToken = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
    };

    this.setToken(token);
    return token;
  }

  async getUserInfo() {
    const response = await this.get<WeiboUserInfo>('/2/users/show.json', {
      uid: this.token?.scope, // uid需要从token响应中获取
    });

    if (response.error || response.error_code) {
      throw new PlatformApiError(
        `获取微博用户信息失败: ${response.error}`,
        response.error_code || 500,
        'WEIBO',
      );
    }

    return {
      platformUserId: String(response.id),
      nickname: response.screen_name,
      avatar: response.profile_image_url,
      bio: response.description,
      followers: response.followers_count,
      following: response.friends_count,
    };
  }

  /**
   * 获取微博列表
   */
  async getStatusList(uid: string, page = 1, count = 20) {
    return this.get<WeiboStatusList>('/2/statuses/user_timeline.json', {
      uid,
      page,
      count,
    });
  }

  /**
   * 获取微博数据
   */
  async getStatusData(ids: string[]) {
    return this.get('/2/statuses/show_batch', {
      ids: ids.join(','),
    });
  }
}
