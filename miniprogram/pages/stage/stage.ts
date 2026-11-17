import { wanwanApi, type ResourceView } from '../../services/api'

Page({
  data: {
    stageKey: '',
    items: [] as ResourceView[],
    loading: true,
    error: '',
  },
  onLoad(options: Record<string, string | undefined>) {
    const key = options.key ?? ''
    const label = options.label ? decodeURIComponent(options.label) : '阶段资料'
    wx.setNavigationBarTitle({ title: label })
    this.setData({ stageKey: key })
    this.fetchList(key)
  },
  async fetchList(stage: string) {
    this.setData({ loading: true, error: '' })
    try {
      const page = await wanwanApi.listResources({ stage, page: 1, size: 50 })
      this.setData({ items: page.items, loading: false })
    } catch {
      this.setData({ loading: false, error: '加载资料列表失败。' })
    }
  },
  openDetail(e: WechatMiniprogram.TouchEvent) {
    const { name } = e.currentTarget.dataset as { name: string }
    wx.navigateTo({ url: `/pages/detail/detail?name=${encodeURIComponent(name)}` })
  },
})
