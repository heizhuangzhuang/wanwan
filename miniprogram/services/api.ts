import { demoResponse } from './demo'
import type { IAppOption } from '../app'

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

export interface PostSummary {
  name: string
  title: string
  excerpt: string | null
  publishTime: string | null
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

const API_PREFIX = '/apis/api.wanwan.run/v1alpha1'

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

function request<T>(path: string, data?: Record<string, string | number | undefined>): Promise<T> {
  const { globalData } = getApp<IAppOption>()
  if (globalData.demoMode) {
    const response = demoResponse(path, data)
    return response === undefined ? Promise.reject(new HttpError(404)) : Promise.resolve(response as T)
  }
  const qs = buildQuery(data)

  if (globalData.useCloudContainer && (!wx.cloud || !globalData.cloudEnv)) {
    return Promise.reject(new Error('微信云环境未配置或不可用'))
  }

  if (globalData.useCloudContainer && wx.cloud) {
    return new Promise((resolve, reject) => {
      wx.cloud!.callContainer({
        config: globalData.cloudEnv ? { env: globalData.cloudEnv } : undefined,
        path: `${API_PREFIX}${path}${qs}`,
        method: 'GET',
        header: {
          'X-WX-SERVICE': globalData.cloudService,
        },
        success(res) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (res.data && typeof res.data === 'object') resolve(res.data as T)
            else reject(new Error('资料接口没有返回 JSON'))
          } else {
            reject(new HttpError(res.statusCode))
          }
        },
        fail(err) {
          reject(err)
        },
      })
    })
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${globalData.apiBase}${path}${qs}`,
      method: 'GET',
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (res.data && typeof res.data === 'object') resolve(res.data as T)
          else reject(new Error('资料接口没有返回 JSON'))
        } else {
          reject(new HttpError(res.statusCode))
        }
      },
      fail(err) {
        reject(err)
      },
    })
  })
}

export const wanwanApi = {
  getStages: () => request<StageView[]>('/stages'),
  listResources: (params: { stage?: string; type?: string; tag?: string; page?: number; size?: number }) =>
    request<PageResult<ResourceView>>('/resources', params),
  getResource: (name: string) => request<ResourceView>(`/resources/${encodeURIComponent(name)}`),
  listTopics: (page = 1, size = 20) => request<PageResult<TopicSummary>>('/topics', { page, size }),
  getTopic: (name: string) => request<TopicView>(`/topics/${encodeURIComponent(name)}`),
  listPosts: (page = 1, size = 20) => request<PageResult<PostSummary>>('/posts', { page, size }),
  getPost: (name: string) => request<PostView>(`/posts/${encodeURIComponent(name)}`),
  search: (params: { keyword: string; stage?: string; type?: string; page?: number; size?: number }) =>
    request<PageResult<ResourceView>>('/search', params),
}
