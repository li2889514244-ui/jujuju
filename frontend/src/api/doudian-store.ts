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
  getOrders(storeId: string) {
    return get<any>('/doudian-browser/shop/orders', { store_id: storeId })
  },
  getProducts(storeId: string) {
    return get<any>('/doudian-browser/shop/products', { store_id: storeId })
  },
  getAftersales(storeId: string) {
    return get<any>('/doudian-browser/shop/aftersale', { store_id: storeId })
  },
}
