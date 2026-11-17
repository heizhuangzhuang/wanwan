import { wanwanApi, type ResourceView } from '../../services/api'

Page({
  data: {
    resource: null as ResourceView | null,
    loading: true,
    error: '',
  },
  onLoad(options: Record<string, string | undefined>) {
    const name = options.name ? decodeURIComponent(options.name) : ''
    if (!name) {
      this.setData({ loading: false, error: '参数缺失' })
      return
    }
    this.loadDetail(name)
  },
  async loadDetail(name: string) {
    this.setData({ loading: true, error: '' })
    try {
      const resource = await wanwanApi.getResource(name)
      this.setData({ resource, loading: false })
    } catch {
      this.setData({ loading: false, error: '该资料未找到或已下线。' })
    }
  },
  copyCitation() {
    const r = this.data.resource
    if (!r?.citationUrl) return
    wx.setClipboardData({
      data: r.citationUrl,
      success() {
        wx.showToast({ title: '已复制出处链接，请在浏览器打开', icon: 'none' })
      },
    })
  },
  openOfficialAccountArticle() {
    const url = this.data.resource?.entry.url
    if (!url) return
    const openFn = (wx as unknown as { openOfficialAccountArticle?: (o: { url: string; fail?: () => void }) => void })
      .openOfficialAccountArticle
    if (typeof openFn === 'function') {
      openFn({
        url,
        fail: () => this.copyCitation(),
      })
    } else {
      this.copyCitation()
    }
  },
  openOtherMiniProgram() {
    const entry = this.data.resource?.entry
    if (!entry?.appId) return
    wx.navigateToMiniProgram({
      appId: entry.appId,
      path: entry.path ?? undefined,
      fail: () => wx.showToast({ title: '暂无法跳转该小程序', icon: 'none' }),
    })
  },
})
