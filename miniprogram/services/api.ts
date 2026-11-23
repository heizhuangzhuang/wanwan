import { demoResponse } from './demo'
import type { IAppOption } from '../app'
import type { Attachment } from './downloads'

export type EntryType = 'WEB' | 'MP_ARTICLE' | 'MINIPROGRAM' | 'CITATION_ONLY'

export interface StageView {
  key: string
  label: string
  order: number
}

export interface Entry {
  type: EntryType
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
  author?: string
  publishedDate?: string
  lastVerifiedDate?: string
  stages: string[]
  materialType: string
  tags: string[]
  language: 'ZH' | 'OTHER'
  access: string
  doi?: string
  pmid?: string
  storyContext?: string
  linkStatus: string
  citationUrl: string | null
  attachment?: Attachment | null
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
  author?: string | null
  name: string
  title: string
  excerpt: string | null
  publishTime: string | null
  articleKind?: 'LITERATURE' | 'GUIDE' | string | null
  citation?: LiteratureCitation | null
}

export interface PostView extends PostSummary {
  content: string
}

export class HttpError extends Error {
  constructor(public readonly statusCode: number) {
    super(`HTTP ${statusCode}`)
  }
}

export interface PageResult<T> {
  page: number
  size: number
  total: number
  items: T[]
}

interface SearchResult extends PageResult<ResourceView> {
  guideTotal?: number
  guideItems?: PostSummary[]
}

const API_PREFIX = '/apis/api.xiaojiaoya.run/v1alpha1'
const LEGACY_PREFIX = '/apis/api.wanwan.run/v1alpha1'

function buildQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return ''
  const parts: string[] = []
  for (const key of Object.keys(params)) {
    const val = params[key]
    if (val !== undefined && val !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`)
    }
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

interface NoticeConfig {
  templateId: string | null
}

function request<T>(path: string, query?: Record<string, string | number | undefined>,
  body?: Record<string, unknown>, legacy = false): Promise<T> {
  const { globalData } = getApp<IAppOption>()
  if (globalData.demoMode) {
    const response = path === '/notice-config' ? { templateId: null }
      : body ? undefined : demoResponse(path, query)
    return response === undefined ? Promise.reject(new HttpError(404)) : Promise.resolve(response as T)
  }

  const address = path + buildQuery(query)
  const prefix = legacy ? LEGACY_PREFIX : API_PREFIX
  const canRetry = !legacy && !body && !path.startsWith('/cast-journal')
  return new Promise((resolve, reject) => {
    const options = {
      method: body ? 'POST' : 'GET',
      data: body,
      header: { 'X-Wanwan-Client': 'wechat-miniprogram', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      success(res: { statusCode: number; data: unknown }) {
        const loginPage = typeof res.data === 'string'
          && /authentication_required|<title>[^<]*(登录|login)/i.test(res.data)
        if (canRetry && ([301, 302, 303, 307, 308, 401, 403].includes(res.statusCode)
          || (res.statusCode === 404 && path === '/stages') || (res.statusCode === 200 && loginPage))) {
          request<T>(path, query, undefined, true).then(resolve, reject)
        } else if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new HttpError(res.statusCode))
        } else if (loginPage) {
          reject(new HttpError(302))
        } else if (res.data && typeof res.data === 'object') {
          resolve(res.data as T)
        } else {
          reject(new Error('服务没有返回 JSON'))
        }
      },
      fail: reject,
    }

    if (globalData.useCloudContainer) {
      if (!wx.cloud || !globalData.cloudEnv) {
        reject(new Error('微信云环境未配置或不可用'))
        return
      }
      wx.cloud.callContainer({
        ...options,
        config: { env: globalData.cloudEnv },
        path: prefix + address,
        header: { ...options.header, 'X-WX-SERVICE': globalData.cloudService },
      })
    } else {
      const base = legacy ? globalData.apiBase.replace(API_PREFIX, prefix) : globalData.apiBase
      if (legacy && base === globalData.apiBase) {
        reject(new Error('当前后端没有可用的兼容路径'))
        return
      }
      wx.request({ ...options, url: base + address })
    }
  })
}

export const wanwanApi = {
  submitFeedback: (requestId: string, category: string, message: string) =>
    request<{ accepted: boolean }>('/feedback', undefined, { requestId, category, message }),
  getNoticeConfig: () => request<NoticeConfig>('/notice-config'),
  saveNotice: (code: string, templateId: string, enabled: boolean) =>
    request<{ subscribed: boolean }>('/notice-subscriptions', undefined, { code, templateId, enabled }),
  getStages: () => request<StageView[]>('/stages'),
  listResources: (params: { stage?: string; type?: string; tag?: string; page?: number; size?: number }) =>
    request<PageResult<ResourceView>>('/resources', params),
  getResource: (name: string) => request<ResourceView>(`/resources/${encodeURIComponent(name)}`),
  listTopics: (page = 1, size = 20) => request<PageResult<TopicSummary>>('/topics', { page, size }),
  getTopic: (name: string) => request<TopicView>(`/topics/${encodeURIComponent(name)}`),
  listPosts: (page = 1, size = 20, kind?: string) => request<PageResult<PostSummary>>('/posts', { page, size, kind }),
  listStagePosts: (stage: string, page = 1, size = 20, kind?: string) =>
    request<PageResult<PostSummary>>('/stage-posts', { stage, page, size, kind }),
  getPost: (name: string) => request<PostView>(`/posts/${encodeURIComponent(name)}`),
  search: (params: { keyword: string; stage?: string; type?: string; page?: number; size?: number }) =>
    request<SearchResult>('/search', params),
}

export function requestFamilyJournal<T>(path: '/cast-journal-config' | '/cast-journal' | '/brace-archive', body?: Record<string, unknown>) {
  return request<T>(path, undefined, body)
}
