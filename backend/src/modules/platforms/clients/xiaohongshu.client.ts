/**
 * 小红书开放平台API客户端
 */

import { BasePlatformClient, PlatformToken, PlatformApiError } from './base-client';
import { XIAOHONGSHU_CONFIG, PlatformApiConfig } from '../config/platform-config';

interface XiaohongshuTokenResponse {
  code: number;
  msg: string;
  data: {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    refresh_token_expires_in: number;
    open_id: string;
    scopes: string;
  };
}

interface XiaohongshuUserInfo {
  code: number;
  msg: string;
  data: {
    open_id: string;
    nickname: string;
    avatar: string;
    description?: string;
    fans_count?: number;
    follow_count?: number;
  };
}

interface XiaohongshuNoteList {
  code: number;
  msg: string;
  data: {
    notes: Array<{
      note_id: string;
      title: string;
      cover: string;
      create_time: number;
      stats: {
        view_count: number;
        like_count: number;
        comment_count: number;
        share_count: number;
        collect_count: number;
      };
    }>;
    cursor: string;
    has_more: boolean;
  };
}

export class XiaohongshuClient extends BasePlatformClient {
  constructor(config?: PlatformApiConfig) {
    super('XIAOHONGSHU', config || XIAOHONGSHU_CONFIG.api);
  }

  buildAuthorizeUrl(state: string): string {
    const { clientId, callbackUrl, scopes, authorizeUrl } = XIAOHONGSHU_CONFIG.oauth;
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
    const { clientId, clientSecret, tokenUrl } = XIAOHONGSHU_CONFIG.oauth;

    const response = await this.http.post<XiaohongshuTokenResponse>(tokenUrl, {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    });

    if (response.data.code !== 0) {
      throw new PlatformApiError(
        `小红书Token交换失败: ${response.data.msg}`,
        response.data.code,
        'XIAOHONGSHU',
      );
    }

    const tokenData = response.data.data;
    const token: PlatformToken = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      scope: tokenData.scopes,
    };

    this.setToken(token);
    return token;
  }

  protected async refreshToken(): Promise<PlatformToken> {
    if (!this.token?.refreshToken) {
      throw new PlatformApiError('无可用的刷新Token', 401, 'XIAOHONGSHU');
    }

    const { clientId, clientSecret, refreshTokenUrl } = XIAOHONGSHU_CONFIG.oauth;

    const response = await this.http.post<XiaohongshuTokenResponse>(refreshTokenUrl, {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: this.token.refreshToken,
      grant_type: 'refresh_token',
    });

    if (response.data.code !== 0) {
      throw new PlatformApiError(
        `小红书Token刷新失败: ${response.data.msg}`,
        response.data.code,
        'XIAOHONGSHU',
        undefined,
        true,
      );
    }

    const tokenData = response.data.data;
    const token: PlatformToken = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      scope: tokenData.scopes,
    };

    this.setToken(token);
    return token;
  }

  async getUserInfo() {
    const response = await this.get<XiaohongshuUserInfo>('/api/open/user/info');

    if (response.code !== 0) {
      throw new PlatformApiError(
        `获取小红书用户信息失败: ${response.msg}`,
        response.code,
        'XIAOHONGSHU',
      );
    }

    return {
      platformUserId: response.data.open_id,
      nickname: response.data.nickname,
      avatar: response.data.avatar,
      bio: response.data.description,
      followers: response.data.fans_count,
      following: response.data.follow_count,
    };
  }

  /**
   * 获取笔记列表
   */
  async getNoteList(cursor = '', limit = 20) {
    return this.get<XiaohongshuNoteList>('/api/open/note/list', {
      cursor,
      limit,
    });
  }

  /**
   * 获取笔记数据
   */
  async getNoteData(noteIds: string[]) {
    return this.post('/api/open/note/data', { note_ids: noteIds });
  }
}
