import { dateKey, OBSERVATION_SIDES, OBSERVATION_TYPES, recordId, validDay, type WearObservation } from '../../services/brace-ledger'
import { readWearLog, saveWearLog } from '../../services/brace-wear'
import { followupSummary, treatmentTimeline } from '../../services/followup-summary'
import { castCommand, castConfig, type CastEntry } from '../../services/cast-journal'

function newObservation(day: string) {
  return { id: '', day, kind: 0, side: 0, contacted: false, outcome: '' }
}

Page({
  cast: [] as CastEntry[],
  allTimeline: [] as ReturnType<typeof treatmentTimeline>,
  data: {
    today: '', summary: null as ReturnType<typeof followupSummary> | null,
    observations: [] as WearObservation[], timeline: [] as ReturnType<typeof treatmentTimeline>,
    questions: ['', '', ''], savedQuestions: [] as string[], editingQuestions: false, editor: null as ReturnType<typeof newObservation> | null,
    types: OBSERVATION_TYPES, sides: OBSERVATION_SIDES, castStatus: '', message: '',
    timelineLimit: 12, timelineTotal: 0,
  },
  onLoad(query: Record<string, string | undefined>) {
    if (query.observe === '1') {
      const today = dateKey(Date.now())
      const day = validDay(query.day) && query.day <= today ? query.day : today
      this.setData({ editor: newObservation(day) })
    }
  },
  onShow() { this.refresh(); void this.loadCast() },
  refresh(resetQuestions = true) {
    try {
      const log = readWearLog()
      const today = dateKey(Date.now())
      this.allTimeline = treatmentTimeline(log, this.cast)
      this.setData({ today, summary: followupSummary(log, today),
        timeline: this.allTimeline.slice(0, this.data.timelineLimit), timelineTotal: this.allTimeline.length,
        savedQuestions: (log.questions ?? []).filter(Boolean),
        observations: [...(log.observations ?? [])].sort((a, b) => b.day.localeCompare(a.day)),
        ...(resetQuestions ? { questions: Array.from({ length: 3 }, (_, index) => log.questions?.[index] ?? '') } : {}),
      })
    } catch { this.setData({ message: '暂时无法读取本机档案。' }) }
  },
  async loadCast() {
    this.cast = []
    this.setData({ castStatus: '正在读取石膏记录…' })
    try {
      const config = await castConfig()
      if (!config.enabled) { this.setData({ castStatus: '石膏云端记录暂未开放。' }); return }
      const journal = await castCommand('read')
      this.cast = journal.consented ? journal.entries : []
      this.setData({ castStatus: journal.consented ? '' : '可在石膏记录页授权后查看石膏时间线。' })
    } catch { this.setData({ castStatus: '石膏记录暂未加载，可稍后重试。' }) }
    finally { this.refresh(false) }
  },
  moreTimeline() {
    const timelineLimit = this.data.timelineLimit + 12
    this.setData({ timelineLimit, timeline: this.allTimeline.slice(0, timelineLimit) })
  },
  toggleQuestions() {
    this.setData({ editingQuestions: !this.data.editingQuestions })
    if (!this.data.editingQuestions) this.refresh()
  },
  changeQuestion(e: WechatMiniprogram.Input & WechatMiniprogram.TouchEvent) {
    const questions = this.data.questions.slice()
    questions[Number(e.currentTarget.dataset.index)] = e.detail.value
    this.setData({ questions })
  },
  saveQuestions() {
    try {
      saveWearLog({ ...readWearLog(), questions: this.data.questions.map(value => value.trim()) })
      this.setData({ editingQuestions: false, message: '复诊问题已保存。' })
      this.refresh()
    } catch { this.setData({ message: '复诊问题未保存，请重试。' }) }
  },
  copySummary() {
    const s = this.data.summary
    if (!s) return
    const text = [
      `复诊摘要 ${s.from} 至 ${s.today}`,
      `记录覆盖 ${s.recorded}/${s.total} 天 · 有记录日均值 ${s.average}`,
      `未记录 ${s.unknown} 天 · 低于目标 ${s.below} 天 · 确认未穿 ${s.zero} 天（低于目标及未穿仅统计已结束日期）`,
      `期初目标 ${s.initialPlan}`, ...s.plans.map(plan => `${plan.day} ${plan.label}`),
      `最近一次支具调整 ${s.adjustment}`, ...this.data.savedQuestions.map(q => '想问医生 ' + q),
    ]
    wx.setClipboardData({ data: text.join('\n') })
  },
  addObservation() {
    this.setData({ editor: newObservation(this.data.today), message: '' })
    wx.pageScrollTo?.({ scrollTop: 0, duration: 0 })
  },
  editObservation(e: WechatMiniprogram.TouchEvent) {
    const row = this.data.observations.find(item => item.id === e.currentTarget.dataset.id)
    if (!row) return
    this.setData({ editor: { ...row, kind: OBSERVATION_TYPES.indexOf(row.kind), side: OBSERVATION_SIDES.indexOf(row.side) }, message: '' })
    wx.pageScrollTo?.({ scrollTop: 0, duration: 0 })
  },
  closeObservation() { this.setData({ editor: null, message: '' }) },
  changeObservation(e: WechatMiniprogram.TouchEvent & WechatMiniprogram.Input) {
    const editor = this.data.editor
    if (!editor) return
    const field = String(e.currentTarget.dataset.field)
    const value = e.detail.value
    if (field === 'day' || field === 'outcome') this.setData({ editor: { ...editor, [field]: value } })
    if (field === 'kind' || field === 'side') this.setData({ editor: { ...editor, [field]: Number(value) } })
  },
  toggleContacted() {
    if (this.data.editor) this.setData({ editor: { ...this.data.editor, contacted: !this.data.editor.contacted } })
  },
  saveObservation() {
    const draft = this.data.editor
    if (!draft || !validDay(draft.day) || draft.day > this.data.today || !OBSERVATION_TYPES[draft.kind] || !OBSERVATION_SIDES[draft.side]) return
    const row: WearObservation = { ...draft, id: draft.id || recordId(), kind: OBSERVATION_TYPES[draft.kind],
      side: OBSERVATION_SIDES[draft.side], outcome: draft.outcome.trim().slice(0, 200) }
    try {
      const log = readWearLog()
      saveWearLog({ ...log, observations: [...(log.observations ?? []).filter(item => item.id !== row.id), row] })
      this.setData({ editor: null, message: '已保存穿戴困难。' })
      this.refresh(false)
    } catch { this.setData({ message: '保存失败，请重试。' }) }
  },
  removeObservation() {
    const id = this.data.editor?.id
    if (!id) return
    wx.showModal({ title: '删除这条穿戴困难？', content: '删除后将从治疗时间线中移除。', confirmText: '删除',
      success: ({ confirm }) => {
        if (!confirm) return
        try {
          const log = readWearLog()
          saveWearLog({ ...log, observations: (log.observations ?? []).filter(item => item.id !== id) })
          this.setData({ editor: null, message: '记录已删除。' })
          this.refresh(false)
        } catch { this.setData({ message: '删除失败，请重试。' }) }
      } })
  },
})
