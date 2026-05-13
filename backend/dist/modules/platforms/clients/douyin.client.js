"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DouyinClient = void 0;
const base_client_1 = require("./base-client");
const platform_config_1 = require("../config/platform-config");
class DouyinClient extends base_client_1.BasePlatformClient {
    constructor(config) {
        super('DOUYIN', config || platform_config_1.DOUYIN_CONFIG.api);
    }
    buildAuthorizeUrl(state) {
        const { clientId, callbackUrl, scopes } = platform_config_1.DOUYIN_CONFIG.oauth;
        const params = new URLSearchParams({
            client_key: clientId,
            response_type: 'code',
            scope: scopes.join(','),
            redirect_uri: callbackUrl,
            state,
        });
        return `${platform_config_1.DOUYIN_CONFIG.oauth.authorizeUrl}?${params.toString()}`;
    }
    async exchangeCode(code) {
        const { clientId, clientSecret, tokenUrl } = platform_config_1.DOUYIN_CONFIG.oauth;
        const response = await this.http.post(tokenUrl, {
            client_key: clientId,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
        });
        if (response.data.error_code !== 0) {
            throw new base_client_1.PlatformApiError(`抖音Token交换失败: ${response.data.description}`, response.data.error_code, 'DOUYIN');
        }
        const tokenData = response.data.data;
        const token = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: Date.now() + tokenData.expires_in * 1000,
            scope: tokenData.scope,
        };
        this.setToken(token);
        return token;
    }
    async refreshToken() {
        if (!this.token?.refreshToken) {
            throw new base_client_1.PlatformApiError('无可用的刷新Token', 401, 'DOUYIN');
        }
        const { clientId, clientSecret, refreshTokenUrl } = platform_config_1.DOUYIN_CONFIG.oauth;
        const response = await this.http.post(refreshTokenUrl, {
            client_key: clientId,
            client_secret: clientSecret,
            refresh_token: this.token.refreshToken,
            grant_type: 'refresh_token',
        });
        if (response.data.error_code !== 0) {
            throw new base_client_1.PlatformApiError(`抖音Token刷新失败: ${response.data.description}`, response.data.error_code, 'DOUYIN', undefined, true);
        }
        const tokenData = response.data.data;
        const token = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: Date.now() + tokenData.expires_in * 1000,
            scope: tokenData.scope,
        };
        this.setToken(token);
        return token;
    }
    async getUserInfo() {
        const response = await this.get('/douyin/v1/user/info/');
        if (response.error_code !== 0) {
            throw new base_client_1.PlatformApiError('获取抖音用户信息失败', response.error_code, 'DOUYIN');
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
    async getVideoList(cursor = 0, count = 20) {
        return this.get('/douyin/v1/video/list/', {
            cursor,
            count,
        });
    }
    async getVideoData(itemIds) {
        return this.post('/douyin/v1/video/data/', { item_ids: itemIds });
    }
    extractData(response) {
        return response.data;
    }
}
exports.DouyinClient = DouyinClient;
//# sourceMappingURL=douyin.client.js.map