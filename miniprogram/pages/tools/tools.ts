import { selectTab } from '../../services/tabs'
import { doctorChannelsUrl, socialChannelsUrl } from '../../services/family-guide'
import { homePhase, phases } from '../../services/home-stage'
import { readWearLog } from '../../services/brace-wear'

const groups = [
  { key: 'prenatal', title: '就诊准备', items: [
    { title: '产前检查专项', caption: '结构超声、羊水穿刺、CMA 与全外显子测序解读', icon: 'scan-heart', tone: 'rose', url: '/pages/prenatal/prenatal' },
    { title: '就诊沟通清单', caption: '勾选想问的问题，复制到备忘录', icon: 'clipboard-list', tone: 'sage', url: '/pages/preparation/preparation' },
    { title: '足内翻超声复查清单', caption: '下载并打印一页 PDF', icon: 'file-down', tone: 'gold', url: '/pages/downloads/downloads' },
  ] },
  { key: 'cast', title: '石膏与复诊', items: [
    { title: '石膏记录与复诊提醒', caption: '记下石膏日期、医院交代和下次复诊', icon: 'calendar-clock', tone: 'gold', url: '/pages/cast/cast' },
  ] },
  { key: 'brace', title: '支具与随访', items: [
    { title: '矫正鞋云端计时', caption: '用微信登录，电脑和手机连续计时', icon: 'footprints', tone: 'sage', url: '/pages/family/family' },
    { title: '穿戴趋势与复诊', caption: '查看每日记录、历史计划与复诊安排', icon: 'calendar-days', tone: 'blue', url: '/pages/brace-dashboard/brace-dashboard' },
    { title: '生成复诊摘要', caption: '整理穿戴记录与观察，方便和医生沟通', icon: 'clipboard-list', tone: 'sage', url: '/pages/followup/followup' },
  ] },
]

function orderedGroups(phase: number) {
  const preferred = phase === 3 ? 'cast' : phase >= 4 ? 'brace' : 'prenatal'
  return [...groups.filter(group => group.key === preferred), ...groups.filter(group => group.key !== preferred)]
    .map(group => ({ ...group, items: group.key === 'brace' && phase === 5
      ? [group.items[2], ...group.items.slice(0, 2)] : group.items }))
}

Page({
  data: { doctorChannelsUrl, socialChannelsUrl, phaseLabel: '', groups: orderedGroups(0) },
  onShow() {
    selectTab(this, 'pages/tools/tools')
    let phase = 0
    try { phase = homePhase(readWearLog()) } catch { /* Show all tools even if local preferences are unavailable. */ }
    this.setData({ phaseLabel: phase ? phases[phase] : '', groups: orderedGroups(phase) })
  },
})
