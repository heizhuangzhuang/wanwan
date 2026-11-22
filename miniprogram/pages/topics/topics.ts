import { wanwanApi } from '../../services/api'
import { fixedStages } from '../../services/stages'

type ReadingLink = { name: string; title: string; intro: string; date?: string; resourceCount?: number }

Page({
  requestSeq: 0,
  data: {
    kind: 'topic', stage: '', stageLabel: '', items: [] as ReadingLink[], page: 1, hasNext: false,
    loading: false, error: '', requestedPage: 1,
  },
  onLoad(options: Record<string, string | undefined>) {
    const stage = options.kind === 'guide' ? fixedStages.find(stage => stage.key === options.stage) : undefined
    this.setData({ kind: options.kind === 'guide' ? 'guide' : 'topic', stage: stage?.key ?? '', stageLabel: stage?.label ?? '' })
  },
  onShow() {
    void this.fetch(this.data.page)
  },
  selectKind(e: WechatMiniprogram.TouchEvent) {
    const kind = e.currentTarget.dataset.kind
    if ((kind === this.data.kind && !this.data.error) || (kind !== 'topic' && kind !== 'guide')) return
    this.setData({ kind, page: 1, hasNext: false, items: [], error: '' })
    void this.fetch(1)
  },
  async fetch(page: number) {
    const seq = ++this.requestSeq
    const { kind, stage } = this.data
    this.setData({ loading: true, error: '', items: [], requestedPage: page })
    try {
      if (kind === 'topic') {
        const res = await wanwanApi.listTopics(page)
        if (seq !== this.requestSeq) return
        this.setData({ items: res.items, page: res.page, hasNext: res.page * res.size < res.total, loading: false })
      } else {
        const res = await (stage ? wanwanApi.listStagePosts(stage, page) : wanwanApi.listPosts(page))
        if (seq !== this.requestSeq) return
        this.setData({
          items: res.items.map(post => ({
            name: post.name, title: post.title, intro: post.excerpt ?? '', date: post.publishTime?.slice(0, 10),
          })),
          page: res.page, hasNext: res.page * res.size < res.total, loading: false,
        })
      }
    } catch {
      if (seq !== this.requestSeq) return
      this.setData({ error: '暂时无法加载，请重试。', loading: false })
    }
  },
  retry() { void this.fetch(this.data.requestedPage) },
  previousPage() { if (this.data.page > 1) void this.fetch(this.data.page - 1) },
  nextPage() { if (this.data.hasNext) void this.fetch(this.data.page + 1) },
  openReading(e: WechatMiniprogram.TouchEvent) {
    const { name } = e.currentTarget.dataset
    if (typeof name === 'string' && name) {
      wx.navigateTo({ url: `/pages/reading/reading?kind=${this.data.kind}&name=${encodeURIComponent(name)}` })
    }
  },
  onShareAppMessage() {
    const { kind, stage, stageLabel } = this.data
    if (kind === 'guide' && stage) {
      return {
        title: `小脚丫步步指南｜${stageLabel}原创导读`,
        path: `/pages/topics/topics?kind=guide&stage=${encodeURIComponent(stage)}`,
      }
    }
    return {
      title: kind === 'guide' ? '小脚丫步步指南｜本站原创导读' : '小脚丫步步指南｜精选阅读专题',
      path: `/pages/topics/topics?kind=${kind}`,
    }
  },
  onShareTimeline() {
    const { kind, stage, stageLabel } = this.data
    return {
      title: stageLabel ? `小脚丫步步指南｜${stageLabel}原创导读` : '小脚丫步步指南｜原创导读与精选专题',
      query: kind === 'guide' && stage ? `kind=guide&stage=${encodeURIComponent(stage)}` : `kind=${kind}`,
    }
  },
})
