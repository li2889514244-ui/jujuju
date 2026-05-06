import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api/auth'
import type { UserInfo, LoginForm } from '@/types'
import router from '@/router'

export const useUserStore = defineStore(
  'user',
  () => {
    const token = ref<string>('')
    const refreshToken = ref<string>('')
    const userInfo = ref<UserInfo | null>(null)

    const isLoggedIn = computed(() => !!token.value)
    const username = computed(() => userInfo.value?.username || '')
    const avatar = computed(() => userInfo.value?.avatar || '')

    async function login(form: LoginForm) {
      const res = await authApi.login(form)
      token.value = res.data.token
      refreshToken.value = res.data.refreshToken
      userInfo.value = res.data.user
      return res
    }

    async function fetchUserInfo() {
      const res = await authApi.getUserInfo()
      userInfo.value = res.data
      return res
    }

    async function doRefreshToken() {
      const res = await authApi.refreshToken(refreshToken.value)
      token.value = res.data.token
      refreshToken.value = res.data.refreshToken
      return res
    }

    function logout() {
      token.value = ''
      refreshToken.value = ''
      userInfo.value = null
      router.push('/login')
    }

    function setToken(newToken: string) {
      token.value = newToken
    }

    return {
      token,
      refreshToken,
      userInfo,
      isLoggedIn,
      username,
      avatar,
      login,
      fetchUserInfo,
      doRefreshToken,
      logout,
      setToken,
    }
  },
  {
    persist: {
      key: 'matrixflow-user',
      paths: ['token', 'refreshToken', 'userInfo'],
      storage: sessionStorage,
    },
  }
)
