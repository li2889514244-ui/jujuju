import { get, post, put, del } from './request'

export interface Notification {
  id: string
  type: 'ACCOUNT_EXPIRED' | 'PUBLISH_FAILED' | 'PUBLISH_SUCCESS' | 'FOLLOWER_ALERT' | 'SYSTEM'
  title: string
  content?: string
  read: boolean
  metadata?: Record<string, any>
  createdAt: string
}

export interface NotificationListResponse {
  notifications: Notification[]
  total: number
  unreadCount: number
  skip: number
  take: number
}

export type FeishuNotifyType =
  | 'SYSTEM'
  | 'ACCOUNT'
  | 'CONTENT'
  | 'REPORT'
  | 'PUBLISH_SUCCESS'
  | 'PUBLISH_FAILED'
  | 'CREDENTIAL_EXPIRED'

export type FeishuMode = 'webhook' | 'app'

export type FeishuReceiveIdType = 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id'

export interface FeishuSettings {
  mode: FeishuMode
  enabled: boolean
  configured: boolean
  webhookUrl: string
  webhookSecretConfigured: boolean
  notifyTypes: FeishuNotifyType[]
  envFileWritable: boolean
}

export interface FeishuAppSettings {
  mode: FeishuMode
  enabled: boolean
  configured: boolean
  appId: string
  appSecretConfigured: boolean
  receiveIdType: FeishuReceiveIdType
  receiveId: string
  notifyTypes: FeishuNotifyType[]
  envFileWritable: boolean
}

export interface UpdateFeishuSettingsPayload {
  webhookUrl?: string
  webhookSecret?: string
  notifyTypes?: FeishuNotifyType[]
  enabled?: boolean
}

export interface UpdateFeishuAppSettingsPayload {
  appId?: string
  appSecret?: string
  receiveIdType?: FeishuReceiveIdType
  receiveId?: string
  notifyTypes?: FeishuNotifyType[]
  enabled?: boolean
}

export const notificationApi = {
  getAll(params?: { page?: number; limit?: number; unreadOnly?: boolean }) {
    const query = new URLSearchParams()
    if (params?.page) query.set('page', String(params.page))
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.unreadOnly) query.set('unreadOnly', 'true')
    const qs = query.toString()
    return get<NotificationListResponse>(`/notifications${qs ? '?' + qs : ''}`)
  },

  getUnreadCount() {
    return get<{ unreadCount: number }>('/notifications/unread-count')
  },

  // ── Webhook mode ──────────────────────────────────

  getFeishuSettings() {
    return get<FeishuSettings>('/notifications/feishu/settings')
  },

  updateFeishuSettings(payload: UpdateFeishuSettingsPayload) {
    return put<FeishuSettings>('/notifications/feishu/settings', payload)
  },

  testFeishu() {
    return post<{ enabled: boolean; sent: boolean; message: string; status?: number }>(
      '/notifications/feishu/test',
    )
  },

  // ── App bot mode ──────────────────────────────────

  getFeishuAppSettings() {
    return get<FeishuAppSettings>('/notifications/feishu/app/settings')
  },

  updateFeishuAppSettings(payload: UpdateFeishuAppSettingsPayload) {
    return put<FeishuAppSettings>('/notifications/feishu/app/settings', payload)
  },

  testFeishuApp() {
    return post<{ sent: boolean; message: string; messageId?: string }>(
      '/notifications/feishu/app/test',
    )
  },

  // ── Notification actions ───────────────────────────

  markAsRead(id: string) {
    return post(`/notifications/${id}/read`)
  },

  markAllAsRead() {
    return post('/notifications/read-all')
  },

  remove(id: string) {
    return del(`/notifications/${id}`)
  },

  clearRead() {
    return del('/notifications/clear/read')
  },
}
