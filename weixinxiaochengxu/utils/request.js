// utils/request.js - 统一请求封装（带 JWT 鉴权 + 错误提示）
// 支持两种模式：
//   USE_CLOUD_PROXY=true  → 走微信云函数 proxy 中转（无需备案）
//   USE_CLOUD_PROXY=false → 直连后端（需 request 合法域名已配置）
const { BASE_URL, USE_CLOUD_PROXY, CLOUD_FUNC } = require('./config')

// 统一处理响应体（后端结构 { data: ... } 或裸数据）
function unwrap(body) {
  return body && body.data !== undefined ? body.data : body
}

function handleUnauthorized() {
  wx.removeStorageSync('accessToken')
  wx.removeStorageSync('userInfo')
  wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
  setTimeout(() => {
    wx.reLaunch({ url: '/pages/login/login' })
  }, 1200)
}

function request(url, options = {}) {
  const { method = 'GET', data = {}, header = {} } = options
  const token = wx.getStorageSync('accessToken')
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {}

  // ===== 云函数中转模式 =====
  if (USE_CLOUD_PROXY) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: CLOUD_FUNC,
        data: {
          path: url,
          method,
          data,
          headers: { 'Content-Type': 'application/json', ...authHeader, ...header },
        },
        success(res) {
          const result = res.result || {}
          const status = result.status || 500
          if (status >= 200 && status < 300) {
            resolve(unwrap(result.data))
          } else if (status === 401) {
            handleUnauthorized()
            reject(result.data)
          } else {
            const msg =
              (result.data && (result.data.message || result.data.error)) ||
              `请求失败(${status})`
            wx.showToast({ title: msg, icon: 'none' })
            reject(result.data)
          }
        },
        fail(err) {
          wx.showToast({ title: '云函数中转失败，检查云环境', icon: 'none' })
          reject(err)
        },
      })
    })
  }

  // ===== 直连模式 =====
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + url,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...authHeader,
        ...header,
      },
      success(res) {
        const { statusCode, data: body } = res
        if (statusCode >= 200 && statusCode < 300) {
          resolve(unwrap(body))
        } else if (statusCode === 401) {
          handleUnauthorized()
          reject(body)
        } else {
          const msg =
            (body && (body.message || body.error)) || `请求失败(${statusCode})`
          wx.showToast({ title: msg, icon: 'none' })
          reject(body)
        }
      },
      fail(err) {
        wx.showToast({ title: '网络错误，请检查网络', icon: 'none' })
        reject(err)
      },
    })
  })
}

const api = {
  get: (url, data) => request(url, { method: 'GET', data }),
  post: (url, data) => request(url, { method: 'POST', data }),
  put: (url, data) => request(url, { method: 'PUT', data }),
  delete: (url, data) => request(url, { method: 'DELETE', data }),
}

module.exports = { request, api }
