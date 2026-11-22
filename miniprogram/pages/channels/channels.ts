import { channelsFor } from '../../services/channels'

Page({
  data: { social: false, channels: channelsFor(undefined, undefined) },
  onLoad(options: Record<string, string | undefined>) {
    const type = options.type || options.tab
    const social = type === 'social'
    this.setData({ social, channels: channelsFor(type, options.period) })
    if (social) wx.setNavigationBarTitle({ title: '科普与家长经验' })
  },
  copy(event: WechatMiniprogram.TouchEvent) {
    const { key, field } = event.currentTarget.dataset
    const channel = this.data.channels.find(entry => entry.key === key)
    const value = field === 'source' ? channel?.sourceUrl : field === 'keyword' ? channel?.keyword : undefined
    if (!value) return
    wx.setClipboardData({
      data: value,
      success: () => wx.showToast({ title: field === 'keyword' ? '已复制搜索词' : '已复制来源链接', icon: 'none' }),
      fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }),
    })
  },
})
