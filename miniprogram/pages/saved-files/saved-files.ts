import { deleteSavedFile, listSavedFiles } from '../../services/download-library'

Page({
  data: {
    files: [] as Awaited<ReturnType<typeof listSavedFiles>>,
    loading: false, removing: '', error: '', removalError: '',
  },
  onShow() { return this.refresh() },
  async refresh() {
    if (this.data.loading || this.data.removing) return
    this.setData({ loading: true, error: '' })
    try {
      this.setData({ files: await listSavedFiles() })
    } catch {
      this.setData({ error: '暂时无法读取本机文件。' })
    } finally {
      this.setData({ loading: false })
    }
  },
  confirmRemoval(event: WechatMiniprogram.TouchEvent) {
    const { key } = event.currentTarget.dataset
    if (this.data.loading || this.data.removing || typeof key !== 'string') return
    const file = this.data.files.find(item => item.key === key)
    if (!file) return
    wx.showModal({
      title: '移除本机副本？',
      content: file.fileName,
      confirmText: '移除',
      success: ({ confirm }) => { if (confirm) void this.remove(key) },
    })
  },
  async remove(key: string) {
    if (this.data.removing) return
    this.setData({ removing: key, removalError: '' })
    try {
      await deleteSavedFile(key)
      this.setData({ files: this.data.files.filter(file => file.key !== key) })
      wx.showToast({ title: '已移除', icon: 'none' })
    } catch {
      this.setData({ removalError: '未能移除文件，请重试。' })
    } finally {
      this.setData({ removing: '' })
    }
  },
})
