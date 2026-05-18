import { get, post, put, del } from './request'
import type { Account, AccountFilter, AccountGroup, AccountHistory, PaginatedResponse, CreateAccountForm, PostWithStats, AccountAnalytics } from '@/types'

export const accountsApi = {
  getList(filter: AccountFilter) {
    return get<PaginatedResponse<Account>>('/accounts', filter as unknown as Record<string, unknown>)
  },

  create(data: CreateAccountForm) {
    return post<Account>('/accounts', data)
  },

  getDetail(id: string) {
    return get<Account>(`/accounts/${id}`)
  },

  update(id: string, data: Partial<Account>) {
    return put<Account>(`/accounts/${id}`, data)
  },

  delete(id: string) {
    return del(`/accounts/${id}`)
  },

  getGroups() {
    return get<AccountGroup[]>('/account-groups')
  },

  createGroup(name: string) {
    return post<AccountGroup>('/account-groups', { name })
  },

  deleteGroup(id: string) {
    return del(`/account-groups/${id}`)
  },

  checkCookie(id: string) {
    return post<{ status: string; expiresAt: string }>(`/accounts/${id}/check-cookie`)
  },

  refreshCookie(id: string) {
    return post(`/accounts/${id}/refresh-cookie`)
  },

  getHistory(id: string, params?: Record<string, unknown>) {
    return get<PaginatedResponse<AccountHistory>>(`/accounts/${id}/history`, params)
  },

  moveToGroup(accountIds: string[], groupId: string) {
    return post('/accounts/bulk-move', { ids: accountIds, groupId })
  },

  getAccountPosts(id: string, params?: { page?: number; pageSize?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
    return get<PaginatedResponse<PostWithStats>>(`/analytics/account/${id}/posts`, params as Record<string, unknown>)
  },

  getAccountAnalytics(id: string) {
    return get<AccountAnalytics>(`/analytics/account/${id}`)
  },
}
