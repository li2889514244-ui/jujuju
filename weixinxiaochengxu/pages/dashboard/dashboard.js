// pages/dashboard/dashboard.js
const { api } = require('../../utils/request')
const { formatNum } = require('../../utils/format')
const { logout } = require('../../utils/auth')

Page({
  data: {
    loading: true,
    overview: null,
    cards: [],
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出当前账号？',
      confirmColor: '#f87171',
      success: (res) => {
        if (res.confirm) logout()
      },
    })
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
      const overview = await api.get('/analytics/overview')
      const a = overview.accounts || {}
      const p = overview.posts || {}
      const e = overview.engagement || {}

      const cards = [
        { label: '账号总数', value: formatNum(a.total || 0), sub: `活跃 ${a.active || 0}` },
        { label: '总粉丝', value: formatNum(a.totalFollowers || 0), sub: '全部平台' },
        { label: '总播放', value: formatNum(e.totalViews || 0), sub: '累计' },
        { label: '总点赞', value: formatNum(e.totalLikes || 0), sub: '累计' },
        { label: '总评论', value: formatNum(e.totalComments || 0), sub: '累计' },
        { label: '已发布', value: formatNum(p.published || 0), sub: `失败 ${p.failed || 0}` },
      ]

      this.setData({ overview, cards, loading: false })
    } catch (e) {
      this.setData({ loading: false })
    } finally {
      if (done) done()
    }
  },
})
