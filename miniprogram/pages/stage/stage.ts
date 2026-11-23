import { postPreview } from '../../services/post-preview'
import { wanwanApi, type PostSummary } from '../../services/api'
import type { IAppOption } from '../../app'
import { familyGuide } from '../../services/family-guide'
import { decodeOption, materialTypes, openResource, resourceLabel } from '../../services/reading'

import { fixedStages, stageIntro } from '../../services/stages'

interface StageToolTile {
  title: string
  sub: string
  url: string
  icon: string
  tone: string
}

const stageToolMap: Record<string, StageToolTile[]> = {
  JUST_FOUND: [
    { title: '问医生清单', sub: '勾选带去产科/超声科', url: '/pages/preparation/preparation?stage=JUST_FOUND', icon: 'clipboard-list', tone: 'sage' },
    { title: '超声复查清单', sub: '下载打印一页 PDF', url: '/pages/downloads/downloads', icon: 'file-down', tone: 'gold' },
    { title: '产前检查专项', sub: '羊穿 / CMA / WES', url: '/pages/prenatal/prenatal', icon: 'scan-heart', tone: 'rose' },
    { title: '找产前与胎儿门诊', sub: '查权威医院与搜索词', url: '/pages/channels/channels?type=doctor&period=prenatal', icon: 'stethoscope', tone: 'blue' },
  ],
  PRENATAL: [
    { title: '产前检查专项', sub: '羊穿 / CMA / WES 解读', url: '/pages/prenatal/prenatal', icon: 'scan-heart', tone: 'rose' },
    { title: '产前问医生清单', sub: '遗传咨询与出生规划', url: '/pages/preparation/preparation?stage=PRENATAL', icon: 'clipboard-list', tone: 'sage' },
    { title: '找产前与小儿骨科', sub: '门诊渠道与好大夫', url: '/pages/channels/channels?type=doctor&period=prenatal', icon: 'stethoscope', tone: 'blue' },
    { title: '超声复查清单', sub: '历次复查核对表', url: '/pages/downloads/downloads', icon: 'file-down', tone: 'gold' },
  ],
  POSTNATAL_TREATMENT: [
    { title: '石膏与复诊提醒', sub: '记次数、交代与微信提醒', url: '/pages/cast/cast', icon: 'calendar-clock', tone: 'sage' },
    { title: '治疗期问医生清单', sub: '石膏护理与血运观察', url: '/pages/preparation/preparation?stage=POSTNATAL_TREATMENT', icon: 'clipboard-list', tone: 'peach' },
    { title: '找小儿骨科门诊', sub: '专业医院与复诊参考', url: '/pages/channels/channels?type=doctor&period=postnatal', icon: 'stethoscope', tone: 'blue' },
    { title: '科普与家长经验', sub: '真实护理经验参考', url: '/pages/channels/channels?type=social', icon: 'messages-square', tone: 'rose' },
  ],
  BRACE_DAILY: [
    { title: '矫正鞋穿戴计时', sub: '跨夜/午睡累计与补记', url: '/pages/brace-wear/brace-wear', icon: 'footprints', tone: 'blue' },
    { title: '穿戴趋势与复诊', sub: '达标率与历史计划', url: '/pages/brace-dashboard/brace-dashboard', icon: 'calendar-days', tone: 'sage' },
    { title: '支具期问医生清单', sub: '磨脚红肿与换码沟通', url: '/pages/preparation/preparation?stage=BRACE_DAILY', icon: 'clipboard-list', tone: 'gold' },
    { title: '科普与家长经验', sub: '穿鞋技巧与交流参考', url: '/pages/channels/channels?type=social', icon: 'messages-square', tone: 'rose' },
  ],
  LONG_TERM: [
    { title: '生成复诊摘要', sub: '整理穿戴与观察给医生', url: '/pages/followup/followup', icon: 'clipboard-list', tone: 'sage' },
    { title: '穿戴趋势与档案', sub: '多年趋势与备份导出', url: '/pages/brace-dashboard/brace-dashboard', icon: 'calendar-days', tone: 'blue' },
    { title: '随访期问题清单', sub: '步态鞋型与复发信号', url: '/pages/preparation/preparation?stage=LONG_TERM', icon: 'stethoscope', tone: 'peach' },
    { title: '科普与家长经验', sub: '大龄穿鞋与运动参考', url: '/pages/channels/channels?type=social', icon: 'messages-square', tone: 'rose' },
  ],
}


Page({
  requestSeq: 0,
  articleSeq: 0,
  data: {
    stageKey: '', heading: '', intro: '', materials: materialTypes, typeIndex: 0, tag: '', submittedTag: '',
    activeTab: 'all' as 'all' | 'guides' | 'resources',
    showTagFilter: false,
    showFocusModal: false,
    stageTools: [] as StageToolTile[],
    guide: null as ReturnType<typeof familyGuide>, prepareUrl: '',
    articles: [] as PostSummary[], articlesUrl: '', moreArticles: false,
    items: [] as ReturnType<typeof resourceLabel>[],
    previewItems: [] as ReturnType<typeof resourceLabel>[],
    totalItems: 0,
    page: 1, hasNext: false, loading: false, error: '', requestedPage: 1, demoMode: false,
  },
  onLoad(options: Record<string, string | undefined>) {
    const key = decodeOption(options.key)
    const heading = decodeOption(options.label) || fixedStages.find(stage => stage.key === key)?.label || '公开资料库'
    const guide = familyGuide(key)
    wx.setNavigationBarTitle({ title: heading })
    this.setData({
      stageKey: key,
      articlesUrl: '/pages/topics/topics?kind=guide&stage=' + encodeURIComponent(key),
      heading,
      demoMode: getApp<IAppOption>().globalData.demoMode,
      guide,
      showFocusModal: false,
      stageTools: stageToolMap[key] ?? [],
      activeTab: guide ? 'all' : 'resources',
      prepareUrl: guide ? '/pages/preparation/preparation?stage=' + encodeURIComponent(key) : '',
      intro: guide?.summary ?? (key ? stageIntro(key) : '按类型或标签查找精选资料。'),
    })
  },
  onShow() {
    void this.fetch(this.data.page)
    void this.fetchArticles()
  },
  async fetchArticles() {
    const { stageKey } = this.data
    if (!fixedStages.some(stage => stage.key === stageKey)) return
    const seq = ++this.articleSeq
    try {
      const result = await wanwanApi.listStagePosts(stageKey, 1, 3)
      if (seq !== this.articleSeq) return
      const articles = result.items.map(post => ({ ...post, excerpt: postPreview(post) }))
      this.setData({ articles, moreArticles: result.total > result.items.length })
    } catch {
      if (seq !== this.articleSeq) return
      this.setData({ articles: [], moreArticles: false })
    }
  },
  copyGuideSource() {
    const source = this.data.guide?.source
    if (!source) return
    wx.setClipboardData({
      data: source.url,
      success: () => wx.showToast({ title: '已复制来源链接', icon: 'none' }),
      fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }),
    })
  },
  openStageFocus() {
    if (!this.data.guide) return
    this.setData({ showFocusModal: true })
  },
  closeStageFocus() {
    if (!this.data.showFocusModal) return
    this.setData({ showFocusModal: false })
  },
  goPrepareFromModal() {
    const url = this.data.prepareUrl
    this.setData({ showFocusModal: false })
    if (url) wx.navigateTo({ url })
  },
  noop() {},
  showFormatHelp() {
    wx.showModal({
      title: '导读与资料卡有什么区别？',
      content: '原创导读：本站整理的白话长文，按章节折叠，点开直接读完。\n\n资料卡：精选医院、指南与文献的摘要卡，附权威出处与原文/附件入口。',
      showCancel: false,
      confirmText: '知道了',
    })
  },
  selectTab(e: WechatMiniprogram.TouchEvent) {
    const tab = e.currentTarget.dataset.tab as 'all' | 'guides' | 'resources' | undefined
    if (!tab || tab === this.data.activeTab) return
    if (tab === 'all' && (this.data.typeIndex !== 0 || this.data.submittedTag !== '')) {
      this.setData({ activeTab: tab, typeIndex: 0, tag: '', submittedTag: '' })
      void this.fetch(1)
      return
    }
    this.setData({ activeTab: tab })
  },
  toggleTagFilter() {
    this.setData({ showTagFilter: !this.data.showTagFilter })
  },
  selectType(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index)
    if (Number.isNaN(index) || (index === this.data.typeIndex && !this.data.error)) return
    this.setData({ typeIndex: index })
    void this.fetch(1)
  },
  onType(e: WechatMiniprogram.PickerChange) {
    this.setData({ typeIndex: Number(e.detail.value) })
    void this.fetch(1)
  },
  onTag(e: WechatMiniprogram.Input) { this.setData({ tag: e.detail.value }) },
  applyTag() {
    this.setData({ submittedTag: this.data.tag.trim() })
    void this.fetch(1)
  },
  async fetch(page: number) {
    const seq = ++this.requestSeq
    const { stageKey, typeIndex, submittedTag } = this.data
    this.setData({ loading: true, error: '', items: [], previewItems: [], requestedPage: page })
    try {
      const result = await wanwanApi.listResources({ stage: stageKey, type: materialTypes[typeIndex]?.key, tag: submittedTag, page })
      if (seq !== this.requestSeq) return
      const labeled = result.items.map(resourceLabel)
      this.setData({
        items: labeled,
        previewItems: labeled.slice(0, 3),
        totalItems: result.total,
        page: result.page,
        hasNext: result.page * result.size < result.total,
        loading: false,
      })
    } catch {
      if (seq !== this.requestSeq) return
      this.setData({ error: '暂时无法加载资料，请重试。', loading: false })
    }
  },
  retry() { void this.fetch(this.data.requestedPage); void this.fetchArticles() },
  previousPage() { if (this.data.page > 1) void this.fetch(this.data.page - 1) },
  nextPage() { if (this.data.hasNext) void this.fetch(this.data.page + 1) },
  openDetail: openResource,
  onShareAppMessage() {
    const { stageKey, heading } = this.data
    if (stageKey) {
      return {
        title: `小脚丫步步指南｜${heading}`,
        path: `/pages/stage/stage?key=${encodeURIComponent(stageKey)}&label=${encodeURIComponent(heading)}`,
      }
    }
    return { title: '小脚丫步步指南｜公开资料库', path: '/pages/stage/stage' }
  },
  onShareTimeline() {
    const { stageKey, heading } = this.data
    return {
      title: stageKey ? `小脚丫步步指南｜${heading}` : '小脚丫步步指南｜公开资料库',
      query: stageKey ? `key=${encodeURIComponent(stageKey)}&label=${encodeURIComponent(heading)}` : '',
    }
  },
})
