// prisma-enums.ts - SQLite compatibility (replaces @prisma/client enums)

export const Role = {
  ADMIN: 'ADMIN', MEMBER: 'MEMBER', VIEWER: 'VIEWER', OWNER: 'OWNER', MANAGER: 'MANAGER', SUPER_ADMIN: 'SUPER_ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Platform = {
  DOUYIN: 'DOUYIN', KUAISHOU: 'KUAISHOU', XIAOHONGSHU: 'XIAOHONGSHU',
  BILIBILI: 'BILIBILI', WEIBO: 'WEIBO', WECHAT_VIDEO: 'WECHAT_VIDEO',
  TIKTOK: 'TIKTOK', DOUDIAN: 'DOUDIAN', XIAOHONGSHU_SHOP: 'XIAOHONGSHU_SHOP', WECHAT_SHOP: 'WECHAT_SHOP',
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

export const PostStatus = {
  DRAFT: 'DRAFT', PUBLISHING: 'PUBLISHING', PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED', SCHEDULED: 'SCHEDULED', CANCELLED: 'CANCELLED',
} as const;
export type PostStatus = (typeof PostStatus)[keyof typeof PostStatus];

// Mirrors Prisma schema enum: AccountStatus (ACTIVE | EXPIRED | DISABLED)
export const AccountStatus = {
  ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED', DISABLED: 'DISABLED',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const EventType = {
  RECORDING: 'RECORDING', LIVESTREAM: 'LIVESTREAM', MEETING: 'MEETING', OTHER: 'OTHER',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export const NotificationType = {
  SYSTEM: 'SYSTEM', ACCOUNT: 'ACCOUNT', CONTENT: 'CONTENT', REPORT: 'REPORT', PUBLISH_SUCCESS: 'PUBLISH_SUCCESS', PUBLISH_FAILED: 'PUBLISH_FAILED',
  CREDENTIAL_EXPIRED: 'CREDENTIAL_EXPIRED',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
