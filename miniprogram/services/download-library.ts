import { downloadFileKey, fileKind, ultrasoundChecklist, type Download } from './downloads'

const INDEX = 'xiaojiaoya-saved-files'
const isFileKey = (key: string) => /^xiaojiaoya-[a-f0-9]{1,8}\.[a-z0-9]+$/.test(key) && Boolean(fileKind(key))

interface SavedCopy {
  key: string
  fileName: string
  resourceName: string
  savedAt: number
}

function readIndex(): SavedCopy[] {
  try {
    const value = wx.getStorageSync(INDEX)
    if (!Array.isArray(value)) return []
    return value.filter((file): file is SavedCopy => file && typeof file.key === 'string' && isFileKey(file.key)
      && typeof file.fileName === 'string' && file.fileName.length <= 80 && typeof file.resourceName === 'string'
      && typeof file.savedAt === 'number' && Number.isFinite(file.savedAt) && file.savedAt >= 0)
  } catch {
    return []
  }
}

function writeIndex(files: SavedCopy[]) {
  try {
    wx.setStorageSync(INDEX, files)
  } catch {
    // The user directory remains the source of truth, including on low storage.
  }
}

export function rememberDownload(download: Download, resourceName: string, newlySaved: boolean) {
  const key = downloadFileKey(download)
  const files = readIndex()
  const existing = files.find(item => item.key === key)
  if (existing && !newlySaved && existing.fileName === download.fileName && existing.resourceName === resourceName) return
  writeIndex([{ key, fileName: download.fileName, resourceName, savedAt: newlySaved ? Date.now() : 0 },
    ...files.filter(item => item.key !== key)])
}

function directoryFiles(): Promise<string[]> {
  return new Promise((resolve, reject) => wx.getFileSystemManager().readdir({
    dirPath: wx.env.USER_DATA_PATH, success: ({ files }) => resolve(files), fail: reject,
  }))
}

export async function listSavedFiles() {
  const keys = (await directoryFiles()).filter(isFileKey)
  const known = new Map(readIndex().map(file => [file.key, file]))
  const checklistKey = downloadFileKey(ultrasoundChecklist)
  return keys.map(key => {
    const entry = known.get(key)
    const builtIn = key === checklistKey
    const suffix = key.slice(key.lastIndexOf('.') + 1).toUpperCase()
    const fileName = builtIn ? ultrasoundChecklist.fileName : entry?.fileName || '以前保存的附件'
    const resource = entry?.resourceName
    return {
      key, fileName, suffix, savedAt: entry?.savedAt || 0,
      url: builtIn ? '/pages/downloads/downloads'
        : resource ? `/pages/downloads/downloads?resource=${encodeURIComponent(resource)}&copy=${key}` : '',
    }
  }).sort((first, second) => second.savedAt - first.savedAt || first.key.localeCompare(second.key))
}

export async function deleteSavedFile(key: string) {
  if (!isFileKey(key)) throw new Error('Invalid saved file')
  try {
    await new Promise<void>((resolve, reject) => wx.getFileSystemManager().unlink({
      filePath: `${wx.env.USER_DATA_PATH}/${key}`, success: () => resolve(), fail: reject,
    }))
  } catch (error) {
    if ((await directoryFiles()).includes(key)) throw error
  }
  writeIndex(readIndex().filter(item => item.key !== key))
}
