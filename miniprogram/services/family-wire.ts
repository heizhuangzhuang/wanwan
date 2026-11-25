import { parseBackup, type WearLog } from './brace-ledger'

export interface FamilySession { account: string; channel: string; expiresAt: string }
export interface FamilyCastEntry {
  id: string
  castDate: string
  care: string
  side: string | null
  sequence: number | null
  visitAt: string | null
}
export interface FamilyBrace {
  revision: string | null
  consentVersion: string
  consented: boolean
  archive: string | null
}
export interface TimerCommand {
  action: 'start' | 'stop'
  timerId: string
  operationId: string
  at: number
}
export interface PendingTimer {
  revision: string | null
  commands: TimerCommand[]
}
export interface FamilyWear extends WearLog { activeId?: string }

export function familyWear(archive: string | null): FamilyWear {
  if (!archive) return { sessions: [], activeStart: null, plans: [], confirmedZero: [], visits: [] }
  const wear = parseBackup(archive)
  const activeId = JSON.parse(archive).log.activeId
  return { ...wear, activeId: wear.activeStart === null ? undefined : activeId || `legacy-${wear.activeStart}` }
}

export function projectTimer(wear: FamilyWear, pending: TimerCommand[]): FamilyWear {
  let next = wear
  for (const command of pending) {
    if (command.action === 'start') {
      if (next.activeStart !== null) throw new Error('已有进行中的计时')
      next = { ...next, activeStart: command.at, activeId: command.timerId }
    } else {
      if (next.activeId !== command.timerId || next.activeStart === null || command.at <= next.activeStart) {
        throw new Error('请核对这段计时和手机时间')
      }
      next = { ...next, sessions: [...next.sessions, { id: command.timerId, start: next.activeStart, end: command.at }],
        activeStart: null, activeId: undefined }
    }
  }
  return next
}

export function familyId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2)
}

export function beijingTime(instant: string | number) {
  return new Date(new Date(instant).getTime() + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ')
}

export function bracedToday(wear: FamilyWear, now = Date.now()) {
  const today = beijingTime(now).slice(0, 10)
  const start = Date.parse(today + 'T00:00:00+08:00')
  const end = start + 86400000
  const ranges = wear.sessions.map(row => [Math.max(start, row.start), Math.min(end, row.end)])
  if (wear.activeStart !== null) ranges.push([Math.max(start, wear.activeStart), now])
  ranges.sort(([a], [b]) => a - b)
  let elapsed = 0
  let counted = start
  for (const [from, to] of ranges) {
    if (to > Math.max(from, counted)) {
      elapsed += to - Math.max(from, counted)
      counted = to
    }
  }
  return Math.floor(elapsed / 60000)
}
