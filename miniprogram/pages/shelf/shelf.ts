import { HttpError, wanwanApi } from '../../services/api'
import { openResource, resourceLabel } from '../../services/reading'
import { removeFromShelf, shelfNames } from '../../services/reading-shelf'

const PAGE_SIZE = 6
type ShelfKind = 'saved' | 'recent'

Page({
  data: {
    kind: 'saved' as ShelfKind, items: [] as ReturnType<typeof resourceLabel>[],
    page: 1, hasNext: false, loading: false, failed: false,
  },
  onLoad(options: Record<string, string | undefined>) {
    if (options.kind === 'recent') this.setData({ kind: 'recent' })
  },
  onShow() { void this.load(this.data.page) },
  selectKind(event: WechatMiniprogram.TouchEvent) {
    const kind = event.currentTarget.dataset.kind
    if (this.data.loading || (kind !== 'saved' && kind !== 'recent')) return
    this.setData({ kind })
    void this.load(1)
  },
  async load(page: number) {
    if (this.data.loading) return
    const kind = this.data.kind
    const names = shelfNames(kind)
    const currentPage = Math.min(page, Math.max(1, Math.ceil(names.length / PAGE_SIZE)))
    const end = currentPage * PAGE_SIZE
    const selected = names.slice(end - PAGE_SIZE, end)
    this.setData({ page: currentPage, loading: true, items: [], failed: false })
    const results = await Promise.allSettled(selected.map(name => wanwanApi.getResource(name)))
    const items: ReturnType<typeof resourceLabel>[] = []
    let failed = false
    let removed = false
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled' && result.value.linkStatus !== 'SOURCE_RETRACTED') {
        items.push(resourceLabel(result.value))
      } else if (result.status === 'fulfilled'
        || (result.reason instanceof HttpError && result.reason.statusCode === 404)) {
        removed = removeFromShelf(kind, selected[index]) || removed
      } else {
        failed = true
      }
    }
    this.setData({ items, failed, hasNext: end < names.length, loading: false })
    if (removed) await this.load(currentPage)
  },
  remove(event: WechatMiniprogram.TouchEvent) {
    const { name } = event.currentTarget.dataset
    if (typeof name !== 'string') return
    if (removeFromShelf(this.data.kind, name)) {
      void this.load(this.data.page)
    } else {
      wx.showToast({ title: '未能更新阅读夹', icon: 'none' })
    }
  },
  retry() { void this.load(this.data.page) },
  previousPage() { if (this.data.page > 1) void this.load(this.data.page - 1) },
  nextPage() { if (this.data.hasNext) void this.load(this.data.page + 1) },
  openDetail: openResource,
})
