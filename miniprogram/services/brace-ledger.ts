export const MINUTE = 60_000
export const MAX_BACKUP_BYTES = 24 * 1024 * 1024

export interface WearSession { id: string; start: number; end: number }
export interface WearPlan { day: string; type: 'wear' | 'followup' | 'unset'; minutes: number | null }
export interface WearVisit { id: string; day: string; kind: '复诊' | '调整支具' | '随访'; note: string }
export interface WearLog {
  sessions: WearSession[]
  activeStart: number | null
  plans: WearPlan[]
  confirmedZero: string[]
  visits: WearVisit[]
}

export const blankWearLog = (): WearLog => ({ sessions: [], activeStart: null, plans: [], confirmedZero: [], visits: [] })
const pad = (value: number) => String(value).padStart(2, '0')

export function dateKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function timeKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function dayBoundary(day: string, offset = 0): number {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date + offset).getTime()
}

export function validDay(day: unknown): day is string {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= '1900-01-01' && dateKey(dayBoundary(day)) === day
}

export function parseLocalTime(day: string, time: string): number {
  if (!validDay(day) || !/^\d{2}:\d{2}$/.test(time)) return NaN
  const [hour, minute] = time.split(':').map(Number)
  const value = new Date(dayBoundary(day))
  value.setHours(hour, minute, 0, 0)
  return dateKey(value.getTime()) === day && timeKey(value.getTime()) === time ? value.getTime() : NaN
}

export function durationText(elapsed: number): string {
  if (elapsed > 0 && elapsed < MINUTE) return '不足 1 分钟'
  const minutes = Math.floor(elapsed / MINUTE)
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份内容无效')
  return value as Record<string, unknown>
}

function rows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('备份缺少记录列表')
  return value
}

function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && Number.isFinite(new Date(value).getTime())
}

function goalMinutes(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1440
}

function identity(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(value)) throw new Error('记录编号无效')
  return value
}

export function normalizeWearLog(value: unknown, today = dateKey(Date.now())): WearLog {
  const input = record(value)
  const sessions = rows(input.sessions).map(value => {
    const row = record(value)
    if (!timestamp(row.start) || !timestamp(row.end) || row.end <= row.start) throw new Error('穿戴时段无效')
    return { id: identity(row.id), start: row.start, end: row.end }
  })
  const activeStart = input.activeStart
  if (activeStart !== null && !timestamp(activeStart)) throw new Error('计时状态无效')
  const plans: WearPlan[] = rows(input.plans ?? []).map(value => {
    const row = record(value)
    if (!validDay(row.day)) throw new Error('目标生效日期无效')
    if (row.type === 'wear' && goalMinutes(row.minutes)) return { day: row.day, type: row.type, minutes: row.minutes }
    if ((row.type === 'followup' || row.type === 'unset') && row.minutes === null) return { day: row.day, type: row.type, minutes: null }
    throw new Error('穿戴计划无效')
  })
  if (input.plans === undefined && goalMinutes(input.targetMinutes)) {
    plans.push({ day: today, type: 'wear', minutes: input.targetMinutes })
  }
  const confirmedZero = rows(input.confirmedZero ?? []).map(value => {
    if (!validDay(value)) throw new Error('未穿确认日期无效')
    return value
  })
  const visits: WearVisit[] = rows(input.visits ?? []).map(value => {
    const row = record(value)
    if (!validDay(row.day) || (row.kind !== '复诊' && row.kind !== '调整支具' && row.kind !== '随访') ||
      typeof row.note !== 'string' || row.note.length > 200) throw new Error('随访记录无效')
    return { id: identity(row.id), day: row.day, kind: row.kind, note: row.note }
  })
  if (new Set(sessions.map(row => row.id)).size !== sessions.length
    || new Set(plans.map(row => row.day)).size !== plans.length
    || new Set(visits.map(row => row.id)).size !== visits.length) throw new Error('备份中存在重复记录')
  plans.sort((a, b) => a.day.localeCompare(b.day))
  return { sessions, activeStart, plans, confirmedZero: [...new Set(confirmedZero)], visits }
}

export function serializeBackup(log: WearLog): string {
  return JSON.stringify({ format: 'wanwan-brace-ledger', version: 1, log })
}

export function parseBackup(value: string): WearLog {
  const data = record(JSON.parse(value))
  if (data.format !== 'wanwan-brace-ledger' || data.version !== 1) throw new Error('请选择本工具导出的备份文件')
  return normalizeWearLog(data.log)
}

export const recordId = (): string => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)

export function planOn(log: WearLog, day: string) {
  for (let i = log.plans.length - 1; i >= 0; i--) if (log.plans[i].day <= day) return log.plans[i]
}

export function withPlan(log: WearLog, plan: WearPlan): WearLog {
  return { ...log, plans: [...log.plans.filter(row => row.day !== plan.day), plan].sort((a, b) => a.day.localeCompare(b.day)) }
}

export const VISIT_TYPES = ['复诊', '调整支具', '随访'] as const
export const PERIOD_OPTIONS = [
  { key: '7', label: '7 天' }, { key: '30', label: '30 天' }, { key: '90', label: '90 天' },
  { key: '1y', label: '1 年' }, { key: '10y', label: '10 年' }, { key: 'all', label: '全部' },
] as const
export type PeriodKey = typeof PERIOD_OPTIONS[number]['key']
export type DayState = 'today' | 'unrecorded' | 'no-target' | 'followup' | 'zero' | 'below' | 'met'
export const STATE_LABEL: Record<DayState, string> = {
  today: '今日进行中', unrecorded: '计划日无记录', 'no-target': '未设目标',
  followup: '仅随访', zero: '确认未穿', below: '记录低于目标', met: '记录达到目标',
}

export function periodStart(log: WearLog, period: PeriodKey, today: string): string {
  if (period === '7' || period === '30' || period === '90') return dateKey(dayBoundary(today, 1 - Number(period)))
  if (period === '1y' || period === '10y') {
    const [year, month, day] = today.split('-').map(Number)
    const startYear = year - (period === '1y' ? 1 : 10)
    const safeDay = Math.min(day, new Date(startYear, month, 0).getDate())
    return dateKey(new Date(startYear, month - 1, safeDay + 1).getTime())
  }
  let first = today
  const include = (day: string) => { if (day < first) first = day }
  log.sessions.forEach(session => include(dateKey(session.start)))
  log.plans.forEach(plan => include(plan.day))
  log.confirmedZero.forEach(include)
  log.visits.forEach(visit => include(visit.day))
  if (log.activeStart !== null) include(dateKey(log.activeStart))
  return first
}

export interface DailyWear {
  day: string
  recordedMinutes: number | null
  targetMinutes: number | null
  state: DayState
}

export function dailyWear(log: WearLog, start: string, end: string, now = Date.now()): DailyWear[] {
  if (!validDay(start) || !validDay(end) || start > end || end > dateKey(now)) throw new Error('统计日期无效')
  const from = dayBoundary(start)
  const until = Math.min(now, dayBoundary(end, 1))
  const raw = log.sessions.map(row => ({ start: row.start, end: row.end }))
  if (log.activeStart !== null) raw.push({ start: log.activeStart, end: now })
  const merged: { start: number; end: number }[] = []
  for (const row of raw.filter(row => row.start < until && row.end > from).sort((a, b) => a.start - b.start)) {
    const first = Math.max(row.start, from)
    const last = Math.min(row.end, until)
    if (last <= first) continue
    const previous = merged[merged.length - 1]
    if (previous && previous.end >= first) previous.end = Math.max(previous.end, last)
    else merged.push({ start: first, end: last })
  }
  const confirmed = new Set(log.confirmedZero)
  const currentDay = dateKey(now)
  const result: DailyWear[] = []
  let session = 0
  let plan = -1
  for (let first = from, day = start; day <= end; day = dateKey(first)) {
    const last = dayBoundary(day, 1)
    let elapsed = 0
    while (session < merged.length && merged[session].start < last) {
      const row = merged[session]
      elapsed += Math.min(row.end, last) - Math.max(row.start, first)
      if (row.end > last) break
      session++
    }
    while (plan + 1 < log.plans.length && log.plans[plan + 1].day <= day) plan++
    const activePlan = log.plans[plan]
    const targetMinutes = activePlan?.type === 'wear' ? activePlan.minutes : null
    const explicitZero = !elapsed && confirmed.has(day)
    const recordedMinutes = elapsed ? Math.floor(elapsed / MINUTE) : explicitZero ? 0 : null
    let state: DayState = 'no-target'
    if (day === currentDay) state = 'today'
    else if (activePlan?.type === 'followup') state = 'followup'
    else if (explicitZero) state = 'zero'
    else if (targetMinutes !== null) {
      if (recordedMinutes === null) state = 'unrecorded'
      else state = recordedMinutes < targetMinutes ? 'below' : 'met'
    }
    result.push({ day, recordedMinutes, targetMinutes, state })
    first = last
  }
  return result
}

export function summarizeWear(days: DailyWear[]) {
  let recorded = 0, minutes = 0, below = 0, missing = 0, zero = 0, met = 0
  for (const row of days) {
    if (row.recordedMinutes !== null) {
      recorded++
      minutes += row.recordedMinutes
    }
    if (row.state === 'below') below++
    if (row.state === 'unrecorded') missing++
    if (row.state === 'zero') zero++
    if (row.state === 'met') met++
  }
  return { recorded, minutes, below, missing, zero, met }
}

export function chartWear(source: DailyWear[]) {
  const buckets = new Map<string, DailyWear[]>()
  source.forEach((row, index) => {
    const batch = source[Math.floor(index / 5) * 5]
    const key = source.length <= 7 ? row.day : source.length <= 31 ? batch.day :
      source.length <= 367 ? row.day.slice(0, 7) : row.day.slice(0, 4)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(row)
    else buckets.set(key, [row])
  })
  return Array.from(buckets, ([key, rows]) => {
    const stat = summarizeWear(rows)
    const avg = stat.recorded ? Math.floor(stat.minutes / stat.recorded) : null
    return { key, start: rows[0].day, end: rows[rows.length - 1].day,
      label: key.length > 7 ? key.slice(5).replace('-', '.') : key.length === 7 ? key.replace('-', '.') : key,
      average: avg === null ? '无记录' : durationText(avg * MINUTE),
      height: avg === null ? 0 : Math.min(100, avg / 1440 * 100), ...stat }
  })
}
