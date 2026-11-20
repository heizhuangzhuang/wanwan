const STORAGE = 'xiaojiaoya-recent-searches'
const LIMIT = 8

export function readSearchHistory(): string[] {
  try {
    const value = wx.getStorageSync(STORAGE)
    if (Array.isArray(value)) {
      const terms = value.filter((term): term is string => typeof term === 'string' && term.length <= 100)
        .map(term => term.trim()).filter(Boolean)
      return [...new Set(terms)].slice(0, LIMIT)
    }
  } catch {
    // Search remains available when local storage cannot be read.
  }
  return []
}

export function rememberSearch(keyword: string): string[] {
  const existing = readSearchHistory()
  const updated = [keyword, ...existing.filter(term => term !== keyword)].slice(0, LIMIT)
  return writeHistory(updated) ? updated : existing
}

export function clearSearchHistory() {
  return writeHistory([])
}

function writeHistory(terms: string[]) {
  try {
    wx.setStorageSync(STORAGE, terms)
    return true
  } catch {
    return false
  }
}
