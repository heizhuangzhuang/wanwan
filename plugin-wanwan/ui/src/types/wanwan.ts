export type StageKey =
  | 'JUST_FOUND'
  | 'PRENATAL'
  | 'POSTNATAL_TREATMENT'
  | 'BRACE_DAILY'
  | 'LONG_TERM'

export type MaterialType = 'INSTITUTION' | 'PAPER' | 'FAMILY_STORY' | 'ORIGINAL'
export type PublishState = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'WITHDRAWN'
export type LinkStatus = 'UNCHECKED' | 'OK' | 'NEEDS_RECHECK' | 'SOURCE_RETRACTED'
export type AccessCondition = 'OPEN' | 'LOGIN_REQUIRED' | 'MAY_BE_PAID' | 'UNKNOWN'
export type Language = 'ZH' | 'OTHER'
export type EntryType = 'WEB' | 'MP_ARTICLE' | 'MINIPROGRAM' | 'CITATION_ONLY'

export interface ExtensionMetadata {
  name: string
  generateName?: string
  version?: number
  creationTimestamp?: string
}

export interface ResourceCardSpec {
  originalTitle: string
  displayTitle?: string
  intro: string
  url: string
  sourceName: string
  author?: string
  publishedDate?: string
  lastVerifiedDate?: string
  downloadUrl?: string
  downloadFileName?: string
  downloadApproved?: boolean
  stages: StageKey[]
  materialType: MaterialType
  tags: string[]
  language: Language
  access: AccessCondition
  doi?: string
  pmid?: string
  storyContext?: string
  entryType: EntryType
  miniProgramAppId?: string
  miniProgramPath?: string
  linkStatus: LinkStatus
  state: PublishState
  priority: number
}

export interface ResourceCard {
  apiVersion: 'wanwan.run/v1alpha1'
  kind: 'ResourceCard'
  metadata: ExtensionMetadata
  spec: ResourceCardSpec
}

export interface TopicSpec {
  title: string
  intro: string
  resourceNames: string[]
  state: PublishState
  priority: number
}

export interface Topic {
  apiVersion: 'wanwan.run/v1alpha1'
  kind: 'Topic'
  metadata: ExtensionMetadata
  spec: TopicSpec
}

export interface ExtensionList<T> {
  page: number
  size: number
  total: number
  items: T[]
}

export const STAGE_OPTIONS: { value: StageKey; label: string }[] = [
  { value: 'JUST_FOUND', label: '刚发现' },
  { value: 'PRENATAL', label: '产前了解与等待' },
  { value: 'POSTNATAL_TREATMENT', label: '出生后评估与治疗' },
  { value: 'BRACE_DAILY', label: '支具与日常生活' },
  { value: 'LONG_TERM', label: '长期随访与预后' },
]

export const MATERIAL_TYPE_OPTIONS: { value: MaterialType; label: string }[] = [
  { value: 'INSTITUTION', label: '机构资料' },
  { value: 'PAPER', label: '论文题录' },
  { value: 'FAMILY_STORY', label: '家庭经历' },
  { value: 'ORIGINAL', label: '本站原创' },
]

export const PUBLISH_STATE_OPTIONS: { value: PublishState; label: string }[] = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING_REVIEW', label: '待核对' },
  { value: 'PUBLISHED', label: '已发布' },
  { value: 'WITHDRAWN', label: '已撤回' },
]

export const LINK_STATUS_OPTIONS: { value: LinkStatus; label: string }[] = [
  { value: 'UNCHECKED', label: '未核对' },
  { value: 'OK', label: '正常' },
  { value: 'NEEDS_RECHECK', label: '需复核' },
  { value: 'SOURCE_RETRACTED', label: '原文撤回' },
]

export const ACCESS_OPTIONS: { value: AccessCondition; label: string }[] = [
  { value: 'OPEN', label: '公开可读' },
  { value: 'LOGIN_REQUIRED', label: '需要登录' },
  { value: 'MAY_BE_PAID', label: '可能付费' },
  { value: 'UNKNOWN', label: '未确认' },
]

export const ENTRY_TYPE_OPTIONS: { value: EntryType; label: string }[] = [
  { value: 'CITATION_ONLY', label: '仅展示出处' },
  { value: 'WEB', label: 'Web 原文' },
  { value: 'MP_ARTICLE', label: '公众号文章' },
  { value: 'MINIPROGRAM', label: '其他小程序' },
]
