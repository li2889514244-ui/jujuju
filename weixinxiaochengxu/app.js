// app.js - 全局逻辑
const { USE_CLOUD_PROXY, CLOUD_ENV } = require('./utils/config')

App({
  globalData: {
    token: '',
    user: null,
  },

  onLaunch() {
    // 启动时从本地恢复登录态
    const token = wx.getStorageSync('accessToken')
    const user = wx.getStorageSync('userInfo')
    if (token) {
      this.globalData.token = token
      this.globalData.user = user
    }

    // 初始化微信云开发（云函数中转模式需要）
    if (USE_CLOUD_PROXY && CLOUD_ENV !== 'your-cloud-env-id') {
      wx.cloud.init({ env: CLOUD_ENV, traceUser: true })
    }
  },
})
