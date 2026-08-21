import { del, get, post } from './request'

export interface DoudianStore {
  id: string
  name: string
  profilePath: string
  status: string
  lastSyncedAt?: string
  syncStatus: string
  syncError?: string
  sessionStatus: string
  createdAt: string
  updatedAt: string
}

export interface DoudianCompanionStore {
  id: string
  name: string
  cloud_store_id: string
  profile_id: string
  created_at: string
  last_synced_at?: string
  last_error?: string
}

export type DoudianSummaryMode = 'today' | 'yesterday' | 'week' | 'month'

export interface DoudianSummary {
  mode: DoudianSummaryMode
  range: {
    start: number
    end: number
  }
  gross: number
  refund: number
  net: number
  count: number
  effectiveCount: number
  refundCount: number
  statusBreakdown: Array<{ label: string; count: number }>
  trend: Array<{ date: string; gmv: number; orders: number }>
  cached?: boolean
}

export const doudianStoreApi = {
  getStores() {
    return get<DoudianStore[]>('/doudian-browser/stores')
  },
  createStore(data: { name: string; profilePath?: string }) {
    return post<DoudianStore>('/doudian-browser/stores', data)
  },
  createCompanionStore(data: { name: string; localProfileId?: string }) {
    return post<DoudianStore>('/doudian-browser/stores/companion', data)
  },
  deleteStore(id: string) {
    return del(`/doudian-browser/stores/${id}`)
  },
  syncStore(id: string) {
    return post(`/doudian-browser/stores/${id}/sync`)
  },
  openLogin(id: string) {
    return post(`/doudian-browser/stores/${id}/login`)
  },
  checkSession(id: string) {
    return get<{ loggedIn: boolean; url: string; title: string }>(
      `/doudian-browser/stores/${id}/session`,
    )
  },
  getOrders(storeId: string, params?: { start_time?: number; end_time?: number }) {
    return get<any>('/doudian-browser/shop/orders', { store_id: storeId, ...params })
  },
  getProducts(storeId: string) {
    return get<any>('/doudian-browser/shop/products', { store_id: storeId })
  },
  getAftersales(
    storeId: string,
    params?: { begin_create_time?: number; end_create_time?: number },
  ) {
    return get<any>('/doudian-browser/shop/aftersale', { store_id: storeId, ...params })
  },
  getSummary(storeId: string, params: { start: number; end: number; mode: DoudianSummaryMode }) {
    return get<DoudianSummary>('/doudian-browser/shop/summary', {
      store_id: storeId,
      start: params.start,
      end: params.end,
      mode: params.mode,
    })
  },
}
