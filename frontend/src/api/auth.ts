import { get, post } from './request'
import type { LoginForm, RegisterForm, LoginResponse, UserInfo } from '@/types'

export const authApi = {
  login(form: LoginForm) {
    return post<LoginResponse>('/auth/login', form)
  },

  register(form: RegisterForm) {
    return post<LoginResponse>('/auth/register', form)
  },

  getUserInfo() {
    return get<UserInfo>('/auth/me')
  },

  refreshToken(refreshToken: string) {
    return post<{ token: string; refreshToken: string }>('/auth/refresh', { refreshToken })
  },

  logout() {
    return post('/auth/logout')
  },

  updateProfile(data: Partial<UserInfo>) {
    return post<UserInfo>('/auth/profile', data)
  },

  changePassword(data: { oldPassword: string; newPassword: string }) {
    return post('/auth/change-password', data)
  },
}
