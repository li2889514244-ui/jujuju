export declare const Role: {
    readonly ADMIN: "ADMIN";
    readonly MEMBER: "MEMBER";
    readonly VIEWER: "VIEWER";
    readonly OWNER: "OWNER";
    readonly MANAGER: "MANAGER";
};
export type Role = (typeof Role)[keyof typeof Role];
export declare const Platform: {
    readonly DOUYIN: "DOUYIN";
    readonly KUAISHOU: "KUAISHOU";
    readonly XIAOHONGSHU: "XIAOHONGSHU";
    readonly BILIBILI: "BILIBILI";
    readonly WEIBO: "WEIBO";
    readonly WECHAT_VIDEO: "WECHAT_VIDEO";
    readonly TIKTOK: "TIKTOK";
    readonly DOUDIAN: "DOUDIAN";
    readonly XIAOHONGSHU_SHOP: "XIAOHONGSHU_SHOP";
    readonly WECHAT_SHOP: "WECHAT_SHOP";
};
export type Platform = (typeof Platform)[keyof typeof Platform];
export declare const PostStatus: {
    readonly DRAFT: "DRAFT";
    readonly PUBLISHING: "PUBLISHING";
    readonly PUBLISHED: "PUBLISHED";
    readonly FAILED: "FAILED";
    readonly SCHEDULED: "SCHEDULED";
    readonly CANCELLED: "CANCELLED";
};
export type PostStatus = (typeof PostStatus)[keyof typeof PostStatus];
export declare const AccountStatus: {
    readonly ACTIVE: "ACTIVE";
    readonly EXPIRED: "EXPIRED";
    readonly DISABLED: "DISABLED";
};
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];
export declare const EventType: {
    readonly RECORDING: "RECORDING";
    readonly LIVESTREAM: "LIVESTREAM";
    readonly MEETING: "MEETING";
    readonly OTHER: "OTHER";
};
export type EventType = (typeof EventType)[keyof typeof EventType];
export declare const NotificationType: {
    readonly SYSTEM: "SYSTEM";
    readonly ACCOUNT: "ACCOUNT";
    readonly CONTENT: "CONTENT";
    readonly REPORT: "REPORT";
    readonly PUBLISH_SUCCESS: "PUBLISH_SUCCESS";
    readonly PUBLISH_FAILED: "PUBLISH_FAILED";
};
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
