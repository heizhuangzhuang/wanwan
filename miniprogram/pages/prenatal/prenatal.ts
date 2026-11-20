import { prenatalGuides } from '../../services/prenatal-guides'

Page({
  data: { guides: prenatalGuides, selected: null as typeof prenatalGuides[number] | null, missing: false },
  onLoad(options: Record<string, string | undefined>) {
    const selected = prenatalGuides.find(guide => guide.key === options.key) || null
    this.setData({ selected, missing: Boolean(options.key && !selected) })
    if (selected) wx.setNavigationBarTitle({ title: selected.title })
  },
  copySource() {
    const guide = this.data.selected
    if (!guide) return
    wx.setClipboardData({ data: guide.sourceUrl, success: () => wx.showToast({ title: '已复制来源链接', icon: 'none' }) })
  },
  onShareAppMessage() {
    const guide = this.data.selected
    return { title: guide?.title || '产前检查专项', path: guide
      ? `/pages/prenatal/prenatal?key=${guide.key}` : '/pages/prenatal/prenatal' }
  },
})
