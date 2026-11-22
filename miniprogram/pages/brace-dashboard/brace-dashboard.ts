import { chartWear, dailyWear, dateKey, dayBoundary, durationText, MAX_BACKUP_BYTES, MINUTE, parseBackup, PERIOD_OPTIONS, periodStart,
  planOn, recordId, serializeBackup, STATE_LABEL, summarizeWear, validDay, VISIT_TYPES, withPlan,
  type PeriodKey, type WearLog, type WearPlan, type WearVisit } from '../../services/brace-ledger'
import { readWearLog, saveWearLog } from '../../services/brace-wear'
import { wearWorkbook } from '../../services/brace-xlsx'

const PLAN_TYPES = ['有穿戴目标', '仅复查随访', '还未设置目标']
const PLAN_CODES = ['wear', 'followup', 'unset'] as const

Page({
  log: null as WearLog | null,
  data: {
    periods: PERIOD_OPTIONS, period: '30' as PeriodKey, today: '', from: '', to: '',
    mode: '', status: '', day: '', input: '', option: 0, planTypes: PLAN_TYPES, visitTypes: VISIT_TYPES,
    average: '—', periodDays: 0, recorded: 0, below: 0, missing: 0, zero: 0, met: 0,
    phase: '', chart: [] as ReturnType<typeof chartWear>,
    alerts: [] as { day: string; label: string }[], visits: [] as WearVisit[],
    plans: [] as { day: string; label: string }[], dayConfirmed: false, selectedBucket: null as ReturnType<typeof chartWear>[number] | null,
  },
  openVisitOnLoad: false,
  onLoad(query: Record<string, string | undefined>) { this.openVisitOnLoad = query.visit === '1' },
  onShow() {
    try {
      this.log = readWearLog()
      const today = dateKey(Date.now())
      this.setData({ today, to: this.data.to || today, status: '',
        ...(this.openVisitOnLoad ? { mode: 'visit', day: today, input: '', option: 0 } : {}),
      })
      this.openVisitOnLoad = false
      this.updateDashboard()
    } catch { this.setData({ status: '本机档案暂时无法读取。' }) }
  },
  updateDashboard() {
    if (!this.log) return
    const end = this.data.to
    const start = periodStart(this.log, this.data.period, end)
    const days = dailyWear(this.log, start, end)
    const stats = summarizeWear(days)
    const current = planOn(this.log, this.data.today)
    this.setData({
      from: start, periodDays: days.length, ...stats, average: stats.recorded ? durationText(stats.minutes * MINUTE / stats.recorded) : '—',
      chart: stats.recorded ? chartWear(days) : [], selectedBucket: null,
      phase: current?.type === 'followup' ? '仅随访' : current?.minutes ? durationText(current.minutes * MINUTE) : '未设目标',
      alerts: days.filter(row => ['unrecorded', 'below', 'zero'].includes(row.state)).slice(-8).reverse()
        .map(row => ({ day: row.day, label: STATE_LABEL[row.state] })),
      visits: this.log.visits.filter(row => row.day >= start && row.day <= end).sort((a, b) => b.day.localeCompare(a.day)),
      plans: this.log.plans.slice().reverse().map(row => ({ day: row.day,
        label: row.type === 'wear' ? durationText(row.minutes! * MINUTE) : row.type === 'followup' ? '仅随访' : '未设目标' })),
      dayConfirmed: this.log.confirmedZero.includes(this.data.day),
    })
  },
  selectBucket(e: WechatMiniprogram.TouchEvent) {
    const bucket = this.data.chart.find(item => item.key === e.currentTarget.dataset.key)
    if (bucket) this.setData({ selectedBucket: bucket })
  },
  setPeriod(e: WechatMiniprogram.TouchEvent) {
    const period = PERIOD_OPTIONS.find(item => item.key === e.currentTarget.dataset.period)
    if (period) { this.setData({ period: period.key }); this.updateDashboard() }
  },
  setEnd(e: WechatMiniprogram.PickerChange) {
    this.setData({ to: String(e.detail.value) })
    this.updateDashboard()
  },
  openEditor(e: WechatMiniprogram.TouchEvent) {
    if (!this.log) return
    const mode = String(e.currentTarget.dataset.mode)
    this.setData({ mode, day: mode === 'zero' ? dateKey(dayBoundary(this.data.today, -1)) : this.data.today,
      input: '', option: 0, status: '' })
    this.updateDashboard()
  },
  changeDay(e: WechatMiniprogram.PickerChange) { this.setData({ day: String(e.detail.value) }); this.updateDashboard() },
  changeOption(e: WechatMiniprogram.PickerChange) { this.setData({ option: Number(e.detail.value) }) },
  changeInput(e: WechatMiniprogram.Input) { this.setData({ input: e.detail.value }) },
  closeEditor() { this.setData({ mode: '', status: '' }) },
  persist(log: WearLog, status: string) {
    try {
      saveWearLog(log)
      this.log = log
      this.setData({ mode: '', status })
      this.updateDashboard()
    } catch { this.setData({ status: '保存失败，请检查设备剩余空间。' }) }
  },
  saveEditor() {
    const { mode, day, option, input, today } = this.data
    if (!this.log || !validDay(day) || (mode === 'zero' && day >= today)) return
    if (mode === 'plan') {
      const type = PLAN_CODES[option]
      const hours = Number(input)
      const minutes = type === 'wear' ? Math.round(hours * 60) : null
      if (!type || (minutes !== null && (!/^\d+(\.\d{1,2})?$/.test(input) || minutes < 1 || hours > 24))) {
        this.setData({ status: '请输入 0.02 至 24 小时，最多两位小数。' })
        return
      }
      const plan: WearPlan = { day, type, minutes }
      this.persist(withPlan(this.log, plan), '已保存计划。')
    } else if (mode === 'visit') {
      const kind = VISIT_TYPES[option]
      if (!kind) return
      this.persist({ ...this.log, visits: [...this.log.visits, { day, kind, id: recordId(), note: input.trim() }] }, '已保存随访。')
    } else if (mode === 'zero') {
      const existing = this.log.confirmedZero.includes(day)
      if (!existing && dailyWear(this.log, day, day)[0].recordedMinutes !== null) {
        this.setData({ status: '当天已有穿戴时段，请先核对明细。' })
        return
      }
      const confirmedZero = existing ? this.log.confirmedZero.filter(item => item !== day) : [...this.log.confirmedZero, day]
      this.persist({ ...this.log, confirmedZero }, existing ? '已取消此日的未穿确认。' : '已确认此日未穿。')
    }
  },
  removeVisit(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id
    wx.showModal({ title: '删除这条随访？', content: '仅删除选中的随访记录。', confirmText: '删除',
      success: ({ confirm }) => {
        if (confirm && this.log) this.persist({ ...this.log, visits: this.log.visits.filter(row => row.id !== id) }, '已删除随访。')
      } })
  },
  exportFile(e: WechatMiniprogram.TouchEvent) {
    if (!this.log) return
    const xlsx = e.currentTarget.dataset.type === 'xlsx'
    try {
      const fileName = xlsx ? '矫正鞋随访.xlsx' : '矫正鞋档案备份.json'
      const filePath = wx.env.USER_DATA_PATH + '/' + fileName
      const fs = wx.getFileSystemManager()
      if (xlsx) fs.writeFileSync(filePath, wearWorkbook(this.log, this.data.from, this.data.to).buffer as ArrayBuffer)
      else fs.writeFileSync(filePath, serializeBackup(this.log), 'utf8')
      if (wx.shareFileMessage) wx.shareFileMessage({ filePath, fileName, fail: () => this.setData({ status: '分享未完成，可以重新导出。' }) })
      else if (xlsx && wx.openDocument) wx.openDocument({ filePath, fileType: 'xlsx', showMenu: true })
      else this.setData({ status: '当前微信版本无法发送文件。' })
    } catch { this.setData({ status: '文件生成失败，请检查存储空间。' }) }
  },
  importBackup() {
    if (!this.log || !wx.chooseMessageFile) {
      this.setData({ status: '当前版本无法选择备份文件。' })
      return
    }
    wx.chooseMessageFile({ count: 1, type: 'file', extension: ['json'], success: ({ tempFiles }) => {
      try {
        const file = tempFiles[0]
        if (!file || file.size > MAX_BACKUP_BYTES) throw new Error('文件过大')
        const log = parseBackup(wx.getFileSystemManager().readFileSync(file.path, 'utf8'))
        wx.showModal({ title: '用备份恢复档案？', content: `备份包含 ${log.sessions.length} 段穿戴记录。恢复会替换此设备的当前档案。`,
          confirmText: '恢复', success: ({ confirm }) => { if (confirm) this.persist(log, '备份已恢复。') } })
      } catch { this.setData({ status: '请选择本工具导出的有效 JSON 备份。' }) }
    } })
  },
})
