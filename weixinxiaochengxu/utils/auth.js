// utils/auth.js - 登录守卫
function ensureLogin() {
  const token = wx.getStorageSync('accessToken')
  if (!token) {
    wx.reLaunch({ url: '/pages/login/login' })
    return false
  }
  return true
}

function logout() {
  wx.removeStorageSync('accessToken')
  wx.removeStorageSync('refreshToken')
  wx.removeStorageSync('userInfo')
  wx.reLaunch({ url: '/pages/login/login' })
}

module.exports = { ensureLogin, logout }
