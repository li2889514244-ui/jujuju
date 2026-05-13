"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XiaohongshuClient = void 0;
const base_client_1 = require("./base-client");
const platform_config_1 = require("../config/platform-config");
class XiaohongshuClient extends base_client_1.BasePlatformClient {
    constructor(config) {
        super('XIAOHONGSHU', config || platform_config_1.XIAOHONGSHU_CONFIG.api);
    }
    buildAuthorizeUrl(state) {
        const { clientId, callbackUrl, scopes, authorizeUrl } = platform_config_1.XIAOHONGSHU_CONFIG.oauth;
        const params = new URLSearchParams({
            client_id: clientId,
            response_type: 'code',
            scope: scopes.join(' '),
            redirect_uri: callbackUrl,
            state,
        });
        return `${authorizeUrl}?${params.toString()}`;
    }
    async exchangeCode(code) {
        const { clientId, clientSecret, tokenUrl } = platform_config_1.XIAOHONGSHU_CONFIG.oauth;
        const response = await this.http.post(tokenUrl, {
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
        });
        if (response.data.code !== 0) {
            throw new base_client_1.PlatformApiError(`小红书Token交换失败: ${response.data.msg}`, response.data.code, 'XIAOHONGSHU');
        }
        const tokenData = response.data.data;
        const token = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: Date.now() + tokenData.expires_in * 1000,
            scope: tokenData.scopes,
        };
        this.setToken(token);
        return token;
    }
    async refreshToken() {
        if (!this.token?.refreshToken) {
            throw new base_client_1.PlatformApiError('无可用的刷新Token', 401, 'XIAOHONGSHU');
        }
        const { clientId, clientSecret, refreshTokenUrl } = platform_config_1.XIAOHONGSHU_CONFIG.oauth;
        const response = await this.http.post(refreshTokenUrl, {
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: this.token.refreshToken,
            grant_type: 'refresh_token',
        });
        if (response.data.code !== 0) {
            throw new base_client_1.PlatformApiError(`小红书Token刷新失败: ${response.data.msg}`, response.data.code, 'XIAOHONGSHU', undefined, true);
        }
        const tokenData = response.data.data;
        const token = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: Date.now() + tokenData.expires_in * 1000,
            scope: tokenData.scopes,
        };
        this.setToken(token);
        return token;
    }
    async getUserInfo() {
        const response = await this.get('/api/open/user/info');
        if (response.code !== 0) {
            throw new base_client_1.PlatformApiError(`获取小红书用户信息失败: ${response.msg}`, response.code, 'XIAOHONGSHU');
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
    async getNoteList(cursor = '', limit = 20) {
        return this.get('/api/open/note/list', {
            cursor,
            limit,
        });
    }
    async getNoteData(noteIds) {
        return this.post('/api/open/note/data', { note_ids: noteIds });
    }
}
exports.XiaohongshuClient = XiaohongshuClient;
//# sourceMappingURL=xiaohongshu.client.js.map