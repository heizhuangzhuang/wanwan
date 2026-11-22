import { wanwanApi, type PostSummary } from '../../services/api'
import type { IAppOption } from '../../app'
import { familyGuide } from '../../services/family-guide'
import { decodeOption, materialTypes, openResource, resourceLabel } from '../../services/reading'

import { fixedStages, stageIntro } from '../../services/stages'

Page({
  data: {
    stageKey: '', heading: '', intro: '', materials: materialTypes, typeIndex: 0, tag: '', submittedTag: '',
    guide: null as ReturnType<typeof familyGuide>, prepareUrl: '',
    articles: [] as PostSummary[], articlesUrl: '', moreArticles: false,
    items: [] as ReturnType<typeof resourceLabel>[],
    page: 1, hasNext: false, loading: false, error: '', requestedPage: 1, demoMode: false,
  },
  onLoad(options: Record<string, string | undefined>) {
    const key = decodeOption(options.key)
    const heading = decodeOption(options.label) || fixedStages.find(stage => stage.key === key)?.label || '公开资料库'
    const guide = familyGuide(key)
    wx.setNavigationBarTitle({ title: heading })
    this.setData({
      stageKey: key,
      articlesUrl: '/pages/topics/topics?kind=guide&stage=' + encodeURIComponent(key),
      heading,
      demoMode: getApp<IAppOption>().globalData.demoMode,
      guide,
      prepareUrl: guide ? '/pages/preparation/preparation?stage=' + encodeURIComponent(key) : '',
      intro: guide?.summary ?? (key ? stageIntro(key) : '按资料类型和主题标签，找到想继续读的内容。'),
    })
  },
  onShow() {
    void this.fetch(this.data.page)
    void this.fetchArticles()
  },
  async fetchArticles() {
    const { stageKey } = this.data
    if (!fixedStages.some(stage => stage.key === stageKey)) return
    try {
      const result = await wanwanApi.listStagePosts(stageKey, 1, 3)
      this.setData({ articles: result.items, moreArticles: result.total > result.items.length })
    } catch {
      this.setData({ articles: [], moreArticles: false })
    }
  },
  copyGuideSource() {
    const source = this.data.guide?.source
    if (!source) return
    wx.setClipboardData({
      data: source.url,
      success: () => wx.showToast({ title: '已复制来源链接', icon: 'none' }),
      fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }),
    })
  },
  onType(e: WechatMiniprogram.PickerChange) {
    this.setData({ typeIndex: Number(e.detail.value) })
    void this.fetch(1)
  },
  onTag(e: WechatMiniprogram.Input) { this.setData({ tag: e.detail.value }) },
  applyTag() {
    if (this.data.loading) return
    this.setData({ submittedTag: this.data.tag.trim() })
    void this.fetch(1)
  },
  async fetch(page: number) {
    if (this.data.loading) return
    const { stageKey, typeIndex, submittedTag } = this.data
    this.setData({ loading: true, error: '', items: [], requestedPage: page })
    try {
      const result = await wanwanApi.listResources({ stage: stageKey, type: materialTypes[typeIndex]?.key, tag: submittedTag, page })
      this.setData({ items: result.items.map(resourceLabel), page: result.page, hasNext: result.page * result.size < result.total })
    } catch {
      this.setData({ error: '暂时无法加载资料，请重试。' })
    } finally {
      this.setData({ loading: false })
    }
  },
  retry() { void this.fetch(this.data.requestedPage); void this.fetchArticles() },
  previousPage() { if (this.data.page > 1) void this.fetch(this.data.page - 1) },
  nextPage() { if (this.data.hasNext) void this.fetch(this.data.page + 1) },
  openDetail: openResource,
})
