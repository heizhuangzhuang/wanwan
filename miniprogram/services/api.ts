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

const API_PREFIX = '/apis/api.wanwan.run/v1alpha1'

interface AppGlobal {
  globalData: {
    useCloudContainer: boolean
    cloudEnv: string
    cloudService: string
    apiBase: string
  }
}

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
  const { globalData } = getApp<AppGlobal>()
  const qs = buildQuery(data)

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
            resolve(res.data as T)
          } else {
            reject(new Error(`CloudRun HTTP ${res.statusCode}`))
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
