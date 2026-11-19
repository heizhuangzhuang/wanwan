import type { IAppOption } from '../../app'

Page({
  data: { contactEmail: '' },
  onLoad() {
    this.setData({ contactEmail: getApp<IAppOption>().globalData.contactEmail })
  },
  copyEmail() {
    if (!this.data.contactEmail) return
    wx.setClipboardData({
      data: this.data.contactEmail,
      fail: () => wx.showToast({ title: '未能复制邮箱', icon: 'none' }),
    })
  },
})
