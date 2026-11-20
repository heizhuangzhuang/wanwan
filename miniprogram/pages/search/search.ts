import { wanwanApi, type StageView } from '../../services/api'
import { materialTypes, openResource, resourceLabel } from '../../services/reading'
import { clearSearchHistory, readSearchHistory, rememberSearch } from '../../services/search-history'

Page({
  data: {
    suggestions: ['产前', '石膏', '支具', '随访'], keyword: '', submittedKeyword: '', items: [] as ReturnType<typeof resourceLabel>[],
    stages: [{ key: '', label: '全部阶段', order: -1 }] as StageView[], stageIndex: 0, stageError: false,
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
      this.setData({ stages: [this.data.stages[0], ...stages], stageError: false })
    } catch {
      this.setData({ stageError: true })
    }
  },
  pickKeyword(event: WechatMiniprogram.TouchEvent) {
    if (this.data.loading) return
    const keyword = event.currentTarget.dataset.keyword
    if (typeof keyword !== 'string') return
    this.setData({ keyword })
    this.doSearch()
  },
  onInput(e: WechatMiniprogram.Input) { this.setData({ keyword: e.detail.value }) },
  clearKeyword() {
    if (this.data.loading) return
    this.setData({ keyword: '', submittedKeyword: '', items: [], error: '', page: 1, requestedPage: 1, hasNext: false })
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
    if (this.data.loading) return
    const keyword = this.data.keyword.trim()
    if (!keyword || keyword.length > 100) {
      this.setData({ error: !keyword ? '请输入关键词。' : '关键词请勿超过 100 个字符。', items: [], submittedKeyword: '', page: 1, hasNext: false })
      return
    }
    this.setData({ submittedKeyword: keyword })
    void this.fetch(1, true)
  },
  onStage(e: WechatMiniprogram.PickerChange) {
    if (this.data.loading) return
    this.setData({ stageIndex: Number(e.detail.value) })
    if (this.data.submittedKeyword) void this.fetch(1)
  },
  onType(e: WechatMiniprogram.PickerChange) {
    if (this.data.loading) return
    this.setData({ typeIndex: Number(e.detail.value) })
    if (this.data.submittedKeyword) void this.fetch(1)
  },
  async fetch(page: number, record = false) {
    if (this.data.loading) return
    const { submittedKeyword, stages, stageIndex, typeIndex } = this.data
    this.setData({ loading: true, error: '', items: [], requestedPage: page })
    try {
      const result = await wanwanApi.search({ keyword: submittedKeyword, stage: stages[stageIndex]?.key, type: materialTypes[typeIndex]?.key, page })
      this.setData({ items: result.items.map(resourceLabel), page: result.page, hasNext: result.page * result.size < result.total })
      if (record) this.setData({ history: rememberSearch(submittedKeyword) })
    } catch {
      this.setData({ error: '搜索暂时不可用，请重试。' })
    } finally {
      this.setData({ loading: false })
    }
  },
  retry() { void this.fetch(this.data.requestedPage, this.data.requestedPage === 1) },
  previousPage() { if (this.data.page > 1) void this.fetch(this.data.page - 1) },
  nextPage() { if (this.data.hasNext) void this.fetch(this.data.page + 1) },
  openDetail: openResource,
  browseStages() { wx.switchTab({ url: '/pages/index/index' }) },
})
