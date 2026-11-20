import { checklistPdf } from './checklist-pdf'

export interface Attachment {
  fileName: string
  url: string
}

export type Download = { fileName: string; key: string } & (
  { base64: string } | { url: string }
)

export const ultrasoundChecklist: Download = {
  key: 'clubfoot-ultrasound-v1',
  fileName: '足内翻超声复查清单_一页简版.pdf',
  base64: checklistPdf,
}

export function fileKind(fileName: string) {
  const dot = fileName.lastIndexOf('.')
  if (dot < 1) return null
  const suffix = fileName.slice(dot + 1).toLowerCase()
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(suffix)) return 'document'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(suffix)) return 'image'
  return suffix === 'zip' ? 'archive' : null
}

export function approvedDownload(name: string, attachment?: Attachment | null): Download | null {
  if (!attachment || typeof attachment.url !== 'string' || typeof attachment.fileName !== 'string'
    || !/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:[/?]|$)/i.test(attachment.url)
    || attachment.fileName.length > 80 || /[\/\\\x00-\x1f]/.test(attachment.fileName)
    || !fileKind(attachment.fileName)) return null
  return { ...attachment, key: name }
}

export function downloadPath(download: Download) {
  let hash = 2166136261
  const identity = [download.key, download.fileName, 'url' in download ? download.url : ''].join('\0')
  for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619)
  const suffix = download.fileName.slice(download.fileName.lastIndexOf('.') + 1).toLowerCase()
  return `${wx.env.USER_DATA_PATH}/xiaojiaoya-${(hash >>> 0).toString(16)}.${suffix}`
}

export function savedPath(download: Download): Promise<string | null> {
  const path = downloadPath(download)
  return new Promise(resolve => wx.getFileSystemManager().access({
    path,
    success: () => resolve(path),
    fail: () => resolve(null),
  }))
}

export async function saveDownload(download: Download): Promise<string> {
  const filePath = downloadPath(download)
  const fs = wx.getFileSystemManager()
  if ('base64' in download) {
    await new Promise<void>((resolve, reject) => fs.writeFile({
      filePath, data: download.base64, encoding: 'base64', success: () => resolve(), fail: reject,
    }))
    return filePath
  }
  const tempFilePath = await new Promise<string>((resolve, reject) => wx.downloadFile({
    url: download.url,
    success(result) {
      if (result.statusCode === 200 && result.tempFilePath) resolve(result.tempFilePath)
      else reject(new Error(`HTTP ${result.statusCode}`))
    },
    fail: reject,
  }))
  return new Promise((resolve, reject) => fs.saveFile({
    filePath, tempFilePath, success: result => resolve(result.savedFilePath), fail: reject,
  }))
}
