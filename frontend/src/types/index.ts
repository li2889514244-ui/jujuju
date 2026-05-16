// Types for MatrixFlow ERP

// ===== Auth =====
export interface LoginForm {
  email: string
  password: string
}

export interface RegisterForm {
  name: string
  email: string
  password: string
  confirmPassword: string
}

export interface UserInfo {
  id: string
  name: string
  email: string
  avatar?: string
  role: string
  teamId?: string
  createdAt: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: UserInfo
}

// ===== Platform =====
export type Platform = 'douyin' | 'kuaishou' | 'xiaohongshu' | 'video_account' | 'bilibili' | 'weibo' | 'tiktok'

export const PLATFORM_LABELS: Record<Platform, string> = {
  douyin: '抖音',
  kuaishou: '快手',
  xiaohongshu: '小红书',
  video_account: '视频号',
  bilibili: 'B站',
  weibo: '微博',
  tiktok: 'TikTok',
}

// ===== Account =====
export interface Account {
  id: string
  platform: Platform
  nickname: string
  avatar: string
  accountId: string
  groupId: string
  groupName: string
  cookieStatus: 'valid' | 'expired' | 'unknown'
  lastActiveAt: string
  followers: number
  likes: number
  createdAt: string
}

export interface CreateAccountForm {
  platform: string
  platformUserId: string
  nickname: string
  avatar?: string
  bio?: string
  cookies?: string
  teamId?: string
}

export interface AccountFilter {
  platform: string
  group: string
  keyword: string
  page: number
  pageSize: number
}

export interface AccountGroup {
  id: string
  name: string
  count: number
}

export interface AccountHistory {
  id: string
  action: string
  title: string
  platform: Platform
  status: string
  createdAt: string
}

// ===== Content =====
export interface Content {
  id: string
  title: string
  description: string
  tags: string[]
  videoUrl: string
  coverUrl: string
  duration: number
  size: number
  status: 'draft' | 'ready' | 'publishing' | 'published' | 'failed'
  createdAt: string
  updatedAt: string
}

export interface ContentForm {
  id?: string
  title: string
  description: string
  tags: string[]
  videoFile?: File
  coverFile?: File
}

export interface PublishTask {
  id: string
  contentId: string
  contentTitle: string
  accountId: string
  accountNickname: string
  platform: Platform
  status: 'pending' | 'publishing' | 'success' | 'failed'
  scheduledAt: string | null
  publishedAt: string | null
  errorMessage: string | null
  createdAt: string
}

export interface PublishForm {
  contentId?: string
  title?: string
  content?: string
  mediaUrls?: string[]
  tags?: string[]
  accountIds: string[]
  scheduledAt?: string
  publishAt?: string
}

// ===== Analytics =====
export interface AnalyticsOverview {
  accounts: {
    total: number
    active: number
    byPlatform: Record<string, number>
    totalFollowers: number
  }
  posts: {
    total: number
    published: number
    failed: number
  }
  engagement: {
    totalViews: number
    totalLikes: number
    totalComments: number
    totalShares: number
    totalSaves: number
  }
}

export interface TrendData {
  date: string
  value: number
}

export interface PlatformStats {
  platform: Platform
  accounts: number
  followers: number
  likes: number
  publishes: number
  engagementRate: number
}

export interface PublishEffect {
  id?: string
  title?: string
  platform?: string
  accountName?: string
  status?: string
  date: string
  publishedAt?: string
  views: number
  likes: number
  comments: number
  shares: number
}

// ===== Team =====
export interface Team {
  id: string
  name: string
  memberCount: number
  createdAt: string
}

export interface TeamMember {
  id: string
  userId: string
  username: string
  email: string
  avatar: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: string
}

export interface InviteForm {
  email: string
  role: 'admin' | 'member'
}

export interface Permission {
  id: string
  name: string
  description: string
  enabled: boolean
}

// ===== Browser =====
export interface BrowserSession {
  id: string
  accountId: string
  accountNickname: string
  platform: Platform
  status: 'active' | 'idle' | 'closed'
  cookieValid: boolean
  lastScreenshot: string
  createdAt: string
  lastActiveAt: string
}

export interface BrowserAction {
  id: string
  sessionId: string
  action: string
  target: string
  result: string
  createdAt: string
}

// ===== API Response =====
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface PaginatedResponse<T> {
  list: T[]
  accounts?: T[]
  posts?: T[]
  items?: T[]
  total: number
  page?: number
  pageSize?: number
  skip?: number
  take?: number
}

// ===== Account Posts & Analytics =====
export interface PostWithStats {
  id: string
  title: string
  platform: string
  status: string
  publishAt: string | null
  createdAt: string
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  engagementRate: number
}

export interface AccountAnalytics {
  totalViews: number
  totalLikes: number
  totalComments: number
  totalShares: number
  totalSaves: number
  totalPosts: number
  avgEngagementRate: number
}
