"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KuaishouClient = void 0;
const base_client_1 = require("./base-client");
const platform_config_1 = require("../config/platform-config");
class KuaishouClient extends base_client_1.BasePlatformClient {
    constructor(config) {
        super('KUAISHOU', config || platform_config_1.KUAISHOU_CONFIG.api);
    }
    buildAuthorizeUrl(state) {
        const { clientId, callbackUrl, scopes, authorizeUrl } = platform_config_1.KUAISHOU_CONFIG.oauth;
        const params = new URLSearchParams({
            app_id: clientId,
            scope: scopes.join(','),
            redirect_uri: callbackUrl,
            response_type: 'code',
            state,
        });
        return `${authorizeUrl}?${params.toString()}`;
    }
    async exchangeCode(code) {
        const { clientId, clientSecret, tokenUrl } = platform_config_1.KUAISHOU_CONFIG.oauth;
        const response = await this.http.post(tokenUrl, {
            app_id: clientId,
            app_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
        });
        if (response.data.result !== 1) {
            throw new base_client_1.PlatformApiError(`快手Token交换失败: ${response.data.error_msg}`, response.data.result, 'KUAISHOU');
        }
        const token = {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            expiresAt: Date.now() + response.data.expires_in * 1000,
            scope: response.data.scopes,
        };
        this.setToken(token);
        return token;
    }
    async refreshToken() {
        if (!this.token?.refreshToken) {
            throw new base_client_1.PlatformApiError('无可用的刷新Token', 401, 'KUAISHOU');
        }
        const { clientId, clientSecret, refreshTokenUrl } = platform_config_1.KUAISHOU_CONFIG.oauth;
        const response = await this.http.post(refreshTokenUrl, {
            app_id: clientId,
            app_secret: clientSecret,
            refresh_token: this.token.refreshToken,
            grant_type: 'refresh_token',
        });
        if (response.data.result !== 1) {
            throw new base_client_1.PlatformApiError(`快手Token刷新失败: ${response.data.error_msg}`, response.data.result, 'KUAISHOU', undefined, true);
        }
        const token = {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            expiresAt: Date.now() + response.data.expires_in * 1000,
            scope: response.data.scopes,
        };
        this.setToken(token);
        return token;
    }
    async getUserInfo() {
        const response = await this.post('/openapi/photo/user/info', {});
        if (response.result !== 1) {
            throw new base_client_1.PlatformApiError(`获取快手用户信息失败: ${response.error_msg}`, response.result, 'KUAISHOU');
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
    async getVideoList(pcursor = '', count = 20) {
        return this.post('/openapi/photo/list', {
            pcursor,
            count,
        });
    }
    async getVideoData(photoIds) {
        return this.post('/openapi/photo/data', { photo_ids: photoIds });
    }
}
exports.KuaishouClient = KuaishouClient;
//# sourceMappingURL=kuaishou.client.js.map