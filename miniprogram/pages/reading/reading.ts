import { HttpError, wanwanApi } from '../../services/api'
import { decodeOption, openResource, plainGuideBody, resourceLabel } from '../../services/reading'

Page({
  data: {
    kind: '', name: '', title: '', intro: '', date: '', author: '', body: '',
    items: [] as ReturnType<typeof resourceLabel>[],
    loading: true, error: '', retryable: false,
  },
  onLoad(options: Record<string, string | undefined>) {
    this.setData({ kind: options.kind ?? '', name: decodeOption(options.name) })
  },
  onShow() {
    void this.load()
  },
  async load() {
    const { kind, name } = this.data
    this.setData({ loading: true, error: '', retryable: false, title: '', items: [], body: '', date: '', author: '' })
    if (!name || (kind !== 'topic' && kind !== 'guide')) {
      this.setData({ loading: false, error: '入口缺少有效的专题或导读。' })
      return
    }
    try {
      if (kind === 'topic') {
        const topic = await wanwanApi.getTopic(name)
        this.setData({ title: topic.title, intro: topic.intro, items: topic.resources.map(resourceLabel) })
      } else {
        const guide = await wanwanApi.getPost(name)
        this.setData({
          title: guide.title, intro: '', date: guide.publishTime?.slice(0, 10) ?? '',
          author: guide.author || '',
          body: plainGuideBody(guide.content),
        })
      }
    } catch (error) {
      const unavailable = error instanceof HttpError && error.statusCode === 404
      this.setData({ error: unavailable ? '这项内容不可访问或已下线。' : '暂时无法加载，请重试。', retryable: !unavailable })
    } finally {
      this.setData({ loading: false })
    }
  },
  openDetail: openResource,
  onShareAppMessage() {
    const { loading, error, kind, name, title } = this.data
    if (!loading && !error && title && name && (kind === 'topic' || kind === 'guide')) {
      return { title, path: `/pages/reading/reading?kind=${kind}&name=${encodeURIComponent(name)}` }
    }
    return { title: '小脚丫步步指南｜资料库', path: '/pages/library/library' }
  },
  backToLibrary() {
    wx.switchTab({ url: '/pages/library/library' })
  },
})
