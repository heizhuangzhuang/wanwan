type ShelfKind = 'saved' | 'recent'

function storageKey(kind: ShelfKind) {
  const mode = getApp<{ globalData: { demoMode: boolean; useCloudContainer: boolean } }>().globalData
  const source = mode.demoMode ? 'demo' : mode.useCloudContainer ? 'cloud' : 'local'
  return `wanwan-reading-${source}-${kind}`
}

export function shelfNames(kind: ShelfKind): string[] {
  try {
    const value = wx.getStorageSync(storageKey(kind))
    return Array.isArray(value) ? [...new Set(value.filter((item): item is string =>
      typeof item === 'string' && item.length > 0 && item.length <= 253,
    ))].slice(0, 30) : []
  } catch {
    return []
  }
}

function writeShelf(kind: ShelfKind, names: string[]) {
  try {
    wx.setStorageSync(storageKey(kind), names.slice(0, 30))
    return true
  } catch {
    return false
  }
}

export function rememberResource(name: string) {
  writeShelf('recent', [name, ...shelfNames('recent').filter(item => item !== name)])
}

export function removeFromShelf(kind: ShelfKind, name: string) {
  return writeShelf(kind, shelfNames(kind).filter(item => item !== name))
}

export function toggleSaved(name: string) {
  const names = shelfNames('saved')
  const saved = !names.includes(name)
  const updated = saved ? [name, ...names] : names.filter(item => item !== name)
  return writeShelf('saved', updated) ? saved : null
}
