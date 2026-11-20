import { wanwanApi, type TopicSummary } from '../../services/api'
import { openResource, resourceLabel } from '../../services/reading'
import { selectTab } from '../../services/tabs'

Page({
  data: {
    topics: [] as (TopicSummary & { url: string })[],
    resources: [] as ReturnType<typeof resourceLabel>[],
    loading: false,
    featuredError: false,
  },
  onShow() {
    selectTab(this, 'pages/library/library')
    return this.loadFeatured()
  },
  onPullDownRefresh() {
    void this.loadFeatured().finally(() => wx.stopPullDownRefresh())
  },
  async loadFeatured() {
    if (this.data.loading) return
    this.setData({ loading: true, featuredError: false })
    const [topics, resources] = await Promise.allSettled([
      wanwanApi.listTopics(1, 2),
      wanwanApi.listResources({ page: 1, size: 3 }),
    ])
    this.setData({
      topics: topics.status === 'fulfilled' ? topics.value.items.map(topic => ({
        ...topic,
        url: `/pages/reading/reading?kind=topic&name=${encodeURIComponent(topic.name)}`,
      })) : [],
      resources: resources.status === 'fulfilled' ? resources.value.items.map(resourceLabel) : [],
      featuredError: topics.status === 'rejected' || resources.status === 'rejected',
      loading: false,
    })
  },
  openDetail: openResource,
})
