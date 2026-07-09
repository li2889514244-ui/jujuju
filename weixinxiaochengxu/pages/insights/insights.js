// pages/insights/insights.js
const { api } = require('../../utils/request')
const { formatNum } = require('../../utils/format')

Page({
  data: {
    loading: true,
    platformStats: [],
    followerTrend: [],
  },

  onShow() {
    const { ensureLogin } = require('../../utils/auth')
    if (!ensureLogin()) return
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData(() => wx.stopPullDownRefresh())
  },

  async loadData(done) {
    this.setData({ loading: true })
    try {
      const [stats, trend] = await Promise.all([
        api.get('/analytics/platforms'),
        api.get('/analytics/followers/trend', { days: 14 }),
      ])

      const platformStats = (stats || []).map((s) => ({
        platform: s.platform || '—',
        accounts: s.accountCount || 0,
        followers: formatNum(s.totalFollowers || 0),
        views: formatNum(s.totalViews || 0),
      }))

      const followerTrend = (trend || []).map((t) => ({
        date: (t.date || '').slice(5),
        value: formatNum(t.value || 0),
      }))

      this.setData({ platformStats, followerTrend, loading: false })
    } catch (e) {
      this.setData({ loading: false })
    } finally {
      if (done) done()
    }
  },
})
