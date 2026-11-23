import { buildGuideOutline, guideNodes, guideNodesToHtml, type GuideNode, type GuideSection } from '../../services/guide-html'
import { HttpError, type LiteratureCitation, wanwanApi } from '../../services/api'
import { decodeOption, openResource, resourceLabel } from '../../services/reading'

Page({
  data: {
    kind: '', name: '', title: '', intro: '', date: '', author: '',
    isLiterature: false,
    citation: null as LiteratureCitation | null,
    citationPubInfo: '',
    body: [] as GuideNode[],
    bodyHtml: '',
    sections: [] as GuideSection[],
    toc: [] as { id: string; title: string }[],
    highlights: [] as string[],
    readMinutes: 0,
    openSections: {} as Record<string, boolean>,
    activeSectionId: '',
    expandAll: false,
    fullReading: false,
    showToc: false,
    items: [] as ReturnType<typeof resourceLabel>[],
    loading: true, error: '', retryable: false,
  },
  loadedKey: '',
  requestSeq: 0,
  onLoad(options: Record<string, string | undefined>) {
    this.setData({ kind: options.kind ?? '', name: decodeOption(options.name), fullReading: options.mode === 'full' })
  },
  onShow() {
    void this.load()
  },
  async load() {
    const seq = ++this.requestSeq
    const { kind, name } = this.data
    const key = `${kind}:${name}`
    const sameDoc = this.loadedKey === key && !this.data.error
      && (kind === 'topic' ? (this.data.items.length > 0 || Boolean(this.data.title)) : this.data.sections.length > 0)
    if (!sameDoc) {
      this.setData({
        loading: true, error: '', retryable: false, title: '', items: [],
        isLiterature: false, citation: null, citationPubInfo: '',
        body: [], bodyHtml: '', sections: [], toc: [], highlights: [], readMinutes: 0,
        openSections: {}, activeSectionId: '', expandAll: false, showToc: false, date: '', author: '',
      })
    }
    if (!name || (kind !== 'topic' && kind !== 'guide')) {
      this.setData({ loading: false, error: '没有找到这篇内容，请返回资料库重新查找。' })
      return
    }
    try {
      if (kind === 'topic') {
        const topic = await wanwanApi.getTopic(name)
        if (seq !== this.requestSeq) return
        this.loadedKey = key
        this.setData({ title: topic.title, intro: topic.intro, items: topic.resources.map(resourceLabel), error: '', retryable: false, loading: false })
      } else {
        const guide = await wanwanApi.getPost(name)
        if (seq !== this.requestSeq) return
        const nodes = guideNodes(guide.content || '', guide.title)
        const outline = buildGuideOutline(nodes)
        let openSections: Record<string, boolean> = sameDoc ? { ...this.data.openSections } : {}
        let activeSectionId = sameDoc ? this.data.activeSectionId : ''
        if (!sameDoc) {
          let openedChapter = false
          for (const sec of outline.sections) {
            if (!sec.title || this.data.fullReading) {
              openSections[sec.id] = true
            } else if (!openedChapter) {
              openSections[sec.id] = true
              activeSectionId = sec.id
              openedChapter = true
            } else {
              openSections[sec.id] = false
            }
          }
        }
        const isLiterature = guide.articleKind === 'LITERATURE'
        const citation = isLiterature ? (guide.citation ?? null) : null
        const citationPubInfo = citation
          ? [citation.journal, citation.publishedYear].filter(Boolean).join(' · ')
          : ''
        this.loadedKey = key
        this.setData({
          title: guide.title, intro: '', date: guide.publishTime?.slice(0, 10) ?? '',
          author: guide.author || '',
          isLiterature,
          citation,
          citationPubInfo,
          body: nodes,
          bodyHtml: guideNodesToHtml(nodes),
          sections: outline.sections,
          toc: outline.toc,
          highlights: outline.highlights,
          readMinutes: outline.readMinutes,
          openSections,
          activeSectionId: activeSectionId || outline.toc[0]?.id || '',
          expandAll: sameDoc ? this.data.expandAll : this.data.fullReading || outline.toc.length <= 1,
          error: '', retryable: false, loading: false,
        })
      }
    } catch (error) {
      if (seq !== this.requestSeq) return
      const unavailable = error instanceof HttpError && error.statusCode === 404
      this.loadedKey = ''
      this.setData({
        title: '', intro: '', items: [], isLiterature: false, citation: null, citationPubInfo: '',
        body: [], sections: [], toc: [], highlights: [],
        error: unavailable ? '这项内容不可访问或已下线。' : '暂时无法加载，请重试。',
        retryable: !unavailable,
        loading: false,
      })
    }
  },
  toggleSection(e: WechatMiniprogram.TouchEvent) {
    const { id } = e.currentTarget.dataset as { id?: string }
    if (!id) return
    const opening = !this.data.openSections[id]
    const next = { ...this.data.openSections, [id]: opening }
    const expandAll = this.data.toc.every(item => !!next[item.id])
    this.setData({ openSections: next, expandAll, ...(opening ? { activeSectionId: id } : {}) })
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
    this.setData({ showToc: false, openSections, activeSectionId: id })
    const scroll = () => wx.pageScrollTo?.({ selector: `#${id}`, duration: 240 })
    if (typeof (wx as unknown as { nextTick?: (cb: () => void) => void }).nextTick === 'function') {
      (wx as unknown as { nextTick: (cb: () => void) => void }).nextTick(scroll)
    } else {
      scroll()
    }
  },
  copyCitation() {
    const { title, citation, citationPubInfo } = this.data
    const lines = [
      title,
      citation?.originalTitle ? `原文：${citation.originalTitle}` : '',
      citationPubInfo ? `出处：${citationPubInfo}` : '',
      citation?.doi ? `DOI：${citation.doi}` : '',
      citation?.sourceUrl || '',
    ].filter(Boolean)
    if (!lines.length) return
    wx.setClipboardData({
      data: lines.join('\n'),
      success: () => wx.showToast({ title: '已复制文献出处', icon: 'none' }),
      fail: () => wx.showToast({ title: '未能复制，请稍后重试', icon: 'none' }),
    })
  },
  openDetail: openResource,
  onShareAppMessage() {
    const { loading, error, kind, name, title, isLiterature } = this.data
    if (!loading && !error && title && name && (kind === 'topic' || kind === 'guide')) {
      const shareTitle = kind === 'guide' && isLiterature ? `【文献译读】${title}` : title
      return { title: shareTitle, path: `/pages/reading/reading?kind=${kind}&name=${encodeURIComponent(name)}${this.data.fullReading ? '&mode=full' : ''}` }
    }
    return { title: '小脚丫步步指南｜资料库', path: '/pages/library/library' }
  },
  onShareTimeline() {
    const { loading, error, kind, name, title, isLiterature } = this.data
    if (!loading && !error && title && name && (kind === 'topic' || kind === 'guide')) {
      const shareTitle = kind === 'guide' && isLiterature ? `【文献译读】${title}` : title
      return { title: shareTitle, query: `kind=${kind}&name=${encodeURIComponent(name)}${this.data.fullReading ? '&mode=full' : ''}` }
    }
    return { title: '小脚丫步步指南｜足内翻家庭资料库', query: '' }
  },
  backToLibrary() {
    wx.switchTab({ url: '/pages/library/library' })
  },
})
