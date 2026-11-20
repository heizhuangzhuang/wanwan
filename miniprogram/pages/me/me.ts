import { wanwanApi } from '../../services/api'
import { shelfNames } from '../../services/reading-shelf'
import { selectTab } from '../../services/tabs'

Page({
  data: {
    saved: 0, recent: 0,
    noticeTemplate: '', noticeBusy: false, noticeStatus: '', noticeLoading: true, noticeError: false,
  },
  onLoad() { return this.loadNoticeConfig() },
  onShow() {
    selectTab(this, 'pages/me/me')
    this.setData({ saved: shelfNames('saved').length, recent: shelfNames('recent').length })
  },
  async loadNoticeConfig() {
    if (!wx.requestSubscribeMessage) {
      this.setData({ noticeLoading: false })
      return
    }
    this.setData({ noticeLoading: true, noticeError: false })
    try {
      const { templateId } = await wanwanApi.getNoticeConfig()
      this.setData({ noticeTemplate: typeof templateId === 'string' ? templateId : '' })
    } catch {
      this.setData({ noticeError: true, noticeTemplate: '' })
    } finally {
      this.setData({ noticeLoading: false })
    }
  },
  subscribeNotice() {
    const { noticeTemplate, noticeBusy } = this.data
    if (!noticeTemplate || noticeBusy || !wx.requestSubscribeMessage) return
    this.setData({ noticeBusy: true, noticeStatus: '' })
    wx.requestSubscribeMessage({
      tmplIds: [noticeTemplate],
      success: result => {
        const choice = result[noticeTemplate]
        if (choice === 'accept' || choice === 'acceptWithAudio') {
          this.writeNotice(true)
        } else {
          this.setData({ noticeBusy: false, noticeStatus: '本次未授权。' })
        }
      },
      fail: () => this.setData({ noticeBusy: false, noticeStatus: '无法打开微信授权，请检查微信消息设置。' }),
    })
  },
  cancelNotice() {
    if (!this.data.noticeTemplate || this.data.noticeBusy) return
    this.setData({ noticeBusy: true, noticeStatus: '' })
    this.writeNotice(false)
  },
  writeNotice(enabled: boolean) {
    const failed = () => this.setData({ noticeBusy: false, noticeStatus: '保存失败，请重试。' })
    wx.login({
      success: ({ code }) => {
        if (!code) {
          failed()
          return
        }
        void wanwanApi.saveNotice(code, this.data.noticeTemplate, enabled).then(({ subscribed }) => {
          this.setData({
            noticeBusy: false,
            noticeStatus: subscribed ? '订阅已保存，90 天内可接收一次新资料提醒。' : '已取消待发提醒。',
          })
        }).catch(failed)
      },
      fail: failed,
    })
  },
})
