import sanitizeHtml from 'sanitize-html'
import type {
  AnalyticsEvent,
  PageResult,
  PostSummary,
  PostTocItem,
  PostView,
  ResourceView,
  SearchResult,
  StageView,
  TopicSummary,
  TopicView,
} from '../../shared/types'
import { resolveGuideCoverUrl } from '../../shared/types.ts'

export class HttpStatusError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface BackendClient {
  submitFeedback(submission: { requestId: string; category: string; message: string }): Promise<void>
  reportAnalytics(batch: { visitorId?: string; events: AnalyticsEvent[] }): Promise<void>
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
  listPosts(page?: number, size?: number, kind?: string): Promise<PageResult<PostSummary>>
  listStagePosts(stage: string, page?: number, size?: number, kind?: string): Promise<PageResult<PostSummary>>
  getPost(name: string): Promise<PostView | null>
  search(params: {
    keyword: string
    stage?: string
    type?: string
    page?: number
    size?: number
  }): Promise<SearchResult>
}

export function getMediaOrigin(apiBase: string): string {
  try {
    return apiBase ? new URL(apiBase).origin : ''
  } catch {
    return ''
  }
}

export function normalizePostCover<T extends PostSummary>(post: T, mediaOrigin: string): T {
  const coverUrl = resolveGuideCoverUrl(post.coverUrl, mediaOrigin)
  return { ...post, coverUrl: coverUrl || null }
}

const EXCLUDED_POST_TAGS = new Set(['main', 'header', 'footer', 'nav', 'aside'])

function resolveUploadImageSrc(src: string | undefined, mediaOrigin?: string): string | undefined {
  if (!src || !mediaOrigin) return src
  const trimmed = src.trim()
  if (!trimmed.startsWith('/upload/') || /(?:^|\/)\.{1,2}(?:\/|$)|\/\//.test(trimmed)) return src
  return `${mediaOrigin.replace(/\/+$/, '')}${trimmed}`
}

export function sanitizePostHtml(html: string | null | undefined, mediaOrigin?: string): string {
  return sanitizeHtml(html ?? '', {
    allowedTags: [...sanitizeHtml.defaults.allowedTags.filter(tag => !EXCLUDED_POST_TAGS.has(tag)), 'img', 'del', 's'],
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
    },
    transformTags: {
      h1: 'h2',
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, ...(attribs.href ? { rel: 'noopener noreferrer' } : {}) },
      }),
      img: (tagName, attribs) => {
        const resolvedSrc = resolveUploadImageSrc(attribs.src, mediaOrigin)
        return {
          tagName,
          attribs: {
            ...attribs,
            ...(resolvedSrc ? { src: resolvedSrc } : {}),
            loading: 'lazy',
            decoding: 'async',
          },
        }
      },
    },
    allowedSchemes: ['http', 'https'],
    allowProtocolRelative: false,
    nonTextTags: ['script', 'style', 'textarea', 'option', 'iframe', 'object', 'template', 'svg', 'math'],
  })
}

export function preparePostContent(rawHtml: string | null | undefined, mediaOrigin?: string): {
  html: string
  toc: PostTocItem[]
  readingMinutes: number
} {
  const clean = sanitizePostHtml(rawHtml, mediaOrigin)
  const plainText = clean
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, '')
  const readingMinutes = Math.max(1, Math.ceil(plainText.length / 400))
  const toc: PostTocItem[] = []
  const html = clean.replace(/<(h[23])>([\s\S]*?)<\/\1>/gi, (match, rawTag: string, inner: string) => {
    const label = inner
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim()
    if (!label) return match
    const level = rawTag.toLowerCase() as 'h2' | 'h3'
    const id = `sec-${toc.length + 1}`
    toc.push({ id, level, text: label })
    return `<${level} id="${id}">${inner}</${level}>`
  })
  return { html, toc, readingMinutes }
}

export function createBackendClient(apiBase: string, timeoutMs = 5000): BackendClient {
  const cleanBase = apiBase.replace(/\/+$/, '')
  const legacyBase = cleanBase.replace(/\/api\.xiaojiaoya\.run\/v1alpha1$/, '/api.wanwan.run/v1alpha1')

  function backendUrl(path: string, base: string): URL {
    if (!cleanBase) throw new Error('BACKEND_API_BASE is not configured')
    return new URL(`${base}${path}`)
  }

  async function getJson<T>(path: string, query?: Record<string, string | number | undefined>, base = cleanBase): Promise<T> {
    const url = backendUrl(path, base)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
      }
    }
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Wanwan-Client': 'web' },
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
    async submitFeedback(submission) {
      const res = await fetch(backendUrl('/feedback', cleanBase), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Wanwan-Client': 'web' },
        body: JSON.stringify(submission),
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        await res.body?.cancel()
        throw new HttpStatusError(res.status, `Backend HTTP ${res.status}`)
      }
      const receipt = await res.json() as { accepted?: boolean } | null
      if (!receipt?.accepted) throw new Error('Unexpected feedback receipt')
    },
    async reportAnalytics(batch) {
      if (!cleanBase || !batch.events.length) return
      const res = await fetch(backendUrl('/analytics-events', cleanBase), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Wanwan-Client': 'web' },
        body: JSON.stringify(batch),
        redirect: 'manual',
        signal: AbortSignal.timeout(3000),
      })
      await res.body?.cancel()
    },
    getStages: () => getJson<StageView[]>('/stages'),
    listResources: p => getJson<PageResult<ResourceView>>('/resources', p),
    getResource: name => getJsonOrNull<ResourceView>(`/resources/${encodeURIComponent(name)}`),
    listTopics: (page = 1, size = 20) => getJson<PageResult<TopicSummary>>('/topics', { page, size }),
    getTopic: name => getJsonOrNull<TopicView>(`/topics/${encodeURIComponent(name)}`),
    listPosts: (page = 1, size = 20, kind?: string) => getJson<PageResult<PostSummary>>('/posts', { page, size, kind }),
    listStagePosts: (stage, page = 1, size = 20, kind?: string) => getJson<PageResult<PostSummary>>('/stage-posts', { stage, page, size, kind }),
    getPost: name => getJsonOrNull<PostView>(`/posts/${encodeURIComponent(name)}`),
    search: p => getJson<SearchResult>('/search', p),
  }
}

export function useBackend() {
  const config = useRuntimeConfig()
  const apiBase = String(config.backendApiBase || '').replace(/\/+$/, '')
  return {
    apiBase,
    mediaOrigin: getMediaOrigin(apiBase),
    client: createBackendClient(apiBase),
  }
}
