import { get, post, put, del } from './request'

export interface AccountGroup {
  id: string
  name: string
  color: string
  sortOrder: number
  _count?: { accounts: number }
}

export const accountGroupApi = {
  getAll() {
    return get<AccountGroup[]>('/account-groups')
  },

  create(data: { name: string; color?: string; sortOrder?: number }) {
    return post<AccountGroup>('/account-groups', data)
  },

  update(id: string, data: { name?: string; color?: string; sortOrder?: number }) {
    return put(`/account-groups/${id}`, data)
  },

  remove(id: string) {
    return del(`/account-groups/${id}`)
  },

  setAccounts(groupId: string, accountIds: string[]) {
    return put(`/account-groups/${groupId}/accounts`, { accountIds })
  },
}
