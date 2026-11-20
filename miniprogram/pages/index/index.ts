import type { IAppOption } from '../../app'
import { wanwanApi, type StageView } from '../../services/api'
import { stageIntro } from '../../services/stages'
import { selectTab } from '../../services/tabs'

Page({
  data: {
    stages: [] as (StageView & { intro: string; url: string })[],
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
      this.setData({ stages: stages.map(stage => ({
        ...stage,
        intro: stageIntro(stage.key),
        url: `/pages/stage/stage?key=${encodeURIComponent(stage.key)}&label=${encodeURIComponent(stage.label)}`,
      })) })
    } catch {
      this.setData({ stages: [], error: '暂时无法加载阶段。' })
    } finally {
      this.setData({ loading: false })
    }
  },
})
