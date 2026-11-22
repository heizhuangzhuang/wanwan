import { HttpError, wanwanApi, type ResourceView } from '../../services/api'
import { decodeOption, openResource, resourceLabel } from '../../services/reading'
import { rememberResource, removeFromShelf, shelfNames, toggleSaved } from '../../services/reading-shelf'

Page({
  data: {
    name: '', resource: null as ReturnType<typeof resourceLabel> | null,
    loading: true, error: '', retryable: false, entryError: '', saved: false, metaExpanded: false,
    related: [] as ReturnType<typeof resourceLabel>[],
    allowArticle: false, allowMiniProgram: false,
  },
  loadedName: '',
  requestSeq: 0,
  toggleMeta() {
    this.setData({ metaExpanded: !this.data.metaExpanded })
  },
  onLoad(options: Record<string, string | undefined>) {
    this.setData({ name: decodeOption(options.name) })
  },
  onShow() { void this.loadDetail() },
  async loadDetail() {
    const seq = ++this.requestSeq
    const { name } = this.data
    const sameCard = this.loadedName === name && !this.data.error && Boolean(this.data.resource)
    if (!sameCard) {
      this.setData({ loading: true, error: '', retryable: false, entryError: '', resource: null, related: [], saved: false })
    }
    if (!name) {
      this.setData({ loading: false, error: '入口缺少有效的资料标识。' })
      return
    }
    try {
      const resource = await wanwanApi.getResource(name)
      if (seq !== this.requestSeq) return
      const verified = resource.linkStatus === 'OK'
      if (resource.linkStatus !== 'SOURCE_RETRACTED') rememberResource(name)
      this.loadedName = name
      this.setData({
        resource: resourceLabel(resource),
        saved: shelfNames('saved').includes(name),
        allowArticle: verified && resource.entry.type === 'MP_ARTICLE' && !!resource.entry.url
          && typeof wx.openOfficialAccountArticle === 'function',
        allowMiniProgram: verified && resource.entry.type === 'MINIPROGRAM' && !!resource.entry.appId,
        loading: false,
        error: '',
        retryable: false,
      })
      if (resource.linkStatus !== 'SOURCE_RETRACTED') void this.loadRelated(resource)
    } catch (error) {
      if (seq !== this.requestSeq) return
      const unavailable = error instanceof HttpError && error.statusCode === 404
      this.loadedName = ''
      if (unavailable) {
        removeFromShelf('saved', name)
        removeFromShelf('recent', name)
      }
      this.setData({
        resource: null,
        related: [],
        error: unavailable ? '该资料不可访问或已下线。' : '暂时无法读取资料，请重试。',
        retryable: !unavailable,
        loading: false,
      })
    }
  },
  async loadRelated(resource: ResourceView) {
    const tag = resource.tags && resource.tags[0]
    const stage = resource.stages && resource.stages[0]
    if (!tag && !stage) return
    try {
      const list = await wanwanApi.listResources({ tag, stage: tag ? undefined : stage, size: 4 })
      if (this.data.resource?.name !== resource.name || this.data.resource.linkStatus === 'SOURCE_RETRACTED') return
      this.setData({ related: list.items.filter(item => item.name !== resource.name && item.linkStatus !== 'SOURCE_RETRACTED').slice(0, 3).map(resourceLabel) })
    } catch {
      // The detail and citation remain usable if suggestions fail.
    }
  },
  toggleFavorite() {
    const resource = this.data.resource
    if (!resource || resource.linkStatus === 'SOURCE_RETRACTED') return
    const saved = toggleSaved(resource.name)
    if (saved !== null) this.setData({ saved })
    else wx.showToast({ title: '未能更新收藏', icon: 'none' })
  },
  openDetail: openResource,
  openDownload() {
    const { resource } = this.data
    if (resource?.attachment && resource.linkStatus === 'OK') {
      wx.navigateTo({ url: `/pages/downloads/downloads?resource=${encodeURIComponent(resource.name)}` })
    }
  },
  onShareAppMessage() {
    const { loading, error, resource, name } = this.data
    if (!loading && !error && resource && name && resource.linkStatus !== 'SOURCE_RETRACTED') {
      return {
        title: resource.title,
        path: `/pages/detail/detail?name=${encodeURIComponent(name)}`,
      }
    }
    return { title: '小脚丫步步指南｜资料库', path: '/pages/library/library' }
  },
  onShareTimeline() {
    const { loading, error, resource, name } = this.data
    if (!loading && !error && resource && name && resource.linkStatus !== 'SOURCE_RETRACTED') {
      return { title: resource.title, query: `name=${encodeURIComponent(name)}` }
    }
    return { title: '小脚丫步步指南｜足内翻家庭资料库', query: '' }
  },
  openFeedback() {
    const { resource } = this.data
    if (resource) wx.navigateTo({ url: `/pages/feedback/feedback?category=ISSUE&resource=${encodeURIComponent(resource.name)}` })
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
