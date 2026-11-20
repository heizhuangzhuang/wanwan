import type { IAppOption } from '../../app'
import { wanwanApi, type StageView, type TopicSummary } from '../../services/api'
import { openResource, resourceLabel } from '../../services/reading'
import { shelfNames } from '../../services/reading-shelf'
import { stageIntro } from '../../services/stages'

Page({
  data: {
    stages: [] as (StageView & { intro: string })[],
    topics: [] as TopicSummary[],
    resources: [] as ReturnType<typeof resourceLabel>[],
    shelfCount: 0, loading: false, error: '', featuredError: false, demoMode: false,
  },
  onLoad() {
    this.setData({ demoMode: getApp<IAppOption>().globalData.demoMode })
  },
  onShow() {
    this.setData({ shelfCount: shelfNames('saved').length })
    void this.loadHome()
  },
  onPullDownRefresh() {
    void this.loadHome().finally(() => wx.stopPullDownRefresh())
  },
  async loadHome() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '', featuredError: false, stages: [], topics: [], resources: [] })
    const [stages, topics, resources] = await Promise.allSettled([
      wanwanApi.getStages(),
      wanwanApi.listTopics(1, 2),
      wanwanApi.listResources({ page: 1, size: 3 }),
    ])
    this.setData({
      stages: stages.status === 'fulfilled' ? stages.value.map(stage => ({ ...stage, intro: stageIntro(stage.key) })) : [],
      topics: topics.status === 'fulfilled' ? topics.value.items : [],
      resources: resources.status === 'fulfilled' ? resources.value.items.map(resourceLabel) : [],
      error: stages.status === 'rejected' ? '暂时无法加载阶段列表，请重试。' : '',
      featuredError: topics.status === 'rejected' || resources.status === 'rejected',
      loading: false,
    })
  },
  goStage(e: WechatMiniprogram.TouchEvent) {
    const { key, label } = e.currentTarget.dataset as { key: string; label: string }
    wx.navigateTo({ url: `/pages/stage/stage?key=${encodeURIComponent(key)}&label=${encodeURIComponent(label)}` })
  },
  openTopic(e: WechatMiniprogram.TouchEvent) {
    const { name } = e.currentTarget.dataset
    if (typeof name === 'string' && name) {
      wx.navigateTo({ url: `/pages/reading/reading?kind=topic&name=${encodeURIComponent(name)}` })
    }
  },
  openDetail: openResource,
})
