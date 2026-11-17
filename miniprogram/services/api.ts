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

export interface PageResult<T> {
  page: number
  size: number
  total: number
  items: T[]
}

function getBaseUrl(): string {
  const app = getApp<{ globalData: { apiBase: string } }>()
  return app.globalData.apiBase
}

function request<T>(path: string, data?: Record<string, string | number>): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getBaseUrl()}${path}`,
      method: 'GET',
      data,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T)
        } else {
          reject(new Error(`HTTP ${res.statusCode}`))
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
  listResources: (params: { stage?: string; type?: string; page?: number; size?: number }) =>
    request<PageResult<ResourceView>>('/resources', params),
  getResource: (name: string) => request<ResourceView>(`/resources/${encodeURIComponent(name)}`),
  listTopics: (page = 1, size = 20) => request<PageResult<TopicSummary>>('/topics', { page, size }),
  getTopic: (name: string) => request<TopicView>(`/topics/${encodeURIComponent(name)}`),
  search: (keyword: string, page = 1, size = 20) =>
    request<PageResult<ResourceView>>('/search', { keyword, page, size }),
}
