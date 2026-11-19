import { HttpError, wanwanApi } from '../../services/api'
import { decodeOption, resourceLabel } from '../../services/reading'

Page({
  data: {
    name: '', resource: null as ReturnType<typeof resourceLabel> | null,
    loading: true, error: '', retryable: false, entryError: '',
    allowArticle: false, allowMiniProgram: false,
  },
  onLoad(options: Record<string, string | undefined>) {
    this.setData({ name: decodeOption(options.name) })
  },
  onShow() { void this.loadDetail() },
  async loadDetail() {
    const { name } = this.data
    this.setData({ loading: true, error: '', retryable: false, entryError: '', resource: null })
    if (!name) {
      this.setData({ loading: false, error: '入口缺少有效的资料标识。' })
      return
    }
    try {
      const resource = await wanwanApi.getResource(name)
      const verified = resource.linkStatus === 'OK'
      this.setData({
        resource: resourceLabel(resource),
        allowArticle: verified && resource.entry.type === 'MP_ARTICLE' && !!resource.entry.url
          && typeof wx.openOfficialAccountArticle === 'function',
        allowMiniProgram: verified && resource.entry.type === 'MINIPROGRAM' && !!resource.entry.appId,
      })
    } catch (error) {
      const unavailable = error instanceof HttpError && error.statusCode === 404
      this.setData({
        error: unavailable ? '该资料不可访问或已下线。' : '暂时无法读取资料，请重试。',
        retryable: !unavailable,
      })
    } finally {
      this.setData({ loading: false })
    }
  },
  copyCitation() {
    const resource = this.data.resource
    if (!resource) return
    const citation = [resource.originalTitle, resource.author, resource.sourceName, resource.publishedDate,
      resource.doi && `DOI ${resource.doi}`, resource.pmid && `PMID ${resource.pmid}`,
      resource.linkStatus === 'OK' ? resource.citationUrl : null,
    ].filter(Boolean).join('\n')
    wx.setClipboardData({
      data: citation,
      success: () => wx.showToast({ title: '已复制出处', icon: 'none' }),
      fail: () => wx.showToast({ title: '未能复制，请稍后重试', icon: 'none' }),
    })
  },
  openOfficialAccountArticle() {
    const url = this.data.resource?.entry.url
    if (!this.data.allowArticle || !url) return
    wx.openOfficialAccountArticle?.({
      url,
      fail: () => this.setData({ entryError: '当前无法打开公众号文章，可以复制出处。' }),
    })
  },
  openOtherMiniProgram() {
    const entry = this.data.resource?.entry
    if (!this.data.allowMiniProgram || !entry?.appId) return
    wx.navigateToMiniProgram({
      appId: entry.appId,
      path: entry.path ?? undefined,
      fail: () => this.setData({ entryError: '当前无法打开来源小程序，可以复制出处。' }),
    })
  },
})
