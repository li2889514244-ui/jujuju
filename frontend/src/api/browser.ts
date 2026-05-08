/**
 * 浏览器引擎 API - 已禁用
 * 浏览器引擎（browser-engine）已从项目中移除。
 * 所有 API 调用将返回 501 Not Implemented。
 */
import type { BrowserSession, BrowserAction, PaginatedResponse } from '@/types'

function disabledResponse(): Promise<never> {
  return Promise.reject(new Error('浏览器引擎功能已禁用'))
}

export const browserApi = {
  getSessions(_params?: Record<string, unknown>) {
    return disabledResponse() as unknown as Promise<PaginatedResponse<BrowserSession>>
  },

  getSession(_id: string) {
    return disabledResponse() as unknown as Promise<BrowserSession>
  },

  createSession(_accountId: string) {
    return disabledResponse() as unknown as Promise<BrowserSession>
  },

  closeSession(_id: string) {
    return disabledResponse()
  },

  refreshSession(_id: string) {
    return disabledResponse()
  },

  getScreenshot(_id: string) {
    return disabledResponse() as unknown as Promise<{ screenshot: string }>
  },

  getActions(_sessionId: string, _params?: Record<string, unknown>) {
    return disabledResponse() as unknown as Promise<PaginatedResponse<BrowserAction>>
  },

  executeAction(_sessionId: string, _action: { type: string; target: string; value?: string }) {
    return disabledResponse() as unknown as Promise<BrowserAction>
  },

  navigateTo(_sessionId: string, _url: string) {
    return disabledResponse()
  },
}
