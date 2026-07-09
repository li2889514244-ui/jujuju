// pages/login/login.js
const { api } = require('../../utils/request')

Page({
  data: {
    email: '',
    password: '',
    loading: false,
  },

  onLoad() {
    // 已登录则直接进概览
    if (wx.getStorageSync('accessToken')) {
      wx.switchTab({ url: '/pages/dashboard/dashboard' })
    }
  },

  onEmailInput(e) {
    this.setData({ email: e.detail.value })
  },

  onPwdInput(e) {
    this.setData({ password: e.detail.value })
  },

  async onLogin() {
    const { email, password } = this.data
    if (!email || !password) {
      wx.showToast({ title: '请输入邮箱和密码', icon: 'none' })
      return
    }
    this.setData({ loading: true })
    try {
      const res = await api.post('/auth/login', { email, password })
      // 后端返回 { user, accessToken, refreshToken }
      wx.setStorageSync('accessToken', res.accessToken)
      wx.setStorageSync('refreshToken', res.refreshToken)
      wx.setStorageSync('userInfo', res.user)
      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/dashboard/dashboard' })
      }, 800)
    } catch (e) {
      // 错误已在 request 层 toast
    } finally {
      this.setData({ loading: false })
    }
  },
})
