// pages/report/report.js
const { api } = require('../../utils/request')
const { formatNum } = require('../../utils/format')

Page({
  data: {
    loading: true,
    days: 7,
    publishEffect: [],
    engagement: [],
  },

  onShow() {
    const { ensureLogin } = require('../../utils/auth')
    if (!ensureLogin()) return
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData(() => wx.stopPullDownRefresh())
  },

  changeDays(e) {
    this.setData({ days: Number(e.currentTarget.dataset.days) })
    this.loadData()
  },

  async loadData(done) {
    this.setData({ loading: true })
    try {
      const [effect, engagement] = await Promise.all([
        api.get('/analytics/publish-effect', { days: this.data.days }),
        api.get('/analytics/engagement', { days: this.data.days }),
      ])

      const publishEffect = (effect || []).map((item) => ({
        platform: item.platform || '—',
        published: item.published || 0,
        avgViews: formatNum(item.avgViews || 0),
        avgLikes: formatNum(item.avgLikes || 0),
      }))

      const eng = (engagement || []).map((item) => ({
        date: (item.date || '').slice(5),
        value: formatNum(item.value || 0),
      }))

      this.setData({ publishEffect, engagement: eng, loading: false })
    } catch (e) {
      this.setData({ loading: false })
    } finally {
      if (done) done()
    }
  },
})
