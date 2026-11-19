import { wanwanApi } from '../../services/api'
import { decodeOption, materialTypes, openResource, resourceLabel } from '../../services/reading'

Page({
  data: {
    stageKey: '', materials: materialTypes, typeIndex: 0, tag: '', submittedTag: '',
    items: [] as ReturnType<typeof resourceLabel>[],
    page: 1, hasNext: false, loading: false, error: '', requestedPage: 1,
  },
  onLoad(options: Record<string, string | undefined>) {
    wx.setNavigationBarTitle({ title: decodeOption(options.label) || '阶段资料' })
    this.setData({ stageKey: decodeOption(options.key) })
  },
  onShow() { void this.fetch(this.data.page) },
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
  retry() { void this.fetch(this.data.requestedPage) },
  previousPage() { if (this.data.page > 1) void this.fetch(this.data.page - 1) },
  nextPage() { if (this.data.hasNext) void this.fetch(this.data.page + 1) },
  openDetail: openResource,
})
