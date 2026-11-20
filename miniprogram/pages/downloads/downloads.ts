import { HttpError, wanwanApi } from '../../services/api'
import { approvedDownload, fileKind, saveDownload, savedPath, ultrasoundChecklist, type Download } from '../../services/downloads'
import { decodeOption } from '../../services/reading'

const pagePath = '/pages/downloads/downloads'

Page({
  download: null as Download | null,
  data: {
    resourceName: '', fileName: '', kind: '', localPath: '', loading: true,
    saving: false, error: '', status: '', canShare: false, canSaveImage: false,
  },
  onLoad(options: Record<string, string | undefined>) {
    this.setData({
      resourceName: decodeOption(options.resource),
      canShare: typeof wx.shareFileMessage === 'function',
      canSaveImage: typeof wx.saveImageToPhotosAlbum === 'function',
    })
    return this.loadFile()
  },
  onShow() {
    if (this.data.resourceName && !this.data.loading && !this.data.saving) return this.loadFile()
  },
  async loadFile() {
    this.setData({ loading: true, error: '', status: '', localPath: '', fileName: '', kind: '' })
    this.download = null
    try {
      const { resourceName } = this.data
      const item = resourceName ? await wanwanApi.getResource(resourceName) : null
      const download = resourceName
        ? (item?.linkStatus === 'OK' ? approvedDownload(resourceName, item.attachment) : null)
        : ultrasoundChecklist
      if (!download) {
        this.setData({ error: '该资料的下载入口已停用。' })
        return
      }
      this.download = download
      const localPath = await savedPath(download).catch(() => null)
      this.setData({
        fileName: download.fileName, kind: fileKind(download.fileName) || '',
        localPath: localPath || '',
      })
    } catch (err) {
      this.setData({ error: err instanceof HttpError && err.statusCode === 404
        ? '该资料已下线。' : '暂时无法读取下载信息，请重试。' })
    } finally {
      this.setData({ loading: false })
    }
  },
  async downloadFile() {
    if (!this.download || this.data.saving) return
    this.setData({ saving: true, status: '' })
    try {
      const localPath = await saveDownload(this.download)
      this.setData({ localPath, status: '已保存到小程序。' })
    } catch {
      this.setData({ status: '下载失败。请检查网络或小程序的可用存储空间，再重试。' })
    } finally {
      this.setData({ saving: false })
    }
  },
  preview() {
    const { localPath, kind } = this.data
    if (!localPath) return
    const fail = () => this.setData({ status: '暂时无法预览，可尝试转发文件。' })
    if (kind === 'document' && wx.openDocument) {
      wx.openDocument({ filePath: localPath, fileType: localPath.substring(localPath.lastIndexOf('.') + 1).toLowerCase(), showMenu: true, fail })
    } else if (kind === 'image' && wx.previewImage) {
      wx.previewImage({ urls: [localPath], fail })
    } else {
      fail()
    }
  },
  forwardFile() {
    const { localPath, fileName } = this.data
    if (!localPath) return
    wx.shareFileMessage?.({ filePath: localPath, fileName,
      fail: err => {
        if (!err.errMsg?.includes('cancel')) this.setData({ status: '转发失败，请在手机微信中重试。' })
      },
    })
  },
  saveToAlbum() {
    if (this.data.kind !== 'image' || !this.data.localPath) return
    wx.saveImageToPhotosAlbum?.({
      filePath: this.data.localPath,
      success: () => this.setData({ status: '已保存到手机相册。' }),
      fail: () => this.setData({ status: '未能保存到相册，请检查微信的相册权限后重试。' }),
    })
  },
  onShareAppMessage() {
    const { fileName, resourceName } = this.data
    return { title: fileName || '小脚丫步步指南｜资料下载',
      path: resourceName ? `${pagePath}?resource=${encodeURIComponent(resourceName)}` : pagePath }
  },
})
