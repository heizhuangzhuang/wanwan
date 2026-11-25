export interface StageView {
  key: string
  label: string
  order: number
}

export interface Entry {
  type: 'WEB' | 'MP_ARTICLE' | 'MINIPROGRAM' | 'CITATION_ONLY'
  url: string | null
  appId: string | null
  path: string | null
}

export interface ResourceView {
  name: string
  title: string
  originalTitle: string
  intro: string
  sourceName: string
  author?: string | null
  publishedDate?: string | null
  lastVerifiedDate?: string | null
  stages: string[]
  materialType: string
  tags: string[]
  language: string
  access: string
  doi?: string | null
  pmid?: string | null
  storyContext?: string | null
  linkStatus: string
  citationUrl: string | null
  attachment?: { fileName: string; url: string } | null
  entry: Entry
}

export interface TopicSummary {
  name: string
  title: string
  intro: string
  resourceCount: number
}

export interface TopicView {
  name: string
  title: string
  intro: string
  resources: ResourceView[]
}

export interface LiteratureCitation {
  originalTitle?: string | null
  journal?: string | null
  publishedYear?: string | null
  evidenceType?: string | null
  doi?: string | null
  sourceUrl?: string | null
  verifiedDate?: string | null
}

export interface PostSummary {
  coverUrl?: string | null
  author?: string | null
  name: string
  title: string
  excerpt?: string | null
  publishTime?: string | null
  articleKind?: 'LITERATURE' | 'GUIDE' | string | null
  citation?: LiteratureCitation | null
}

export interface PostTocItem {
  id: string
  level: 'h2' | 'h3'
  text: string
}

export interface PostView extends PostSummary {
  content: string
}

export interface PreparedPostView extends PostSummary {
  html: string
  toc: PostTocItem[]
  readingMinutes: number
}

export interface PageResult<T> {
  page: number
  size: number
  total: number
  items: T[]
}

export interface SearchResult extends PageResult<ResourceView> {
  guideTotal?: number
  guideItems?: PostSummary[]
}

export interface AnalyticsEvent {
  type: 'pageview' | 'search'
  path?: string
  keyword?: string
}

export interface PrenatalGuide {
  key: string
  title: string
  summary: string
  sections: { heading: string; body: string }[]
  sourceTitle: string
  sourceUrl: string
}

export const FIXED_STAGES: StageView[] = [
  { key: 'JUST_FOUND', label: '刚发现', order: 0 },
  { key: 'PRENATAL', label: '产前了解与等待', order: 1 },
  { key: 'POSTNATAL_TREATMENT', label: '出生后评估与治疗', order: 2 },
  { key: 'BRACE_DAILY', label: '支具与日常生活', order: 3 },
  { key: 'LONG_TERM', label: '长期随访与预后', order: 4 },
]

export const STAGE_CAPTIONS: Record<string, string> = {
  JUST_FOUND: '看懂提示，整理要问的问题',
  PRENATAL: '查找检查资料，准备就诊',
  POSTNATAL_TREATMENT: '了解评估、石膏与复诊',
  BRACE_DAILY: '记录穿戴，安排日常',
  LONG_TERM: '回看变化，整理随访记录',
}

export const MATERIAL_TYPES = [
  { key: '', label: '全部类型' },
  { key: 'INSTITUTION', label: '机构资料' },
  { key: 'PAPER', label: '论文题录' },
  { key: 'FAMILY_STORY', label: '家庭经历' },
  { key: 'ORIGINAL', label: '本站原创' },
] as const

export const FEEDBACK_CATEGORIES = [
  { key: 'FEATURE', label: '希望增加功能' },
  { key: 'USABILITY', label: '使用体验' },
  { key: 'ISSUE', label: '遇到问题' },
  { key: 'OTHER', label: '其他建议' },
] as const

const MATERIAL_LABELS: Record<string, string> = {
  INSTITUTION: '机构资料',
  PAPER: '论文题录',
  FAMILY_STORY: '家庭经历',
  ORIGINAL: '本站原创',
}

const ACCESS_LABELS: Record<string, string> = {
  OPEN: '公开可读',
  LOGIN_REQUIRED: '原站需要登录',
  MAY_BE_PAID: '原站可能付费',
  UNKNOWN: '访问条件未确认',
}

export function materialLabel(type: string): string {
  return MATERIAL_LABELS[type] ?? '资料'
}

export function accessLabel(access: string): string {
  return ACCESS_LABELS[access] ?? '访问条件未确认'
}

export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url || url.length > 2048) return null
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname || parsed.username || parsed.password) return null
    return parsed.toString()
  } catch {
    return null
  }
}

export function cleanExcerpt(title: string, excerpt?: string | null): string {
  const raw = (excerpt || '').trim()
  if (!raw) return ''
  const cleanTitle = title.trim()
  if (cleanTitle && raw.startsWith(cleanTitle)) {
    return raw.slice(cleanTitle.length).replace(/^[\s:：—\-·]+/, '').trim()
  }
  return raw
}

export function isLiteratureArticle(post: Pick<PostSummary, 'articleKind'>): boolean {
  return post.articleKind === 'LITERATURE'
}

export function formatCitationSummary(citation?: LiteratureCitation | null): string {
  if (!citation) return ''
  return [citation.journal, citation.publishedYear, citation.doi ? `DOI: ${citation.doi}` : '']
    .filter(Boolean)
    .join(' · ')
}

export function resolveGuideCoverUrl(coverUrl: string | null | undefined, mediaOrigin?: string): string {
  const raw = (coverUrl || '').trim()
  if (!raw || raw.length > 2048 || /[\s<>"'\\]/.test(raw)) return ''
  if (raw.startsWith('/upload/')) {
    if (!mediaOrigin || /(?:^|\/)\.{1,2}(?:\/|$)|\/\//.test(raw)) return ''
    return `${mediaOrigin.replace(/\/+$/, '')}${raw}`
  }
  return safeHttpUrl(raw) || ''
}
