import { postPreview } from '../../services/post-preview'
import { wanwanApi, type PostSummary, type TopicSummary, type PageResult } from '../../services/api'
import { openResource, resourceLabel } from '../../services/reading'
import { fixedStages } from '../../services/stages'
import { selectTab } from '../../services/tabs'
import { readingFeed, type FeedItem } from '../../services/reading-feed'

const stageFilters = [
  { key: '', label: '全部阶段' },
  { key: 'JUST_FOUND', label: '刚发现' },
  { key: 'PRENATAL', label: '产前了解' },
  { key: 'POSTNATAL_TREATMENT', label: '出生后治疗' },
  { key: 'BRACE_DAILY', label: '支具日常' },
  { key: 'LONG_TERM', label: '长期随访' },
]

function unique<T extends { name: string }>(items: T[]): T[] {
  return [...new Map(items.map(item => [item.name, item])).values()]
}
function hasNext<T>(page: PageResult<T>) {
  return page.items.length > 0 && page.page * page.size < page.total
}

Page({
  requestSeq: 0,
  loadedOnce: false,
  data: {
    stageFilters, selectedStage: '', selectedStageLabel: '全部阶段',
    stageUrl: '/pages/stage/stage', guidesUrl: '/pages/topics/topics?kind=guide',
    guides: [] as PostSummary[], resources: [] as ReturnType<typeof resourceLabel>[],
    topics: [] as (TopicSummary & { url: string })[],
    feed: [] as FeedItem[], expanded: {} as Record<string, boolean>, brokenImages: {} as Record<string, string>,
    guidePage: 0, resourcePage: 0, hasMoreGuides: false, hasMoreResources: false,
    loading: false, loadingMore: false, featuredError: false, moreError: false, directoryOpen: false,
  },
  onShow() {
    selectTab(this, 'pages/library/library')
    return this.loadFeatured(undefined, this.loadedOnce)
  },
  onPullDownRefresh() { void this.loadFeatured().finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() {
    if (!this.data.moreError && !this.data.featuredError) return this.loadMore()
  },
  toggleDirectory() { this.setData({ directoryOpen: !this.data.directoryOpen }) },
  closeDirectory() { this.setData({ directoryOpen: false }) },
  selectStage(e: WechatMiniprogram.TouchEvent) {
    const key = String(e.currentTarget.dataset.key ?? '')
    if (!stageFilters.some(stage => stage.key === key)) return
    if (key === this.data.selectedStage && !this.data.featuredError) return
    this.applyStage(key)
  },
  resetStage() { this.applyStage('') },
  applyStage(key: string) {
    const fullLabel = fixedStages.find(stage => stage.key === key)?.label ?? '全部阶段'
    const shortLabel = stageFilters.find(stage => stage.key === key)?.label ?? '全部阶段'
    this.setData({ selectedStage: key, selectedStageLabel: shortLabel, directoryOpen: false,
      stageUrl: key ? `/pages/stage/stage?key=${encodeURIComponent(key)}&label=${encodeURIComponent(fullLabel)}` : '/pages/stage/stage',
      guidesUrl: key ? `/pages/topics/topics?kind=guide&stage=${encodeURIComponent(key)}` : '/pages/topics/topics?kind=guide',
      guides: [], resources: [], feed: [], expanded: {}, brokenImages: {}, guidePage: 0, resourcePage: 0,
      hasMoreGuides: false, hasMoreResources: false, loading: true, loadingMore: false, featuredError: false, moreError: false,
    })
    void this.loadFeatured(key)
  },
  async loadFeatured(targetStage?: string, preserve = false) {
    const seq = ++this.requestSeq
    const stage = typeof targetStage === 'string' ? targetStage : this.data.selectedStage
    const oldFeed = preserve ? this.data.feed : []
    const guidePages = preserve ? Math.max(1, this.data.guidePage) : 1
    const resourcePages = preserve ? Math.max(1, this.data.resourcePage) : 1
    this.setData({ loading: true, loadingMore: false, featuredError: false, moreError: false,
      ...(!preserve ? { guides: [], resources: [], feed: [], expanded: {}, brokenImages: {} } : {}),
    })
    const [topics, resources, guides] = await Promise.allSettled([
      stage ? Promise.resolve(null) : wanwanApi.listTopics(1, 6),
      Promise.all(Array.from({ length: resourcePages }, (_, i) => wanwanApi.listResources({ stage: stage || undefined, page: i + 1, size: 3 }))),
      Promise.all(Array.from({ length: guidePages }, (_, i) => stage ? wanwanApi.listStagePosts(stage, i + 1, 5) : wanwanApi.listPosts(i + 1, 5))),
    ])
    if (seq !== this.requestSeq) return
    const posts = guides.status === 'fulfilled' ? unique(guides.value.flatMap(page => page.items)).map(post => ({ ...post, excerpt: postPreview(post) })) : []
    const cards = resources.status === 'fulfilled' ? unique(resources.value.flatMap(page => page.items)).map(resourceLabel) : []
    const lastGuide = guides.status === 'fulfilled' ? guides.value[guidePages - 1] : null
    const lastResource = resources.status === 'fulfilled' ? resources.value[resourcePages - 1] : null
    this.loadedOnce = true
    this.setData({ guides: posts, resources: cards, feed: readingFeed(posts, cards, oldFeed),
      topics: topics.status === 'fulfilled' && topics.value
        ? topics.value.items.filter(topic => topic.resourceCount !== 0).slice(0, 2).map(topic => ({ ...topic, url: `/pages/reading/reading?kind=topic&name=${encodeURIComponent(topic.name)}` })) : [],
      guidePage: lastGuide ? guidePages : 0, resourcePage: lastResource ? resourcePages : 0,
      hasMoreGuides: lastGuide ? hasNext(lastGuide) : true, hasMoreResources: lastResource ? hasNext(lastResource) : true,
      featuredError: (!stage && topics.status === 'rejected') || resources.status === 'rejected' || guides.status === 'rejected', loading: false,
    })
  },
  async loadMore() {
    if (this.data.loading || this.data.loadingMore || (!this.data.hasMoreGuides && !this.data.hasMoreResources)) return
    const seq = ++this.requestSeq
    const { selectedStage: stage, hasMoreGuides, hasMoreResources } = this.data
    const guidePage = this.data.guidePage + 1
    const resourcePage = this.data.resourcePage + 1
    this.setData({ loadingMore: true, moreError: false })
    const [guides, resources] = await Promise.allSettled([
      hasMoreGuides ? (stage ? wanwanApi.listStagePosts(stage, guidePage, 5) : wanwanApi.listPosts(guidePage, 5)) : Promise.resolve(null),
      hasMoreResources ? wanwanApi.listResources({ stage: stage || undefined, page: resourcePage, size: 3 }) : Promise.resolve(null),
    ])
    if (seq !== this.requestSeq) return
    const nextGuides = guides.status === 'fulfilled' ? guides.value : null
    const nextResources = resources.status === 'fulfilled' ? resources.value : null
    const posts = unique([...this.data.guides, ...(nextGuides?.items || []).map(post => ({ ...post, excerpt: postPreview(post) }))])
    const cards = unique([...this.data.resources, ...(nextResources?.items || []).map(resourceLabel)])
    this.setData({ guides: posts, resources: cards, feed: readingFeed(posts, cards, this.data.feed),
      guidePage: nextGuides ? guidePage : this.data.guidePage, resourcePage: nextResources ? resourcePage : this.data.resourcePage,
      hasMoreGuides: nextGuides ? hasNext(nextGuides) : hasMoreGuides, hasMoreResources: nextResources ? hasNext(nextResources) : hasMoreResources,
      loadingMore: false, moreError: guides.status === 'rejected' || resources.status === 'rejected',
    })
  },
  retryFeed() { void this.loadFeatured(undefined, true) },
  toggleExcerpt(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id || '')
    if (this.data.feed.some(item => item.id === id)) this.setData({ expanded: { ...this.data.expanded, [id]: !this.data.expanded[id] } })
  },
  imageError(e: WechatMiniprogram.TouchEvent) {
    const item = this.data.feed.find(item => item.id === e.currentTarget.dataset.id)
    if (item && item.coverUrl === e.currentTarget.dataset.url) this.setData({ brokenImages: { ...this.data.brokenImages, [item.id]: item.coverUrl } })
  },
  previewCover(e: WechatMiniprogram.TouchEvent) {
    const item = this.data.feed.find(item => item.id === e.currentTarget.dataset.id)
    if (item?.coverUrl && wx.previewImage) wx.previewImage({ urls: [item.coverUrl], fail: () => wx.showToast({ title: '图片暂时无法预览', icon: 'none' }) })
  },
  openDetail: openResource,
  onShareAppMessage(event?: { target?: { dataset?: { id?: string } } }) {
    const shared = this.data.feed.find(item => item.id === event?.target?.dataset?.id)
    if (shared && !this.data.loading) return { title: shared.title, path: shared.url }
    const { selectedStage, selectedStageLabel, stageUrl } = this.data
    return selectedStage ? { title: `小脚丫步步指南｜${selectedStageLabel}资料与导读`, path: stageUrl }
      : { title: '小脚丫步步指南｜足内翻家庭资料库', path: '/pages/library/library' }
  },
  onShareTimeline() {
    return { title: this.data.selectedStage ? `小脚丫步步指南｜${this.data.selectedStageLabel}资料与导读` : '小脚丫步步指南｜足内翻家庭资料库', query: '' }
  },
})
