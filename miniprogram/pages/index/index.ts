import type { IAppOption } from '../../app'
import { wanwanApi, type StageView } from '../../services/api'
import { fixedStages, stageIntro } from '../../services/stages'
import { selectTab } from '../../services/tabs'

import { dateKey, durationText, planOn } from '../../services/brace-ledger'
import { dayWear, readWearLog, saveWearLog, toggleWearSession } from '../../services/brace-wear'
import { castCommand, castConfig, chinaDateTime } from '../../services/cast-journal'

const PREFERENCE = 'wanwan-home-stage'
const phases = ['按阶段查找', '产前准备', '石膏治疗', '支具穿戴', '长期随访']

const stageIcons = new Map([
  ['JUST_FOUND', { name: 'scan-line', tone: 'peach' }],
  ['PRENATAL', { name: 'clipboard-list', tone: 'rose' }],
  ['POSTNATAL_TREATMENT', { name: 'footprints', tone: 'sage' }],
  ['BRACE_DAILY', { name: 'ruler', tone: 'blue' }],
  ['LONG_TERM', { name: 'calendar-days', tone: 'gold' }],
])

function homeStages(stages: StageView[]) {
  return stages.map(stage => ({
    ...stage,
    icon: stageIcons.get(stage.key) ?? { name: 'book-open', tone: 'sage' },
    intro: stageIntro(stage.key),
    url: `/pages/stage/stage?key=${encodeURIComponent(stage.key)}&label=${encodeURIComponent(stage.label)}`,
  }))
}

Page({
  data: {
    stages: homeStages(fixedStages),
    loading: false, error: '', demoMode: false, phases, phase: 0,
    active: false, wearTime: '', wearGoal: '', castVisit: '', castCare: '', actionError: '',
  },
  onLoad() {
    this.setData({ demoMode: getApp<IAppOption>().globalData.demoMode })
    return this.loadHome()
  },
  onShow() {
    selectTab(this, 'pages/index/index')
    this.refreshToday()
  },
  choosePhase(e: WechatMiniprogram.PickerChange) {
    const phase = Number(e.detail.value)
    if (!phases[phase]) return
    wx.setStorageSync(PREFERENCE, phase)
    this.refreshToday()
  },
  refreshToday() {
    try {
      const now = Date.now()
      const day = dateKey(now)
      const log = readWearLog()
      const plan = planOn(log, day)
      const stored = wx.getStorageSync(PREFERENCE)
      const inferred = plan?.type === 'followup' ? 4 : plan?.type === 'wear' || log.sessions.length ? 3 : 0
      const preferred = typeof stored === 'number' && phases[stored] ? stored : inferred
      const phase = log.activeStart !== null ? 3 : preferred === 3 && inferred === 4 ? 4 : preferred
      const wear = dayWear(log, day, now)
      this.setData({ phase, active: log.activeStart !== null,
        wearTime: wear.sessions.length || wear.includesActive ? durationText(wear.elapsed) : '今天还没记录',
        wearGoal: plan?.minutes ? durationText(plan.minutes * 60_000) : '', castVisit: '', castCare: '' })
      if (phase === 2) void this.loadCastPreview()
    } catch {
      this.setData({ actionError: '暂时无法读取本机穿戴档案。' })
    }
  },
  async loadCastPreview() {
    try {
      if (!(await castConfig()).enabled || this.data.phase !== 2) return
      const journal = await castCommand('read')
      if (this.data.phase !== 2 || !journal.consented) return
      const next = journal.entries.filter(row => row.visitAt && Date.parse(row.visitAt) > Date.now())
        .sort((a, b) => Date.parse(a.visitAt!) - Date.parse(b.visitAt!))[0]
      this.setData({ castVisit: next?.visitAt ? chinaDateTime(next.visitAt).replace('T', ' ') : '',
        castCare: journal.entries[0]?.care ?? '' })
    } catch {
      // The entry remains available while the cloud journal is unreachable.
    }
  },
  toggleWear() {
    try {
      saveWearLog(toggleWearSession(readWearLog()))
      this.setData({ actionError: '' })
      this.refreshToday()
    } catch {
      this.setData({ actionError: '计时状态未能保存，请打开穿戴记录核对。' })
    }
  },
  onPullDownRefresh() {
    void this.loadHome().finally(() => wx.stopPullDownRefresh())
  },
  async loadHome() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const stages = await wanwanApi.getStages()
      this.setData({ stages: homeStages(stages.length ? stages : fixedStages) })
    } catch {
      this.setData({ stages: homeStages(fixedStages), error: '阶段资料暂时无法同步，仍可打开各阶段指南。' })
    } finally {
      this.setData({ loading: false })
    }
  },
})
