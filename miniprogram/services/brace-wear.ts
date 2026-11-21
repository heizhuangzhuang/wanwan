import { blankWearLog, dateKey, dayBoundary, normalizeWearLog, type WearLog, type WearSession } from './brace-ledger'

export { blankWearLog, dateKey, durationText, parseLocalTime, timeKey, type WearLog } from './brace-ledger'
const LEGACY = 'wanwan-brace-wear-v1'
const SLOT = 'wanwan-brace-wear-slot'

function storageFile(slot: number): string {
  return wx.env.USER_DATA_PATH + '/brace-wear-' + slot + '.json'
}

export function readWearLog(): WearLog {
  const slot = wx.getStorageSync(SLOT)
  if (slot === 0 || slot === 1) {
    return normalizeWearLog(JSON.parse(wx.getFileSystemManager().readFileSync(storageFile(slot), 'utf8')))
  }
  const legacy = wx.getStorageSync(LEGACY)
  if (legacy === '' || legacy === undefined || legacy === null) return blankWearLog()
  const log = normalizeWearLog(legacy)
  if (typeof legacy === 'object' && !('plans' in legacy) && log.plans.length) saveWearLog(log)
  return log
}

export function saveWearLog(log: WearLog): void {
  const fs = wx.getFileSystemManager?.()
  if (!fs?.writeFileSync) {
    wx.setStorageSync(LEGACY, log)
    return
  }
  // Keep the committed file intact until the replacement is fully written.
  const nextSlot = wx.getStorageSync(SLOT) === 0 ? 1 : 0
  fs.writeFileSync(storageFile(nextSlot), JSON.stringify(log), 'utf8')
  wx.setStorageSync(SLOT, nextSlot)
}

function touchesDay(session: WearSession, start: number, end: number): boolean {
  return session.start < end && session.end > start
}

export function dayWear(log: WearLog, day: string, now: number) {
  const start = dayBoundary(day, 0)
  const end = dayBoundary(day, 1)
  const sessions = log.sessions.filter(record => touchesDay(record, start, end))
    .sort((first, second) => second.start - first.start)
  const inProgress = log.activeStart === null ? null : { id: '', start: log.activeStart, end: now }
  const includesActive = inProgress !== null && touchesDay(inProgress, start, end)
  const ranges = (includesActive ? [...sessions, inProgress] : sessions)
    .map(record => [Math.max(record.start, start), Math.min(record.end, end)])
    .sort(([first], [second]) => first - second)

  let elapsed = 0
  let countedUntil = start
  for (const [from, to] of ranges) {
    if (to > countedUntil) {
      elapsed += to - Math.max(countedUntil, from)
      countedUntil = to
    }
  }
  return { sessions, includesActive, elapsed }
}

export function lastSevenDays(today: string): string[] {
  return Array.from({ length: 7 }, (_, index) => dateKey(dayBoundary(today, -index)))
}
