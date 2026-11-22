import { wanwanApi, type PostSummary, type StageView } from '../../services/api'
import { filterPrenatalDirectory } from '../../services/prenatal-directory'
import { materialTypes, openResource, resourceLabel } from '../../services/reading'
import { clearSearchHistory, readSearchHistory, rememberSearch } from '../../services/search-history'
import { fixedStages } from '../../services/stages'

const allStages: StageView = { key: '', label: '全部阶段', order: -1 }

Page({
  requestSeq: 0,
  data: {
    suggestions: ['产前', '羊穿', 'CMA', '石膏', '支具'],
    keyword: '', submittedKeyword: '',
    items: [] as ReturnType<typeof resourceLabel>[],
    guideItems: [] as PostSummary[],
    prenatalResults: [] as ReturnType<typeof filterPrenatalDirectory>[number]['items'],
    stages: [allStages, ...fixedStages], stageIndex: 0,
    materials: materialTypes, typeIndex: 0, page: 1, hasNext: false, requestedPage: 1,
    loading: false, error: '',
    history: [] as string[],
  },
  onLoad() { void this.loadFilters() },
  onShow() {
    this.setData({ history: readSearchHistory() })
    if (this.data.submittedKeyword) void this.fetch(this.data.page)
  },
  async loadFilters() {
    try {
      const stages = await wanwanApi.getStages()
      if (stages.length && this.data.stageIndex === 0) this.setData({ stages: [allStages, ...stages] })
    } catch {
      // The fixed stages still work for built-in guides when the public API is unavailable.
    }
  },
  pickKeyword(event: WechatMiniprogram.TouchEvent) {
    const keyword = event.currentTarget.dataset.keyword
    if (typeof keyword !== 'string') return
    this.setData({ keyword })
    this.doSearch()
  },
  onInput(e: WechatMiniprogram.Input) { this.setData({ keyword: e.detail.value }) },
  clearKeyword() {
    this.requestSeq += 1
    this.setData({ keyword: '', submittedKeyword: '', prenatalResults: [], items: [], guideItems: [], error: '', loading: false, page: 1, requestedPage: 1, hasNext: false })
  },
  confirmClearHistory() {
    if (!this.data.history.length || this.data.loading) return
    wx.showModal({ title: '清空最近搜索？', content: '将移除此设备上的搜索记录。', confirmText: '清空',
      success: ({ confirm }) => {
        if (!confirm) return
        if (clearSearchHistory()) this.setData({ history: [] })
        else wx.showToast({ title: '未能清空，请重试', icon: 'none' })
      },
    })
  },
  doSearch() {
    const keyword = this.data.keyword.trim()
    if (!keyword || keyword.length > 100) {
      this.requestSeq += 1
      this.setData({ error: !keyword ? '请输入关键词。' : '关键词请勿超过 100 个字符。', items: [], guideItems: [], prenatalResults: [], submittedKeyword: '', loading: false, page: 1, hasNext: false })
      return
    }
    this.setData({ submittedKeyword: keyword })
    void this.fetch(1, true)
  },
  onStage(e: WechatMiniprogram.PickerChange) {
    this.setData({ stageIndex: Number(e.detail.value) })
    const term = this.data.submittedKeyword || this.data.keyword.trim()
    if (term && term.length <= 100) {
      if (!this.data.submittedKeyword) this.setData({ submittedKeyword: term })
      void this.fetch(1)
    }
  },
  onType(e: WechatMiniprogram.PickerChange) {
    this.setData({ typeIndex: Number(e.detail.value) })
    const term = this.data.submittedKeyword || this.data.keyword.trim()
    if (term && term.length <= 100) {
      if (!this.data.submittedKeyword) this.setData({ submittedKeyword: term })
      void this.fetch(1)
    }
  },
  async fetch(page: number, record = false) {
    const seq = ++this.requestSeq
    const { submittedKeyword, stages, stageIndex, typeIndex } = this.data
    const stage = stages[stageIndex]?.key
    const type = materialTypes[typeIndex]?.key
    const includePrenatal = submittedKeyword && page === 1
      && (!stage || stage === 'JUST_FOUND' || stage === 'PRENATAL')
      && (!type || type === 'ORIGINAL')
    const prenatalResults = includePrenatal ? filterPrenatalDirectory(submittedKeyword).flatMap(group => group.items) : []
    this.setData({ loading: true, error: '', items: [], guideItems: [], prenatalResults, requestedPage: page })
    if (record && prenatalResults.length) {
      this.setData({ history: rememberSearch(submittedKeyword) })
    }
    try {
      const result = await wanwanApi.search({ keyword: submittedKeyword, stage, type, page })
      if (seq !== this.requestSeq) return
      this.setData({
        items: result.items.map(resourceLabel),
        guideItems: result.guideItems ?? [],
        page: result.page,
        hasNext: result.page * result.size < Math.max(result.total, result.guideTotal ?? 0),
        loading: false,
      })
      if (record && !prenatalResults.length) {
        this.setData({ history: rememberSearch(submittedKeyword) })
      }
    } catch {
      if (seq !== this.requestSeq) return
      this.setData({ error: '公开资料暂时不可用，请重试。', loading: false })
    }
  },
  retry() { void this.fetch(this.data.requestedPage, this.data.requestedPage === 1) },
  previousPage() { if (this.data.page > 1) void this.fetch(this.data.page - 1) },
  nextPage() { if (this.data.hasNext) void this.fetch(this.data.page + 1) },
  openDetail: openResource,
  openGuide(e: WechatMiniprogram.TouchEvent) {
    const { name } = e.currentTarget.dataset
    if (typeof name === 'string' && name) {
      wx.navigateTo({ url: `/pages/reading/reading?kind=guide&name=${encodeURIComponent(name)}` })
    }
  },
  browseStages() { wx.switchTab({ url: '/pages/index/index' }) },
})
