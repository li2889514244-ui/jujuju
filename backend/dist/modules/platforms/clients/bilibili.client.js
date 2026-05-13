"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BilibiliClient = void 0;
const base_client_1 = require("./base-client");
const platform_config_1 = require("../config/platform-config");
class BilibiliClient extends base_client_1.BasePlatformClient {
    constructor(config) {
        super('BILIBILI', config || platform_config_1.BILIBILI_CONFIG.api);
    }
    buildAuthorizeUrl(state) {
        const { clientId, callbackUrl, scopes, authorizeUrl } = platform_config_1.BILIBILI_CONFIG.oauth;
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
        const { clientId, clientSecret, tokenUrl } = platform_config_1.BILIBILI_CONFIG.oauth;
        const response = await this.http.post(tokenUrl, new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (response.data.code !== 0) {
            throw new base_client_1.PlatformApiError(`B站Token交换失败: ${response.data.message}`, response.data.code, 'BILIBILI');
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
            throw new base_client_1.PlatformApiError('无可用的刷新Token', 401, 'BILIBILI');
        }
        const { clientId, clientSecret, refreshTokenUrl } = platform_config_1.BILIBILI_CONFIG.oauth;
        const response = await this.http.post(refreshTokenUrl, new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: this.token.refreshToken,
            grant_type: 'refresh_token',
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (response.data.code !== 0) {
            throw new base_client_1.PlatformApiError(`B站Token刷新失败: ${response.data.message}`, response.data.code, 'BILIBILI', undefined, true);
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
        const response = await this.get('/x/v2/account/myinfo');
        if (response.code !== 0) {
            throw new base_client_1.PlatformApiError(`获取B站用户信息失败: ${response.message}`, response.code, 'BILIBILI');
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
    async getVideoList(mid, pn = 1, ps = 20) {
        return this.get('/x/space/wbi/arc/search', {
            mid,
            pn,
            ps,
            order: 'pubdate',
        });
    }
    async getVideoData(bvids) {
        return this.post('/x/v2/archive/stat', { bvids });
    }
}
exports.BilibiliClient = BilibiliClient;
//# sourceMappingURL=bilibili.client.js.map