// Platform enum mapping between frontend lowercase and backend Prisma uppercase enums
const FRONTEND_TO_BACKEND: Record<string, string> = {
  douyin: 'DOUYIN',
  kuaishou: 'KUAISHOU',
  xiaohongshu: 'XIAOHONGSHU',
  bilibili: 'BILIBILI',
  weibo: 'WEIBO',
  video_account: 'WECHAT_VIDEO',
  wechat_video: 'WECHAT_VIDEO',
  tencent: 'WECHAT_VIDEO',
  tiktok: 'TIKTOK',
}

const BACKEND_TO_FRONTEND: Record<string, string> = {
  DOUYIN: 'douyin',
  KUAISHOU: 'kuaishou',
  XIAOHONGSHU: 'xiaohongshu',
  BILIBILI: 'bilibili',
  WEIBO: 'weibo',
  WECHAT_VIDEO: 'video_account',
  TIKTOK: 'tiktok',
}

export function toBackend(platform: string): string {
  return FRONTEND_TO_BACKEND[platform.toLowerCase()] || platform.toUpperCase()
}

export function toFrontend(platform: string): string {
  return BACKEND_TO_FRONTEND[platform.toUpperCase()] || platform.toLowerCase()
}
