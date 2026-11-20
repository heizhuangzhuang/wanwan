import type { IAppOption } from '../../app'
import { decodeOption } from '../../services/reading'

Page({
  data: { contactEmail: '', resourceName: '' },
  onLoad(options: Record<string, string | undefined>) {
    this.setData({ contactEmail: getApp<IAppOption>().globalData.contactEmail, resourceName: decodeOption(options.resource).slice(0, 253) })
  },
  copyReference() {
    if (this.data.resourceName) wx.setClipboardData({ data: this.data.resourceName,
      success: () => wx.showToast({ title: '已复制资料编号', icon: 'none' }),
      fail: () => wx.showToast({ title: '未能复制资料编号', icon: 'none' }),
    })
  },
  copyEmail() {
    if (!this.data.contactEmail) return
    wx.setClipboardData({
      data: this.data.contactEmail,
      fail: () => wx.showToast({ title: '未能复制邮箱', icon: 'none' }),
    })
  },
})
