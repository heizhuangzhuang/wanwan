import { FIXED_STAGES, type PageResult } from '../../shared/types'
import { prenatalPaths } from '../../shared/prenatal'
import { useBackend } from '../utils/backend'

async function collectAllPages<T>(
  fetchPage: (page: number, size: number) => Promise<PageResult<T>>,
  maxPages = 10,
  pageSize = 50,
): Promise<T[]> {
  const all: T[] = []
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchPage(page, pageSize)
    all.push(...res.items)
    if (res.items.length < pageSize || all.length >= res.total) break
  }
  return all
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const basePath = String(config.public.siteBasePath || '').replace(/\/+$/, '')
  const siteOrigin = String(config.public.siteOrigin || '').replace(/\/+$/, '')
  const { client } = useBackend()

  const [stagesRes, resourcesRes, topicsRes, postsRes] = await Promise.allSettled([
    client.getStages(),
    collectAllPages((p, s) => client.listResources({ page: p, size: s })),
    collectAllPages((p, s) => client.listTopics(p, s)),
    collectAllPages((p, s) => client.listPosts(p, s)),
  ])
  const stages = stagesRes.status === 'fulfilled' ? stagesRes.value : FIXED_STAGES
  const resources = resourcesRes.status === 'fulfilled' ? resourcesRes.value : []
  const topics = topicsRes.status === 'fulfilled' ? topicsRes.value : []
  const posts = postsRes.status === 'fulfilled' ? postsRes.value : []
  const base = `${siteOrigin}${basePath}`
  const urls = [
    `${base}/`,
    `${base}/stages`,
    `${base}/resources`,
    `${base}/topics`,
    `${base}/posts`,
    `${base}/about`,
    `${base}/tools`,
    `${base}/tools/preparation`,
    `${base}/tools/brace-followup`,
    `${base}/channels`,
    ...prenatalPaths.map(itemPath => base + itemPath),
    ...stages.map(s => `${base}/stages/${encodeURIComponent(s.key)}`),
    ...resources.map(r => `${base}/resources/${encodeURIComponent(r.name)}`),
    ...topics.map(t => `${base}/topics/${encodeURIComponent(t.name)}`),
    ...posts.map(p => `${base}/posts/${encodeURIComponent(p.name)}`),
  ]
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(u => `  <url><loc>${escapeXml(u)}</loc></url>`)
    .join('\n')}\n</urlset>`

  setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  return xml
})
