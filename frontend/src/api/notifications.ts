import { get, post, del } from './request'

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
