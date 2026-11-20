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

export interface PostSummary {
  author?: string | null
  name: string
  title: string
  excerpt?: string | null
  publishTime?: string | null
}

export interface PostView {
  author?: string | null
  name: string
  title: string
  excerpt?: string | null
  publishTime?: string | null
  content: string
}

export interface PageResult<T> {
  page: number
  size: number
  total: number
  items: T[]
}

export interface BackendClient {
  getStages(): Promise<StageView[]>
  listResources(params: {
    stage?: string
    type?: string
    tag?: string
    page?: number
    size?: number
  }): Promise<PageResult<ResourceView>>
  getResource(name: string): Promise<ResourceView | null>
  listTopics(page?: number, size?: number): Promise<PageResult<TopicSummary>>
  getTopic(name: string): Promise<TopicView | null>
  listPosts(page?: number, size?: number): Promise<PageResult<PostSummary>>
  getPost(name: string): Promise<PostView | null>
  search(params: {
    keyword: string
    stage?: string
    type?: string
    page?: number
    size?: number
  }): Promise<PageResult<ResourceView>>
}

export function createBackendClient(apiBase: string, timeoutMs = 5000): BackendClient {
  const legacyBase = apiBase.replace(/\/api\.xiaojiaoya\.run\/v1alpha1$/, '/api.wanwan.run/v1alpha1')

  function backendUrl(path: string, base: string): URL {
    if (!apiBase) throw new Error('BACKEND_API_BASE is not configured')
    return new URL(`${base}${path}`)
  }

  async function getJson<T>(path: string, query?: Record<string, string | number | undefined>, base = apiBase): Promise<T> {
    const url = backendUrl(path, base)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
      }
    }
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (base !== legacyBase && ([301, 302, 303, 307, 308, 401, 403].includes(res.status)
      || (res.status === 404 && path === '/stages'))) {
      await res.body?.cancel()
      return getJson<T>(path, query, legacyBase)
    }
    if (!res.ok) {
      throw new HttpStatusError(res.status, `Backend HTTP ${res.status}`)
    }
    return (await res.json()) as T
  }

  async function getJsonOrNull<T>(path: string): Promise<T | null> {
    try {
      return await getJson<T>(path)
    } catch (error) {
      if (error instanceof HttpStatusError && error.status === 404) return null
      throw error
    }
  }

  return {
    getStages: () => getJson<StageView[]>('/stages'),
    listResources: (p) => getJson<PageResult<ResourceView>>('/resources', p),
    getResource: (name) => getJsonOrNull<ResourceView>(`/resources/${encodeURIComponent(name)}`),
    listTopics: (page = 1, size = 20) => getJson<PageResult<TopicSummary>>('/topics', { page, size }),
    getTopic: (name) => getJsonOrNull<TopicView>(`/topics/${encodeURIComponent(name)}`),
    listPosts: (page = 1, size = 20) => getJson<PageResult<PostSummary>>('/posts', { page, size }),
    getPost: (name) => getJsonOrNull<PostView>(`/posts/${encodeURIComponent(name)}`),
    search: (p) => getJson<PageResult<ResourceView>>('/search', p),
  }
}

export class HttpStatusError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}
