/**
 * B站开放平台API客户端
 */

import { BasePlatformClient, PlatformToken, PlatformApiError } from './base-client';
import { BILIBILI_CONFIG, PlatformApiConfig } from '../config/platform-config';

interface BilibiliTokenResponse {
  code: number;
  message: string;
  data: {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    refresh_token_expires_in: number;
    mid: number;
    scope: string;
  };
}

interface BilibiliUserInfo {
  code: number;
  message: string;
  data: {
    mid: number;
    name: string;
    face: string;
    sign?: string;
    follower?: number;
    following?: number;
  };
}

interface BilibiliVideoList {
  code: number;
  message: string;
  data: {
    list: {
      vlist: Array<{
        bvid: string;
        aid: number;
        title: string;
        pic: string;
        created: number;
        play: number;
        like: number;
        comment: number;
        share: number;
        favorites: number;
      }>;
    };
    page: {
      pn: number;
      ps: number;
      count: number;
    };
  };
}

export class BilibiliClient extends BasePlatformClient {
  constructor(config?: PlatformApiConfig) {
    super('BILIBILI', config || BILIBILI_CONFIG.api);
  }

  buildAuthorizeUrl(state: string): string {
    const { clientId, callbackUrl, scopes, authorizeUrl } = BILIBILI_CONFIG.oauth;
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: scopes.join(' '),
      redirect_uri: callbackUrl,
      state,
    });
    return `${authorizeUrl}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<PlatformToken> {
    const { clientId, clientSecret, tokenUrl } = BILIBILI_CONFIG.oauth;

    const response = await this.http.post<BilibiliTokenResponse>(
      tokenUrl,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    if (response.data.code !== 0) {
      throw new PlatformApiError(
        `B站Token交换失败: ${response.data.message}`,
        response.data.code,
        'BILIBILI',
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
      throw new PlatformApiError('无可用的刷新Token', 401, 'BILIBILI');
    }

    const { clientId, clientSecret, refreshTokenUrl } = BILIBILI_CONFIG.oauth;

    const response = await this.http.post<BilibiliTokenResponse>(
      refreshTokenUrl,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: this.token.refreshToken,
        grant_type: 'refresh_token',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    if (response.data.code !== 0) {
      throw new PlatformApiError(
        `B站Token刷新失败: ${response.data.message}`,
        response.data.code,
        'BILIBILI',
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

  async getUserInfo() {
    const response = await this.get<BilibiliUserInfo>('/x/v2/account/myinfo');

    if (response.code !== 0) {
      throw new PlatformApiError(
        `获取B站用户信息失败: ${response.message}`,
        response.code,
        'BILIBILI',
      );
    }

    return {
      platformUserId: String(response.data.mid),
      nickname: response.data.name,
      avatar: response.data.face,
      bio: response.data.sign,
      followers: response.data.follower,
      following: response.data.following,
    };
  }

  /**
   * 获取视频列表
   */
  async getVideoList(mid: number, pn = 1, ps = 20) {
    return this.get<BilibiliVideoList>('/x/space/wbi/arc/search', {
      mid,
      pn,
      ps,
      order: 'pubdate',
    });
  }

  /**
   * 获取视频数据
   */
  async getVideoData(bvids: string[]) {
    return this.post('/x/v2/archive/stat', { bvids });
  }
}
