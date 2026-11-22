import { buildGuideOutline, guideNodes, type GuideNode, type GuideSection } from '../../services/guide-html'
import { HttpError, wanwanApi } from '../../services/api'
import { decodeOption, openResource, resourceLabel } from '../../services/reading'

Page({
  data: {
    kind: '', name: '', title: '', intro: '', date: '', author: '',
    body: [] as GuideNode[],
    sections: [] as GuideSection[],
    toc: [] as { id: string; title: string }[],
    highlights: [] as string[],
    readMinutes: 0,
    openSections: {} as Record<string, boolean>,
    expandAll: false,
    showToc: false,
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
    this.setData({
      loading: true, error: '', retryable: false, title: '', items: [],
      body: [], sections: [], toc: [], highlights: [], readMinutes: 0,
      openSections: {}, expandAll: false, showToc: false, date: '', author: '',
    })
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
        const nodes = guideNodes(guide.content || '', guide.title)
        const outline = buildGuideOutline(nodes)
        const openSections: Record<string, boolean> = {}
        // Default open: intro block (if untitled) + first titled chapter only, so long articles never overwhelm small screens.
        let openedChapter = false
        for (const sec of outline.sections) {
          if (!sec.title) {
            openSections[sec.id] = true
          } else if (!openedChapter) {
            openSections[sec.id] = true
            openedChapter = true
          } else {
            openSections[sec.id] = false
          }
        }
        this.setData({
          title: guide.title, intro: '', date: guide.publishTime?.slice(0, 10) ?? '',
          author: guide.author || '',
          body: nodes,
          sections: outline.sections,
          toc: outline.toc,
          highlights: outline.highlights,
          readMinutes: outline.readMinutes,
          openSections,
          expandAll: outline.toc.length <= 1,
        })
      }
    } catch (error) {
      const unavailable = error instanceof HttpError && error.statusCode === 404
      this.setData({ error: unavailable ? '这项内容不可访问或已下线。' : '暂时无法加载，请重试。', retryable: !unavailable })
    } finally {
      this.setData({ loading: false })
    }
  },
  toggleSection(e: WechatMiniprogram.TouchEvent) {
    const { id } = e.currentTarget.dataset as { id?: string }
    if (!id) return
    const next = { ...this.data.openSections, [id]: !this.data.openSections[id] }
    const expandAll = this.data.toc.every(item => !!next[item.id])
    this.setData({ openSections: next, expandAll })
  },
  toggleExpandAll() {
    const nextState = !this.data.expandAll
    const openSections: Record<string, boolean> = {}
    for (const sec of this.data.sections) {
      openSections[sec.id] = !sec.title ? true : nextState
    }
    this.setData({ openSections, expandAll: nextState })
  },
  toggleToc() {
    this.setData({ showToc: !this.data.showToc })
  },
  noop() {},
  jumpToSection(e: WechatMiniprogram.TouchEvent) {
    const { id } = e.currentTarget.dataset as { id?: string }
    if (!id) {
      this.setData({ showToc: false })
      return
    }
    const openSections = { ...this.data.openSections, [id]: true }
    this.setData({ showToc: false, openSections })
    wx.pageScrollTo?.({ selector: `#${id}`, duration: 240 })
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
