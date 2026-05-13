"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShipinhaoClient = void 0;
const base_client_1 = require("./base-client");
const platform_config_1 = require("../config/platform-config");
class ShipinhaoClient extends base_client_1.BasePlatformClient {
    constructor(config) {
        super('WECHAT_VIDEO', config || platform_config_1.SHIPINHAO_CONFIG.api);
    }
    buildAuthorizeUrl(state) {
        const { clientId, callbackUrl, scopes, authorizeUrl } = platform_config_1.SHIPINHAO_CONFIG.oauth;
        const params = new URLSearchParams({
            appid: clientId,
            redirect_uri: callbackUrl,
            response_type: 'code',
            scope: scopes.join(','),
            state,
        });
        return `${authorizeUrl}?${params.toString()}#wechat_redirect`;
    }
    async exchangeCode(code) {
        const { clientId, clientSecret, tokenUrl } = platform_config_1.SHIPINHAO_CONFIG.oauth;
        const params = new URLSearchParams({
            appid: clientId,
            secret: clientSecret,
            code,
            grant_type: 'authorization_code',
        });
        const response = await this.http.get(`${tokenUrl}?${params.toString()}`);
        if (response.data.errcode) {
            throw new base_client_1.PlatformApiError(`视频号Token交换失败: ${response.data.errmsg}`, response.data.errcode, 'WECHAT_VIDEO');
        }
        const token = {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            expiresAt: Date.now() + response.data.expires_in * 1000,
            tokenType: 'Bearer',
            scope: response.data.scope,
        };
        this.setToken(token);
        return token;
    }
    async refreshToken() {
        if (!this.token?.refreshToken) {
            throw new base_client_1.PlatformApiError('无可用的刷新Token', 401, 'WECHAT_VIDEO');
        }
        const { clientId, refreshTokenUrl } = platform_config_1.SHIPINHAO_CONFIG.oauth;
        const params = new URLSearchParams({
            appid: clientId,
            grant_type: 'refresh_token',
            refresh_token: this.token.refreshToken,
        });
        const response = await this.http.get(`${refreshTokenUrl}?${params.toString()}`);
        if (response.data.errcode) {
            throw new base_client_1.PlatformApiError(`视频号Token刷新失败: ${response.data.errmsg}`, response.data.errcode, 'WECHAT_VIDEO', undefined, true);
        }
        const token = {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            expiresAt: Date.now() + response.data.expires_in * 1000,
            tokenType: 'Bearer',
            scope: response.data.scope,
        };
        this.setToken(token);
        return token;
    }
    async getUserInfo() {
        const response = await this.get('/sns/userinfo', {
            access_token: this.token?.accessToken,
            openid: '',
            lang: 'zh_CN',
        });
        if (response.errcode) {
            throw new base_client_1.PlatformApiError(`获取视频号用户信息失败: ${response.errmsg}`, response.errcode || 500, 'WECHAT_VIDEO');
        }
        return {
            platformUserId: response.openid,
            nickname: response.nickname,
            avatar: response.headimgurl,
        };
    }
    async getVideoList(cursor = '', count = 20) {
        return this.post('/finder/video_list', {
            cursor,
            count,
        });
    }
    async getVideoData(videoIds) {
        return this.post('/finder/video_data', { video_ids: videoIds });
    }
}
exports.ShipinhaoClient = ShipinhaoClient;
//# sourceMappingURL=shipinhao.client.js.map