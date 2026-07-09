// pages/accounts/accounts.js
const { api } = require('../../utils/request')
const { formatNum } = require('../../utils/format')

Page({
  data: {
    loading: true,
    list: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
  },

  onShow() {
    const { ensureLogin } = require('../../utils/auth')
    if (!ensureLogin()) return
    this.refresh()
  },

  onPullDownRefresh() {
    this.refresh(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  refresh(done) {
    this.setData({ list: [], page: 1, hasMore: true })
    this.fetch(1, done)
  },

  loadMore() {
    this.fetch(this.data.page + 1)
  },

  async fetch(page, done) {
    this.setData({ loading: true })
    try {
      const res = await api.get('/accounts', {
        page,
        pageSize: this.data.pageSize,
      })
      // 后端返回 { data: [...], total, page, pageSize } 或直接数组
      const rows = Array.isArray(res) ? res : res.data || []
      const formatted = rows.map((acc) => ({
        id: acc.id,
        nickname: acc.nickname || '未命名',
        platform: acc.platform || 'unknown',
        avatar: acc.avatar || '',
        followers: formatNum(acc.followers || 0),
        status: acc.cookieStatus || 'unknown',
      }))
      const list = page === 1 ? formatted : this.data.list.concat(formatted)
      this.setData({
        list,
        page,
        hasMore: rows.length === this.data.pageSize,
        loading: false,
      })
    } catch (e) {
      this.setData({ loading: false })
    } finally {
      if (done) done()
    }
  },

  onTapAccount(e) {
    const { id, nickname } = e.currentTarget.dataset
    wx.showToast({ title: nickname, icon: 'none' })
  },
})
