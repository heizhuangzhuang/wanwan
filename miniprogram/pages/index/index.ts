import { wanwanApi, type StageView } from '../../services/api'

Page({
  data: {
    stages: [] as StageView[],
    loading: true,
    error: '',
  },
  onLoad() {
    this.loadStages()
  },
  async loadStages() {
    this.setData({ loading: true, error: '' })
    try {
      const stages = await wanwanApi.getStages()
      this.setData({ stages, loading: false })
    } catch {
      this.setData({ loading: false, error: '无法连接资料服务，请稍后重试。' })
    }
  },
  goStage(e: WechatMiniprogram.TouchEvent) {
    const { key, label } = e.currentTarget.dataset as { key: string; label: string }
    wx.navigateTo({ url: `/pages/stage/stage?key=${key}&label=${encodeURIComponent(label)}` })
  },
  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' })
  },
  goTopics() {
    wx.navigateTo({ url: '/pages/topics/topics' })
  },
  goGuides() {
    wx.navigateTo({ url: '/pages/topics/topics?kind=guide' })
  },
  goAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  },
})
