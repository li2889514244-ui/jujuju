"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLATFORM_CONFIGS = exports.WEIBO_CONFIG = exports.BILIBILI_CONFIG = exports.SHIPINHAO_CONFIG = exports.XIAOHONGSHU_CONFIG = exports.KUAISHOU_CONFIG = exports.DOUYIN_CONFIG = void 0;
exports.getPlatformConfig = getPlatformConfig;
exports.DOUYIN_CONFIG = {
    name: '抖音',
    key: 'DOUYIN',
    oauth: {
        clientId: process.env.DOUYIN_CLIENT_ID || '',
        clientSecret: process.env.DOUYIN_CLIENT_SECRET || '',
        authorizeUrl: 'https://open.douyin.com/platform/oauth/connect/',
        tokenUrl: 'https://open.douyin.com/oauth/access_token/',
        refreshTokenUrl: 'https://open.douyin.com/oauth/refresh_token/',
        callbackUrl: process.env.DOUYIN_CALLBACK_URL || 'http://localhost:3000/api/platforms/oauth/callback/douyin',
        scopes: ['user_info', 'video.list', 'video.data', 'data.external.user'],
    },
    api: {
        baseUrl: 'https://open.douyin.com',
        version: 'v2',
        timeout: 15000,
        rateLimit: {
            maxRequests: 100,
            windowMs: 60000,
        },
        retry: {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 10000,
        },
    },
};
exports.KUAISHOU_CONFIG = {
    name: '快手',
    key: 'KUAISHOU',
    oauth: {
        clientId: process.env.KUAISHOU_CLIENT_ID || '',
        clientSecret: process.env.KUAISHOU_CLIENT_SECRET || '',
        authorizeUrl: 'https://open.kuaishou.com/oauth2/authorize',
        tokenUrl: 'https://open.kuaishou.com/oauth2/access_token',
        refreshTokenUrl: 'https://open.kuaishou.com/oauth2/refresh_token',
        callbackUrl: process.env.KUAISHOU_CALLBACK_URL || 'http://localhost:3000/api/platforms/oauth/callback/kuaishou',
        scopes: ['user_info', 'video.list', 'video.data'],
    },
    api: {
        baseUrl: 'https://open.kuaishou.com',
        version: 'v1',
        timeout: 15000,
        rateLimit: {
            maxRequests: 60,
            windowMs: 60000,
        },
        retry: {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 8000,
        },
    },
};
exports.XIAOHONGSHU_CONFIG = {
    name: '小红书',
    key: 'XIAOHONGSHU',
    oauth: {
        clientId: process.env.XIAOHONGSHU_CLIENT_ID || '',
        clientSecret: process.env.XIAOHONGSHU_CLIENT_SECRET || '',
        authorizeUrl: 'https://open.xiaohongshu.com/oauth2/authorize',
        tokenUrl: 'https://open.xiaohongshu.com/oauth2/access_token',
        refreshTokenUrl: 'https://open.xiaohongshu.com/oauth2/refresh_token',
        callbackUrl: process.env.XIAOHONGSHU_CALLBACK_URL || 'http://localhost:3000/api/platforms/oauth/callback/xiaohongshu',
        scopes: ['user_info', 'note.read', 'note.data'],
    },
    api: {
        baseUrl: 'https://open.xiaohongshu.com',
        version: 'v1',
        timeout: 15000,
        rateLimit: {
            maxRequests: 50,
            windowMs: 60000,
        },
        retry: {
            maxRetries: 3,
            baseDelay: 1500,
            maxDelay: 12000,
        },
    },
};
exports.SHIPINHAO_CONFIG = {
    name: '视频号',
    key: 'WECHAT_VIDEO',
    oauth: {
        clientId: process.env.WECHAT_VIDEO_CLIENT_ID || '',
        clientSecret: process.env.WECHAT_VIDEO_CLIENT_SECRET || '',
        authorizeUrl: 'https://open.weixin.qq.com/connect/oauth2/authorize',
        tokenUrl: 'https://api.weixin.qq.com/sns/oauth2/access_token',
        refreshTokenUrl: 'https://api.weixin.qq.com/sns/oauth2/refresh_token',
        callbackUrl: process.env.WECHAT_VIDEO_CALLBACK_URL || 'http://localhost:3000/api/platforms/oauth/callback/shipinhao',
        scopes: ['snsapi_userinfo'],
    },
    api: {
        baseUrl: 'https://api.weixin.qq.com',
        version: 'v1',
        timeout: 15000,
        rateLimit: {
            maxRequests: 200,
            windowMs: 60000,
        },
        retry: {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 10000,
        },
    },
};
exports.BILIBILI_CONFIG = {
    name: 'B站',
    key: 'BILIBILI',
    oauth: {
        clientId: process.env.BILIBILI_CLIENT_ID || '',
        clientSecret: process.env.BILIBILI_CLIENT_SECRET || '',
        authorizeUrl: 'https://member.bilibili.com/v2/oauth2/authorize',
        tokenUrl: 'https://member.bilibili.com/v2/oauth2/access_token',
        refreshTokenUrl: 'https://member.bilibili.com/v2/oauth2/refresh_token',
        callbackUrl: process.env.BILIBILI_CALLBACK_URL || 'http://localhost:3000/api/platforms/oauth/callback/bilibili',
        scopes: ['user_info', 'video.info', 'data.stats'],
    },
    api: {
        baseUrl: 'https://member.bilibili.com',
        version: 'v2',
        timeout: 15000,
        rateLimit: {
            maxRequests: 120,
            windowMs: 60000,
        },
        retry: {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 10000,
        },
    },
};
exports.WEIBO_CONFIG = {
    name: '微博',
    key: 'WEIBO',
    oauth: {
        clientId: process.env.WEIBO_CLIENT_ID || '',
        clientSecret: process.env.WEIBO_CLIENT_SECRET || '',
        authorizeUrl: 'https://api.weibo.com/oauth2/authorize',
        tokenUrl: 'https://api.weibo.com/oauth2/access_token',
        refreshTokenUrl: 'https://api.weibo.com/oauth2/access_token',
        callbackUrl: process.env.WEIBO_CALLBACK_URL || 'http://localhost:3000/api/platforms/oauth/callback/weibo',
        scopes: ['statuses_to_me_read', 'friendships_groups_read'],
    },
    api: {
        baseUrl: 'https://api.weibo.com',
        version: 'v2',
        timeout: 15000,
        rateLimit: {
            maxRequests: 150,
            windowMs: 60000,
        },
        retry: {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 10000,
        },
    },
};
exports.PLATFORM_CONFIGS = {
    DOUYIN: exports.DOUYIN_CONFIG,
    KUAISHOU: exports.KUAISHOU_CONFIG,
    XIAOHONGSHU: exports.XIAOHONGSHU_CONFIG,
    WECHAT_VIDEO: exports.SHIPINHAO_CONFIG,
    BILIBILI: exports.BILIBILI_CONFIG,
    WEIBO: exports.WEIBO_CONFIG,
};
function getPlatformConfig(platform) {
    const config = exports.PLATFORM_CONFIGS[platform];
    if (!config) {
        throw new Error(`不支持的平台: ${platform}`);
    }
    return config;
}
//# sourceMappingURL=platform-config.js.map