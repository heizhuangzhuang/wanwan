import type { PostView, ResourceView, StageView, TopicView } from './api'

export const demoStages: StageView[] = [
  { key: 'JUST_FOUND', label: '刚发现', order: 0 },
  { key: 'PRENATAL', label: '产前了解与等待', order: 1 },
  { key: 'POSTNATAL_TREATMENT', label: '出生后评估与治疗', order: 2 },
  { key: 'BRACE_DAILY', label: '支具与日常生活', order: 3 },
  { key: 'LONG_TERM', label: '长期随访与预后', order: 4 },
]

function card(name: string, title: string, intro: string, stage: string, tag: string): ResourceView {
  return {
    name, title, originalTitle: title, intro, stages: [stage], tags: [tag], sourceName: '本地演示资料',
    materialType: 'ORIGINAL', language: 'ZH', access: 'UNKNOWN', linkStatus: 'UNCHECKED',
    citationUrl: null, entry: { type: 'CITATION_ONLY', url: null, appId: null, path: null },
  }
}

const resources = [
  card('demo-discovery', '初次浏览从哪里开始', '演示如何按阶段定位资料并查看对应出处。', 'JUST_FOUND', '阅读指南'),
  card('demo-prenatal', '整理产前资料的阅读清单', '演示标题、来源与简短介绍在列表中的呈现方式。', 'PRENATAL', '阅读指南'),
  card('demo-cast', '石膏阶段资料目录', '演示如何查找与石膏相关的公开资料。', 'POSTNATAL_TREATMENT', '石膏'),
  card('demo-brace', '支具与生活资料目录', '演示如何按主题标签浏览资料。', 'BRACE_DAILY', '支具'),
  card('demo-follow-up', '随访资料目录', '演示资料的阅读背景和来源状态。', 'LONG_TERM', '随访'),
]

const topic: TopicView = {
  name: 'demo-start', title: '开始使用小脚丫步步指南', intro: '从公众号文章打开的专题示例。',
  resources: [resources[0], resources[2]],
}

const guide: PostView = {
  name: 'demo-guide', title: '如何查找资料', excerpt: '了解阶段、专题和出处入口。',
  publishTime: '2026-11-19T00:00:00Z',
  content: '<p>在首页选择你关心的阶段，或通过搜索查找资料。</p><p>在详情中查看出处和访问条件。遇到待核对的来源，可以复制题名与出处。</p>',
}

function paged<T>(items: T[], params: Record<string, string | number | undefined>) {
  const page = Number(params.page ?? 1)
  const size = Number(params.size ?? 20)
  return { page, size, total: items.length, items: items.slice((page - 1) * size, page * size) }
}

export function demoResponse(path: string, params: Record<string, string | number | undefined> = {}) {
  if (path === '/stages') return demoStages
  if (path === '/topics') return paged([{ ...topic, resourceCount: topic.resources.length }], params)
  if (path === `/topics/${topic.name}`) return topic
  if (path === '/posts') return paged([guide], params)
  if (path === `/posts/${guide.name}`) return guide
  if (path.startsWith('/resources/')) return resources.find(item => `/resources/${item.name}` === path)
  if (path === '/resources' || path === '/search') {
    const keyword = String(params.keyword ?? '').toLowerCase()
    return paged(resources.filter(item =>
      (!params.stage || item.stages.includes(String(params.stage))) &&
      (!params.type || item.materialType === params.type) &&
      (!params.tag || item.tags.includes(String(params.tag))) &&
      (!keyword || `${item.title} ${item.intro} ${item.tags.join(' ')}`.toLowerCase().includes(keyword))), params)
  }
  return undefined
}
