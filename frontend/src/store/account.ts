import { defineStore } from 'pinia'
import { ref } from 'vue'
import { accountsApi } from '@/api/accounts'
import type { Account, AccountFilter, AccountGroup } from '@/types'

export const useAccountStore = defineStore('account', () => {
  const accounts = ref<Account[]>([])
  const groups = ref<AccountGroup[]>([])
  const currentAccount = ref<Account | null>(null)
  const loading = ref(false)
  const total = ref(0)
  const filter = ref<AccountFilter>({
    platform: '',
    group: '',
    keyword: '',
    page: 1,
    pageSize: 20,
  })

  async function fetchAccounts() {
    loading.value = true
    try {
      const res = await accountsApi.getList(filter.value)
      accounts.value = res.data.list
      total.value = res.data.total
    } finally {
      loading.value = false
    }
  }

  async function fetchAccountDetail(id: string) {
    loading.value = true
    try {
      const res = await accountsApi.getDetail(id)
      currentAccount.value = res.data
    } finally {
      loading.value = false
    }
  }

  async function fetchGroups() {
    const res = await accountsApi.getGroups()
    groups.value = res.data
  }

  async function updateAccount(id: string, data: Partial<Account>) {
    await accountsApi.update(id, data)
    await fetchAccounts()
  }

  async function deleteAccount(id: string) {
    await accountsApi.delete(id)
    await fetchAccounts()
  }

  async function checkCookieStatus(id: string) {
    const res = await accountsApi.checkCookie(id)
    return res.data
  }

  function setFilter(newFilter: Partial<AccountFilter>) {
    filter.value = { ...filter.value, ...newFilter }
  }

  function resetFilter() {
    filter.value = { platform: '', group: '', keyword: '', page: 1, pageSize: 20 }
  }

  return {
    accounts,
    groups,
    currentAccount,
    loading,
    total,
    filter,
    fetchAccounts,
    fetchAccountDetail,
    fetchGroups,
    updateAccount,
    deleteAccount,
    checkCookieStatus,
    setFilter,
    resetFilter,
  }
})
