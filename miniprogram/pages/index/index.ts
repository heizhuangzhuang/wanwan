import type { IAppOption } from '../../app'
import { wanwanApi, type StageView } from '../../services/api'
import { fixedStages, stageIntro } from '../../services/stages'
import { selectTab } from '../../services/tabs'

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
    loading: false, error: '', demoMode: false,
  },
  onLoad() {
    this.setData({ demoMode: getApp<IAppOption>().globalData.demoMode })
    return this.loadHome()
  },
  onShow() { selectTab(this, 'pages/index/index') },
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
