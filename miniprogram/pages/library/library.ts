import { postPreview } from '../../services/post-preview'
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


Page({
  requestSeq: 0,
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
    this.applyStage(key)
  },
  resetStage() {
    if (!this.data.selectedStage && !this.data.featuredError) return
    this.applyStage('')
  },
  applyStage(key: string) {
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
      resources: [],
      guides: [],
      loading: true,
      featuredError: false,
    })
    void this.loadFeatured(key)
  },
  async loadFeatured(targetStage?: string) {
    const seq = ++this.requestSeq
    const stageKey = typeof targetStage === 'string' ? targetStage : this.data.selectedStage
    this.setData({ loading: true, featuredError: false })
    const tasks = [
      stageKey ? Promise.resolve(null) : wanwanApi.listTopics(1, 6),
      wanwanApi.listResources({ stage: stageKey || undefined, page: 1, size: 3 }),
      stageKey ? wanwanApi.listStagePosts(stageKey, 1, 5) : wanwanApi.listPosts(1, 5),
    ] as const
    const [topics, resources, guides] = await Promise.allSettled(tasks)
    if (seq !== this.requestSeq) return
    const nextTopics = stageKey
      ? this.data.topics
      : topics.status === 'fulfilled' && topics.value
        ? topics.value.items
            .filter(topic => topic.resourceCount !== 0)
            .slice(0, 2)
            .map(topic => ({
              ...topic,
              url: `/pages/reading/reading?kind=topic&name=${encodeURIComponent(topic.name)}`,
            }))
        : []
    const topicsFailed = !stageKey && topics.status === 'rejected'
    this.setData({
      topics: nextTopics,
      resources: resources.status === 'fulfilled' ? resources.value.items.map(resourceLabel) : [],
      guides: guides.status === 'fulfilled'
        ? guides.value.items.map(post => ({ ...post, excerpt: postPreview(post) }))
        : [],
      featuredError: topicsFailed || resources.status === 'rejected' || guides.status === 'rejected',
      loading: false,
    })
  },
  openDetail: openResource,
  onShareAppMessage() {
    const { selectedStage, selectedStageLabel, stageUrl } = this.data
    if (selectedStage) {
      return { title: `小脚丫步步指南｜${selectedStageLabel}资料与导读`, path: stageUrl }
    }
    return { title: '小脚丫步步指南｜足内翻家庭资料库', path: '/pages/library/library' }
  },
  onShareTimeline() {
    const { selectedStage, selectedStageLabel } = this.data
    return {
      title: selectedStage ? `小脚丫步步指南｜${selectedStageLabel}资料与导读` : '小脚丫步步指南｜足内翻家庭资料库',
      query: '',
    }
  },
})
