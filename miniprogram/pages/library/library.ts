import { wanwanApi, type PostSummary, type TopicSummary } from '../../services/api'
import { openResource, resourceLabel } from '../../services/reading'
import { fixedStages } from '../../services/stages'
import { selectTab } from '../../services/tabs'

const stageFilters = [
  { key: '', label: '全部阶段' },
  { key: 'JUST_FOUND', label: '刚发现' },
  { key: 'PRENATAL', label: '产前了解' },
  { key: 'POSTNATAL_TREATMENT', label: '出生后治疗' },
  { key: 'BRACE_DAILY', label: '支具日常' },
  { key: 'LONG_TERM', label: '长期随访' },
]

function cleanExcerpt(title: string, excerpt?: string | null): string {
  const raw = (excerpt || '').trim()
  if (!raw) return ''
  const cleanTitle = title.trim()
  if (cleanTitle && raw.startsWith(cleanTitle)) {
    return raw.slice(cleanTitle.length).replace(/^[\s:：—\-·]+/, '').trim()
  }
  return raw
}

Page({
  data: {
    stageFilters,
    selectedStage: '',
    selectedStageLabel: '全部阶段',
    stageUrl: '/pages/stage/stage',
    guidesUrl: '/pages/topics/topics?kind=guide',
    guides: [] as PostSummary[],
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
  selectStage(e: WechatMiniprogram.TouchEvent) {
    const key = String(e.currentTarget.dataset.key ?? '')
    if (key === this.data.selectedStage && !this.data.featuredError) return
    const fullLabel = fixedStages.find(stage => stage.key === key)?.label ?? '全部阶段'
    const shortLabel = stageFilters.find(stage => stage.key === key)?.label ?? '全部阶段'
    this.setData({
      selectedStage: key,
      selectedStageLabel: shortLabel,
      stageUrl: key
        ? `/pages/stage/stage?key=${encodeURIComponent(key)}&label=${encodeURIComponent(fullLabel)}`
        : '/pages/stage/stage',
      guidesUrl: key
        ? `/pages/topics/topics?kind=guide&stage=${encodeURIComponent(key)}`
        : '/pages/topics/topics?kind=guide',
    })
    void this.loadFeatured()
  },
  async loadFeatured() {
    if (this.data.loading) return
    const stageKey = this.data.selectedStage
    this.setData({ loading: true, featuredError: false })
    const [topics, resources, guides] = await Promise.allSettled([
      wanwanApi.listTopics(1, 2),
      wanwanApi.listResources({ stage: stageKey || undefined, page: 1, size: 3 }),
      stageKey ? wanwanApi.listStagePosts(stageKey, 1, 5) : wanwanApi.listPosts(1, 5),
    ])
    this.setData({
      topics: topics.status === 'fulfilled' ? topics.value.items.map(topic => ({
        ...topic,
        url: `/pages/reading/reading?kind=topic&name=${encodeURIComponent(topic.name)}`,
      })) : [],
      resources: resources.status === 'fulfilled' ? resources.value.items.map(resourceLabel) : [],
      guides: guides.status === 'fulfilled'
        ? guides.value.items.map(post => ({ ...post, excerpt: cleanExcerpt(post.title, post.excerpt) }))
        : [],
      featuredError: topics.status === 'rejected' || resources.status === 'rejected',
      loading: false,
    })
  },
  openDetail: openResource,
})
