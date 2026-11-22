import { blankWearLog, dateKey, dayWear, durationText, lastSevenDays, parseLocalTime, readWearLog,
  saveWearLog, toggleWearSession, timeKey, type WearLog } from '../../services/brace-wear'

import { dayBoundary, MINUTE, planOn, validDay, withPlan } from '../../services/brace-ledger'

const weekdays = ['日', '一', '二', '三', '四', '五', '六']
type Field = 'startDay' | 'startTime' | 'endDay' | 'endTime'
type TimeForm = Record<Field, string> & { id: string }

function timeForm(start: number, end: number, id = ''): TimeForm {
  return { id, startDay: dateKey(start), startTime: timeKey(start), endDay: dateKey(end), endTime: timeKey(end) }
}

function shortDate(day: string): string {
  return `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`
}

function clockLabel(at: number, day: string): string {
  const date = dateKey(at)
  return date === day ? timeKey(at) : `${shortDate(date)} ${timeKey(at)}`
}

Page({
  log: blankWearLog(),
  ticker: null as ReturnType<typeof setInterval> | null,
  data: {
    ready: false, today: '', todayLabel: '', selectedDay: '', selectedLabel: '', elapsed: '',
    hasToday: false, selectedZero: false, hours: 0, minutes: '00', subMinute: false, active: false, startedAt: '', activeElapsed: '',
    target: '', targetPercent: 0, targetCompletion: 0,
    week: [] as { day: string; weekday: string; date: string; total: string; height: number }[],
    sessions: [] as { id: string; label: string }[], includesActive: false, hasDetails: false, selectedElapsed: '',
    form: null as TimeForm | null, targetOpen: false, targetHours: '', targetMinutes: '', message: '',
  },
  onLoad(query: Record<string, string | undefined>) {
    if (validDay(query.day) && query.day <= dateKey(Date.now())) this.setData({ selectedDay: query.day })
  },
  onShow() {
    try {
      this.log = readWearLog()
      this.setData({ ready: true, message: '' })
      this.renderLog()
      this.stopUpdates()
      this.ticker = setInterval(() => {
        if (this.log.activeStart !== null || this.data.today !== dateKey(Date.now())) this.renderLog()
      }, 15_000)
    } catch {
      this.setData({ ready: false, message: '暂时无法读取本机记录，请退出页面后重试。' })
    }
  },
  onHide() { this.stopUpdates() },
  onUnload() { this.stopUpdates() },
  stopUpdates() {
    if (this.ticker !== null) clearInterval(this.ticker)
    this.ticker = null
  },
  renderLog() {
    const now = Date.now()
    const today = dateKey(now)
    const selectedDay = !this.data.selectedDay || this.data.selectedDay === this.data.today ? today : this.data.selectedDay
    const current = dayWear(this.log, today, now)
    const selected = selectedDay === today ? current : dayWear(this.log, selectedDay, now)
    const { activeStart } = this.log
    const targetMinutes = planOn(this.log, today)?.minutes ?? null
    const targetPercent = targetMinutes === null ? 0 : Math.min(100, current.elapsed / (targetMinutes * MINUTE) * 100)
    const todayMinutes = Math.floor(current.elapsed / MINUTE)
    this.setData({
      today, todayLabel: shortDate(today), selectedDay,
      selectedLabel: selectedDay === today ? '今日' : shortDate(selectedDay),
      hasToday: current.sessions.length > 0 || activeStart !== null,
      selectedZero: this.log.confirmedZero.includes(selectedDay) && !selected.sessions.length && !selected.includesActive,
      elapsed: durationText(current.elapsed), hours: Math.floor(todayMinutes / 60),
      minutes: String(todayMinutes % 60).padStart(2, '0'), subMinute: current.elapsed > 0 && todayMinutes === 0,
      active: activeStart !== null, startedAt: activeStart === null ? '' : clockLabel(activeStart, today),
      activeElapsed: activeStart === null ? '' : durationText(Math.max(0, now - activeStart)),
      target: targetMinutes === null ? '' : durationText(targetMinutes * MINUTE),
      targetPercent, targetCompletion: Math.floor(targetPercent),
      week: lastSevenDays(today).reverse().map(day => {
        const { elapsed, sessions, includesActive } = dayWear(this.log, day, now)
        return { day, weekday: day === today ? '今天' : '周' + weekdays[new Date(dayBoundary(day)).getDay()],
          date: day.slice(5).replace('-', '/'),
          total: sessions.length || includesActive ? durationText(elapsed) : this.log.confirmedZero.includes(day) ? '确认未穿' : '无记录',
          height: Math.min(100, elapsed / (1440 * MINUTE) * 100) }
      }),
      sessions: selected.sessions.map(record => ({ id: record.id,
        label: `${clockLabel(record.start, selectedDay)} — ${clockLabel(record.end, selectedDay)}` })),
      includesActive: selected.includesActive, hasDetails: selected.sessions.length > 0 || selected.includesActive,
      selectedElapsed: durationText(selected.elapsed),
    })
  },
  persist(next: WearLog, message: string): boolean {
    if (!this.data.ready) return false
    try { saveWearLog(next) } catch {
      this.setData({ message: '保存失败，请稍后再试。' })
      return false
    }
    this.log = next
    this.setData({ message })
    this.renderLog()
    return true
  },
  toggleWear() {
    try {
      const next = toggleWearSession(this.log)
      this.persist(next, next.activeStart === null ? '已保存本次穿戴。' : '已开始记录。')
    } catch {
      this.setData({ message: '当前手机时间早于开始穿戴时间，请检查系统时间或使用「补记」修改。' })
    }
  },
  cancelActive() {
    if (this.log.activeStart === null) return
    wx.showModal({
      title: '放弃正在计时的这一段？',
      content: '仅清除当前进行中的计时，不会影响已保存的历史记录。',
      confirmText: '放弃计时',
      success: ({ confirm }) => {
        if (confirm) this.persist({ ...this.log, activeStart: null }, '已取消本次计时。')
      },
    })
  },
  pickPresetTarget(e: WechatMiniprogram.TouchEvent) {
    const hours = String(e.currentTarget.dataset.hours ?? '')
    if (!hours) return
    this.setData({ targetHours: hours, targetMinutes: '0', message: '' })
  },
  chooseDay(e: WechatMiniprogram.TouchEvent) {
    this.setData({ selectedDay: String(e.currentTarget.dataset.day), form: null, targetOpen: false, message: '' })
    this.renderLog()
  },
  pickDay(e: WechatMiniprogram.PickerChange) {
    this.setData({ selectedDay: String(e.detail.value), form: null, targetOpen: false, message: '' })
    this.renderLog()
  },
  addSession() {
    this.openSessionForm(this.data.selectedDay)
  },
  openSessionForm(day: string) {
    this.setData({ form: { id: '', startDay: day, startTime: '', endDay: day, endTime: '' }, targetOpen: false, message: '' })
  },
  editSession(e: WechatMiniprogram.TouchEvent) {
    const record = this.log.sessions.find(item => item.id === e.currentTarget.dataset.id)
    if (record) this.setData({ form: timeForm(record.start, record.end, record.id), targetOpen: false, message: '' })
  },
  changeTime(e: WechatMiniprogram.PickerChange & WechatMiniprogram.TouchEvent) {
    const form = this.data.form
    const field = e.currentTarget.dataset.field as Field
    if (!form || !['startDay', 'startTime', 'endDay', 'endTime'].includes(field)) return
    const next = { ...form, [field]: String(e.detail.value) }
    if (field === 'startDay' && next.endDay < next.startDay) next.endDay = next.startDay
    this.setData({ form: next })
  },
  closeForm() { this.setData({ form: null, message: '' }) },
  saveSession() {
    const form = this.data.form
    if (!form) return
    const start = parseLocalTime(form.startDay, form.startTime)
    const end = parseLocalTime(form.endDay, form.endTime)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > Date.now()) {
      this.setData({ message: '请选择完整时间。结束时间须晚于开始时间，且不能在将来。' })
      return
    }
    const sessions = this.log.sessions.filter(item => item.id !== form.id)
    sessions.push({ id: form.id || newId(), start, end })
    if (this.persist({ ...this.log, sessions, confirmedZero: this.log.confirmedZero.filter(day =>
      start >= dayBoundary(day, 1) || end <= dayBoundary(day)) }, '已保存这段穿戴时间。')) this.setData({ form: null })
  },
  removeSession(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id
    wx.showModal({ title: '删除这段穿戴时间？', content: '删除后会重新计算当天累计。', confirmText: '删除',
      success: ({ confirm }) => {
        if (!confirm) return
        const sessions = this.log.sessions.filter(item => item.id !== id)
        if (this.persist({ ...this.log, sessions }, '已删除这段穿戴时间。')) this.setData({ form: null })
      } })
  },
  openTarget() {
    const minutes = planOn(this.log, this.data.today)?.minutes ?? null
    this.setData({ targetOpen: true, form: null, targetHours: minutes === null ? '' : String(Math.floor(minutes / 60)),
      targetMinutes: minutes === null ? '' : String(minutes % 60), message: '' })
  },
  changeHours(e: WechatMiniprogram.Input) { this.setData({ targetHours: e.detail.value }) },
  changeMinutes(e: WechatMiniprogram.Input) { this.setData({ targetMinutes: e.detail.value }) },
  closeTarget() { this.setData({ targetOpen: false, message: '' }) },
  saveTarget() {
    const { targetHours, targetMinutes } = this.data
    const hours = Number(targetHours)
    const minutes = Number(targetMinutes)
    const total = hours * 60 + minutes
    if (!/^\d{0,2}$/.test(targetHours) || !/^\d{0,2}$/.test(targetMinutes) || minutes > 59 || total < 1 || total > 1440) {
      this.setData({ message: '请填写 1 分钟至 24 小时，分钟栏最多填 59。' })
      return
    }
    if (this.persist(withPlan(this.log, { day: this.data.today, type: 'wear', minutes: total }), '已更新每日目标。')) this.setData({ targetOpen: false })
  },
  clearTarget() {
    if (this.persist(withPlan(this.log, { day: this.data.today, type: 'unset', minutes: null }), '已清除每日目标。')) this.setData({ targetOpen: false })
  },
})

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
