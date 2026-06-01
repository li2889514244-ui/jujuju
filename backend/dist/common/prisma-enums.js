"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationType = exports.EventType = exports.AccountStatus = exports.PostStatus = exports.Platform = exports.Role = void 0;
exports.Role = {
    ADMIN: 'ADMIN', MEMBER: 'MEMBER', VIEWER: 'VIEWER', OWNER: 'OWNER', MANAGER: 'MANAGER',
};
exports.Platform = {
    DOUYIN: 'DOUYIN', KUAISHOU: 'KUAISHOU', XIAOHONGSHU: 'XIAOHONGSHU',
    BILIBILI: 'BILIBILI', WEIBO: 'WEIBO', WECHAT_VIDEO: 'WECHAT_VIDEO',
    TIKTOK: 'TIKTOK', DOUDIAN: 'DOUDIAN', XIAOHONGSHU_SHOP: 'XIAOHONGSHU_SHOP', WECHAT_SHOP: 'WECHAT_SHOP',
};
exports.PostStatus = {
    DRAFT: 'DRAFT', PUBLISHING: 'PUBLISHING', PUBLISHED: 'PUBLISHED',
    FAILED: 'FAILED', SCHEDULED: 'SCHEDULED', CANCELLED: 'CANCELLED',
};
exports.AccountStatus = {
    ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED', DISABLED: 'DISABLED',
};
exports.EventType = {
    RECORDING: 'RECORDING', LIVESTREAM: 'LIVESTREAM', MEETING: 'MEETING', OTHER: 'OTHER',
};
exports.NotificationType = {
    SYSTEM: 'SYSTEM', ACCOUNT: 'ACCOUNT', CONTENT: 'CONTENT', REPORT: 'REPORT', PUBLISH_SUCCESS: 'PUBLISH_SUCCESS', PUBLISH_FAILED: 'PUBLISH_FAILED',
};
//# sourceMappingURL=prisma-enums.js.map