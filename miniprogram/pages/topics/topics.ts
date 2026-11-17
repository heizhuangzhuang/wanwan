import { wanwanApi, type TopicSummary } from '../../services/api'

Page({
  data: {
    topics: [] as TopicSummary[],
    loading: true,
    error: '',
  },
  onLoad() {
    this.loadTopics()
  },
  async loadTopics() {
    this.setData({ loading: true, error: '' })
    try {
      const res = await wanwanApi.listTopics(1, 50)
      this.setData({ topics: res.items, loading: false })
    } catch {
      this.setData({ loading: false, error: '加载专题失败。' })
    }
  },
})
