/**
 * 平台集成API
 */
import { get, post, del } from './request'

export interface SupportedPlatform {
  key: string
  name: string
  oauthUrl: string
  scopes: string[]
}

export interface AuthorizedAccount {
  id: string
  platform: string
  platformUserId: string
  nickname: string
  avatar: string
  bio?: string
  followers: number
  following: number
  status: string
  tokenStatus: 'valid' | 'expiring_soon' | 'expired' | 'unknown'
  hasOAuth: boolean
  lastActiveAt?: string
  createdAt: string
  owner: { id: string; name: string }
  team?: { id: string; name: string }
}

export interface CollectResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
  collectedAt: string
}

export interface BatchCollectResult {
  total: number
  success: number
  failed: number
  results: Array<{
    accountId: string
    success: boolean
    error?: string
  }>
}

export const platformsApi = {
  /** 获取支持的平台列表 */
  getSupportedPlatforms() {
    return get<SupportedPlatform[]>('/platforms')
  },

  /** 获取平台详细信息 */
  getPlatformInfo(platform: string) {
    return get<SupportedPlatform>(`/platforms/${platform}/info`)
  },

  /** 获取OAuth授权URL */
  getAuthorizeUrl(platform: string, teamId?: string) {
    return post<{ url: string; platform: string }>('/platforms/authorize', { platform, teamId })
  },

  /** 解除平台授权 */
  revokeAuthorization(accountId: string) {
    return del(`/platforms/${accountId}/revoke`)
  },

  /** 获取已授权平台账号列表 */
  getAuthorizedAccounts(params?: { platform?: string; teamId?: string; skip?: number; take?: number }) {
    return get<{ accounts: AuthorizedAccount[]; total: number; skip: number; take: number }>(
      '/platforms/accounts',
      params as Record<string, unknown>,
    )
  },

  /** 采集单个账号数据 */
  collectAccountData(accountId: string, type: 'account' | 'content' | 'daily' = 'daily') {
    return post<CollectResult>('/platforms/collect', { accountId, type })
  },

  /** 批量采集数据 */
  batchCollectData(accountIds: string[], type: 'account' | 'content' | 'daily' = 'daily') {
    return post<BatchCollectResult>('/platforms/collect/batch', { accountIds, type })
  },

  /** 刷新平台Token */
  refreshToken(accountId: string) {
    return post<{ success: boolean; message: string }>(`/platforms/${accountId}/refresh-token`)
  },

  /** 批量刷新即将过期的Token */
  refreshExpiringTokens() {
    return post<{ refreshed: number; failed: number }>('/platforms/refresh-expiring-tokens')
  },
}
