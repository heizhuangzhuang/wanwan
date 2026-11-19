import { wanwanApi } from '../../services/api'

type ReadingLink = { name: string; title: string; intro: string; date?: string }

Page({
  data: {
    kind: 'topic', items: [] as ReadingLink[], page: 1, hasNext: false,
    loading: false, error: '', requestedPage: 1,
  },
  onLoad(options: Record<string, string | undefined>) {
    this.setData({ kind: options.kind === 'guide' ? 'guide' : 'topic' })
  },
  onShow() {
    void this.fetch(this.data.page)
  },
  selectKind(e: WechatMiniprogram.TouchEvent) {
    const kind = e.currentTarget.dataset.kind
    if (this.data.loading || kind === this.data.kind || (kind !== 'topic' && kind !== 'guide')) return
    this.setData({ kind, page: 1, hasNext: false })
    void this.fetch(1)
  },
  async fetch(page: number) {
    if (this.data.loading) return
    this.setData({ loading: true, error: '', items: [], requestedPage: page })
    try {
      if (this.data.kind === 'topic') {
        const res = await wanwanApi.listTopics(page)
        this.setData({ items: res.items, page: res.page, hasNext: res.page * res.size < res.total })
      } else {
        const res = await wanwanApi.listPosts(page)
        this.setData({
          items: res.items.map(post => ({
            name: post.name, title: post.title, intro: post.excerpt ?? '', date: post.publishTime?.slice(0, 10),
          })),
          page: res.page, hasNext: res.page * res.size < res.total,
        })
      }
    } catch {
      this.setData({ error: '暂时无法加载，请重试。' })
    } finally {
      this.setData({ loading: false })
    }
  },
  retry() { void this.fetch(this.data.requestedPage) },
  previousPage() { if (this.data.page > 1) void this.fetch(this.data.page - 1) },
  nextPage() { if (this.data.hasNext) void this.fetch(this.data.page + 1) },
  openReading(e: WechatMiniprogram.TouchEvent) {
    const { name } = e.currentTarget.dataset
    if (typeof name === 'string' && name) {
      wx.navigateTo({ url: `/pages/reading/reading?kind=${this.data.kind}&name=${encodeURIComponent(name)}` })
    }
  },
})
