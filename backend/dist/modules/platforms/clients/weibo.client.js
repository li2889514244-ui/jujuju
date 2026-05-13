"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeiboClient = void 0;
const base_client_1 = require("./base-client");
const platform_config_1 = require("../config/platform-config");
class WeiboClient extends base_client_1.BasePlatformClient {
    constructor(config) {
        super('WEIBO', config || platform_config_1.WEIBO_CONFIG.api);
    }
    buildAuthorizeUrl(state) {
        const { clientId, callbackUrl, scopes, authorizeUrl } = platform_config_1.WEIBO_CONFIG.oauth;
        const params = new URLSearchParams({
            client_id: clientId,
            response_type: 'code',
            scope: scopes.join(','),
            redirect_uri: callbackUrl,
            state,
        });
        return `${authorizeUrl}?${params.toString()}`;
    }
    async exchangeCode(code) {
        const { clientId, clientSecret, tokenUrl } = platform_config_1.WEIBO_CONFIG.oauth;
        const response = await this.http.post(tokenUrl, new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: platform_config_1.WEIBO_CONFIG.oauth.callbackUrl,
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (response.data.error || response.data.error_code) {
            throw new base_client_1.PlatformApiError(`微博Token交换失败: ${response.data.error_description || response.data.error}`, response.data.error_code || 500, 'WEIBO');
        }
        const token = {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            expiresAt: Date.now() + response.data.expires_in * 1000,
        };
        this.setToken(token);
        return token;
    }
    async refreshToken() {
        if (!this.token?.refreshToken) {
            throw new base_client_1.PlatformApiError('无可用的刷新Token', 401, 'WEIBO');
        }
        const { clientId, clientSecret, refreshTokenUrl } = platform_config_1.WEIBO_CONFIG.oauth;
        const response = await this.http.post(refreshTokenUrl, new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: this.token.refreshToken,
            grant_type: 'refresh_token',
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (response.data.error || response.data.error_code) {
            throw new base_client_1.PlatformApiError(`微博Token刷新失败: ${response.data.error_description || response.data.error}`, response.data.error_code || 500, 'WEIBO', undefined, true);
        }
        const token = {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            expiresAt: Date.now() + response.data.expires_in * 1000,
        };
        this.setToken(token);
        return token;
    }
    async getUserInfo() {
        const response = await this.get('/2/users/show.json', {
            uid: this.token?.scope,
        });
        if (response.error || response.error_code) {
            throw new base_client_1.PlatformApiError(`获取微博用户信息失败: ${response.error}`, response.error_code || 500, 'WEIBO');
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
    async getStatusList(uid, page = 1, count = 20) {
        return this.get('/2/statuses/user_timeline.json', {
            uid,
            page,
            count,
        });
    }
    async getStatusData(ids) {
        return this.get('/2/statuses/show_batch', {
            ids: ids.join(','),
        });
    }
}
exports.WeiboClient = WeiboClient;
//# sourceMappingURL=weibo.client.js.map