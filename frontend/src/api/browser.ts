import { get, post } from './request'
import type { BrowserSession, BrowserAction, PaginatedResponse } from '@/types'

export const browserApi = {
  getSessions(params?: Record<string, unknown>) {
    return get<PaginatedResponse<BrowserSession>>('/browser/sessions', params)
  },

  getSession(id: string) {
    return get<BrowserSession>(`/browser/sessions/${id}`)
  },

  createSession(accountId: string) {
    return post<BrowserSession>('/browser/sessions', { accountId })
  },

  closeSession(id: string) {
    return post(`/browser/sessions/${id}/close`)
  },

  refreshSession(id: string) {
    return post(`/browser/sessions/${id}/refresh`)
  },

  getScreenshot(id: string) {
    return get<{ screenshot: string }>(`/browser/sessions/${id}/screenshot`)
  },

  getActions(sessionId: string, params?: Record<string, unknown>) {
    return get<PaginatedResponse<BrowserAction>>(`/browser/sessions/${sessionId}/actions`, params)
  },

  executeAction(sessionId: string, action: { type: string; target: string; value?: string }) {
    return post<BrowserAction>(`/browser/sessions/${sessionId}/execute`, action)
  },

  navigateTo(sessionId: string, url: string) {
    return post(`/browser/sessions/${sessionId}/navigate`, { url })
  },
}
