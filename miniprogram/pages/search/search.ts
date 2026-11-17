import { wanwanApi, type ResourceView } from '../../services/api'

Page({
  data: {
    keyword: '',
    items: [] as ResourceView[],
    searched: false,
    loading: false,
    error: '',
  },
  onInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value })
  },
  async doSearch() {
    const kw = this.data.keyword.trim()
    if (!kw) return
    if (kw.length > 100) {
      this.setData({ error: '关键词请勿超过 100 个字符' })
      return
    }
    this.setData({ loading: true, error: '', searched: true })
    try {
      const res = await wanwanApi.search(kw, 1, 50)
      this.setData({ items: res.items, loading: false })
    } catch {
      this.setData({ loading: false, error: '搜索失败，请稍后重试。' })
    }
  },
  openDetail(e: WechatMiniprogram.TouchEvent) {
    const { name } = e.currentTarget.dataset as { name: string }
    wx.navigateTo({ url: `/pages/detail/detail?name=${encodeURIComponent(name)}` })
  },
})
