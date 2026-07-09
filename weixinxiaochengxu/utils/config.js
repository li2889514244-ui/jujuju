// utils/config.js - 全局配置

// ===== 后端真实地址（云函数内部调用用，小程序端不直接连，故无需备案） =====
const BACKEND_URL = 'https://ddddkiii.com/api/v1'

// ===== 请求模式 =====
// USE_CLOUD_PROXY = true  → 走微信云函数中转（无需域名备案，推荐个人小程序用）
// USE_CLOUD_PROXY = false → 直连 BACKEND_URL（需 ddddkiii.com 已备案并加 request 合法域名）
const USE_CLOUD_PROXY = true

// 微信云开发环境 ID（在「云开发控制台」左上角复制，填到这里）
const CLOUD_ENV = 'your-cloud-env-id'

// 中转云函数名（cloudfunctions/proxy 部署后的名字）
const CLOUD_FUNC = 'proxy'

// 直连模式下的基地址
const BASE_URL = BACKEND_URL

// 首页 tab 页路径（登录后跳转用）
const TAB_PAGES = {
  dashboard: '/pages/dashboard/dashboard',
  accounts: '/pages/accounts/accounts',
  report: '/pages/report/report',
  insights: '/pages/insights/insights',
}

module.exports = {
  BACKEND_URL,
  USE_CLOUD_PROXY,
  CLOUD_ENV,
  CLOUD_FUNC,
  BASE_URL,
  TAB_PAGES,
}
