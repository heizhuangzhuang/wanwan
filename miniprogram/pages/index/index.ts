import type { IAppOption } from '../../app'
import { wanwanApi, type StageView } from '../../services/api'
import { fixedStages, stageIntro } from '../../services/stages'
import { selectTab } from '../../services/tabs'

import { dateKey, durationText, planOn } from '../../services/brace-ledger'
import { dayWear, readWearLog, saveWearLog, toggleWearSession } from '../../services/brace-wear'
import { castCommand, castConfig, chinaDateTime } from '../../services/cast-journal'

const PREFERENCE = 'wanwan-home-stage'
const phases = ['按阶段查找', '刚发现', '产前准备', '石膏治疗', '支具穿戴', '长期随访']

interface QuickTile {
  title: string
  sub: string
  url: string
  icon: string
  tone: string
  openType?: 'switchTab' | 'navigate'
}

const phaseWelcomeCopy: Record<number, string> = {
  0: '按宝宝当前阶段聚焦展示内容，每一步都有重点可看。',
  1: '先定心了解基本事实与复查清单，不用提前焦虑后面的步骤。',
  2: '重点核对产前检查与遗传咨询，提前规划出生后的就诊路径。',
  3: '聚焦石膏周期、皮肤血运观察与复诊提醒，按周稳步推进。',
  4: '每天记录矫正鞋穿戴时长与补记，守住防复发的关键阶段。',
  5: '定期核对穿戴趋势与步态复查，生成复诊摘要方便和医生沟通。',
}

const phaseQuickTiles: Record<number, QuickTile[]> = {
  0: [
    { title: '刚发现先看这里', sub: '全景综述与定心指南', url: '/pages/stage/stage?key=JUST_FOUND&label=%E5%88%9A%E5%8F%91%E7%8E%B0', icon: 'scan-line', tone: 'peach' },
    { title: '产前检查专项', sub: '羊穿 / CMA / WES', url: '/pages/prenatal/prenatal', icon: 'scan-heart', tone: 'rose' },
    { title: '矫正鞋穿戴计时', sub: '每天累计与补记', url: '/pages/brace-wear/brace-wear', icon: 'footprints', tone: 'blue' },
    { title: '全部资料库', sub: '导读 · 专题 · 资料卡', url: '/pages/library/library', icon: 'book-open', tone: 'gold', openType: 'switchTab' },
  ],
  1: [
    { title: '超声复查清单', sub: '下载打印，复查照着问', url: '/pages/downloads/downloads', icon: 'file-down', tone: 'gold' },
    { title: '产前检查专项', sub: '羊穿 / CMA / WES 解读', url: '/pages/prenatal/prenatal', icon: 'scan-heart', tone: 'rose' },
    { title: '问医生问题清单', sub: '勾选带去产科/超声科', url: '/pages/preparation/preparation?stage=JUST_FOUND', icon: 'clipboard-list', tone: 'sage' },
    { title: '本阶段原创导读', sub: '先看白话长文定心', url: '/pages/topics/topics?kind=guide&stage=JUST_FOUND', icon: 'book-open', tone: 'blue' },
  ],
  2: [
    { title: '产前检查专项', sub: '羊穿 / CMA / WES 指南', url: '/pages/prenatal/prenatal', icon: 'scan-heart', tone: 'rose' },
    { title: '找产前与小儿骨科', sub: '门诊渠道与搜索词', url: '/pages/channels/channels?type=doctor&period=prenatal', icon: 'stethoscope', tone: 'blue' },
    { title: '产前问医生清单', sub: '遗传咨询与出生后规划', url: '/pages/preparation/preparation?stage=PRENATAL', icon: 'clipboard-list', tone: 'sage' },
    { title: '超声复查清单', sub: '历次超声对比记录', url: '/pages/downloads/downloads', icon: 'file-down', tone: 'gold' },
  ],
  3: [
    { title: '石膏与复诊提醒', sub: '记录次数与微信提醒', url: '/pages/cast/cast', icon: 'calendar-clock', tone: 'sage' },
    { title: '治疗期问医生清单', sub: '石膏护理与血运观察', url: '/pages/preparation/preparation?stage=POSTNATAL_TREATMENT', icon: 'clipboard-list', tone: 'peach' },
    { title: '找小儿骨科门诊', sub: '复诊与专业医院参考', url: '/pages/channels/channels?type=doctor&period=postnatal', icon: 'stethoscope', tone: 'blue' },
    { title: '治疗期原创导读', sub: 'Ponseti 流程与护理', url: '/pages/topics/topics?kind=guide&stage=POSTNATAL_TREATMENT', icon: 'book-open', tone: 'gold' },
  ],
  4: [
    { title: '矫正鞋穿戴计时', sub: '跨夜/午睡累计与补记', url: '/pages/brace-wear/brace-wear', icon: 'footprints', tone: 'blue' },
    { title: '穿戴趋势与复诊', sub: '看达标率与历史计划', url: '/pages/brace-dashboard/brace-dashboard', icon: 'calendar-days', tone: 'sage' },
    { title: '支具期问医生清单', sub: '磨脚红肿与换码沟通', url: '/pages/preparation/preparation?stage=BRACE_DAILY', icon: 'clipboard-list', tone: 'gold' },
    { title: '家长经验与科普', sub: '穿鞋技巧与真实经验', url: '/pages/channels/channels?type=social', icon: 'messages-square', tone: 'rose' },
  ],
  5: [
    { title: '生成复诊摘要', sub: '整理穿戴与观察给医生', url: '/pages/followup/followup', icon: 'clipboard-list', tone: 'sage' },
    { title: '穿戴趋势与档案', sub: '多年趋势与备份导出', url: '/pages/brace-dashboard/brace-dashboard', icon: 'calendar-days', tone: 'blue' },
    { title: '随访期问题清单', sub: '步态鞋型与复发信号', url: '/pages/preparation/preparation?stage=LONG_TERM', icon: 'stethoscope', tone: 'peach' },
    { title: '全部资料库', sub: '导读 · 专题 · 资料卡', url: '/pages/library/library', icon: 'book-open', tone: 'gold', openType: 'switchTab' },
  ],
}

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
    quickTiles: phaseQuickTiles[0],
    welcomeCopy: phaseWelcomeCopy[0],
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
  selectPhase(e: WechatMiniprogram.TouchEvent) {
    const phase = Number(e.currentTarget.dataset.phase)
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
      const inferred = plan?.type === 'followup' ? 5 : plan?.type === 'wear' || log.sessions.length ? 4 : 0
      const preferred = typeof stored === 'number' && phases[stored] ? stored : inferred
      const phase = log.activeStart !== null ? 4 : preferred === 4 && inferred === 5 ? 5 : preferred
      const wear = dayWear(log, day, now)
      this.setData({
        phase,
        quickTiles: phaseQuickTiles[phase] ?? phaseQuickTiles[0],
        welcomeCopy: phaseWelcomeCopy[phase] ?? phaseWelcomeCopy[0],
        active: log.activeStart !== null,
        wearTime: wear.sessions.length || wear.includesActive ? durationText(wear.elapsed) : '今天还没记录',
        wearGoal: plan?.minutes ? durationText(plan.minutes * 60_000) : '', castVisit: '', castCare: '',
      })
      if (phase === 3) void this.loadCastPreview()
    } catch {
      this.setData({ actionError: '暂时无法读取本机穿戴档案。' })
    }
  },
  async loadCastPreview() {
    try {
      if (!(await castConfig()).enabled || this.data.phase !== 3) return
      const journal = await castCommand('read')
      if (this.data.phase !== 3 || !journal.consented) return
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
