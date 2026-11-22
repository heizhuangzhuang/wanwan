import { readFileSync } from 'node:fs'
import { renderFeedback } from './feedback.js'
import type { BackendClient, PageResult, PostSummary, ResourceView, StageView } from './api.js'
import { braceScript, braceScriptHash, renderBraceDashboard } from './brace-dashboard.js'
import type { WebConfig } from './config.js'
import {
  listStageGuides,
  renderChannels,
  renderPrenatalBanner,
  renderPreparation,
  renderStageToolsSection,
} from './guides.js'
import {
  appointmentScript,
  pageActionsHash,
  pageActionsScript,
  prenatalPaths,
  renderPrenatal,
  renderTools,
  searchPrenatalGuides,
} from './tools.js'
import {
  accessLabel,
  escapeHtml,
  materialLabel,
  preparePostContent,
  renderCard,
  renderLayout,
  safeHttpUrl,
} from './html.js'

const LOGO_PNG = readFileSync(new URL('../public/logo.png', import.meta.url))
const HOME_PHOTO = readFileSync(new URL('../public/first-steps.webp', import.meta.url))
const CHECKLIST_PDF = readFileSync(new URL('../public/downloads/clubfoot-ultrasound-checklist.pdf', import.meta.url))

export interface RouteResponse {
  status: number
  contentType: string
  body: string | Buffer
  cacheControl?: string
  location?: string
  contentDisposition?: string
  toolsScript?: boolean
  scriptHash?: string
}

const TYPES = [
  { key: '', label: '全部类型' },
  { key: 'INSTITUTION', label: '机构资料' },
  { key: 'PAPER', label: '论文题录' },
  { key: 'FAMILY_STORY', label: '家庭经历' },
  { key: 'ORIGINAL', label: '本站原创' },
]

// These match Halo's fixed stages and are used when its stage endpoint is unavailable.
const FIXED_STAGES: StageView[] = [
  { key: 'JUST_FOUND', label: '刚发现', order: 0 },
  { key: 'PRENATAL', label: '产前了解与等待', order: 1 },
  { key: 'POSTNATAL_TREATMENT', label: '出生后评估与治疗', order: 2 },
  { key: 'BRACE_DAILY', label: '支具与日常生活', order: 3 },
  { key: 'LONG_TERM', label: '长期随访与预后', order: 4 },
]

function htmlResponse(status: number, body: string): RouteResponse {
  return { status, contentType: 'text/html; charset=utf-8', body }
}

const STAGE_CAPTIONS: Record<string, string> = {
  JUST_FOUND: '看懂提示，整理要问的问题',
  PRENATAL: '查找检查资料，准备就诊',
  POSTNATAL_TREATMENT: '了解评估、石膏与复诊',
  BRACE_DAILY: '记录穿戴，安排日常',
  LONG_TERM: '回看变化，整理随访记录',
}

function renderStageGrid(stages: StageView[], basePath: string): string {
  return `<ol class="stage-grid">${stages.map(s => `<li>
    <a class="stage-card" href="${basePath}/stages/${encodeURIComponent(s.key)}">
      <span class="stage-order" aria-hidden="true">${String(s.order + 1).padStart(2, '0')}</span>
      <strong class="stage-name">${escapeHtml(s.label)}</strong>
      ${STAGE_CAPTIONS[s.key] ? `<span class="stage-caption">${STAGE_CAPTIONS[s.key]}</span>` : ''}
      <span class="arrow" aria-hidden="true"></span>
    </a></li>`).join('')}</ol>`
}

function renderHome(config: WebConfig, stages: StageView[], topics: string, recent: string, posts: string) {
  const base = config.siteBasePath
  const tools = [
    ['/tools/brace-followup', '矫正鞋穿戴记录', '计时、补记、困难观察与复诊摘要。', 'green'],
    ['/tools/preparation', '就诊沟通清单', '按阶段勾选想问医生的问题并一键复制。', 'yellow'],
    ['/prenatal', '产前检查专项', '超声、无创、羊穿、CMA 与全外显。', 'linen'],
    ['/channels', '找医生与家长经验', '查医院官方渠道、产前与小儿骨科搜索词。', 'green'],
  ]
  return renderLayout(config, null, `
<section class="home-hero" aria-labelledby="home-title">
  <div class="home-hero-copy">
    <h1 id="home-title">足内翻家庭指南</h1>
    <p>从第一次看到报告，到治疗和随访。按当前阶段查资料，记录每一步。</p>
    <form class="search-form home-search" action="${base}/search" method="get" role="search">
      <label class="visually-hidden" for="home-keyword">搜索资料</label>
      <span class="search-symbol" aria-hidden="true"></span>
      <input id="home-keyword" class="search-input" type="search" name="keyword" maxlength="100" placeholder="超声、石膏、支具" required />
      <button class="btn" type="submit">搜索资料</button>
    </form>
    <div class="quick-search" aria-label="快捷搜索">
      ${['超声复查', '石膏', '支具'].map(term => `<a href="${base}/search?keyword=${encodeURIComponent(term)}">${term}</a>`).join('')}
      <a class="home-tool-link" href="${base}/tools/brace-followup">记穿戴 <span class="arrow" aria-hidden="true"></span></a>
    </div>
  </div>
  <div class="home-hero-media"><img src="${base}/assets/first-steps.webp" alt="" width="960" height="640" fetchpriority="high" /></div>
</section>
<section class="home-section" aria-labelledby="home-stages">
  <header class="section-heading"><h2 id="home-stages">你现在在哪个阶段？</h2><a class="text-link" href="${base}/stages">全部阶段 <span class="arrow" aria-hidden="true"></span></a></header>
  ${renderStageGrid(stages, base)}
</section>
<section class="home-section" aria-labelledby="home-tools">
  <header class="section-heading"><h2 id="home-tools">家庭工具</h2><a class="text-link" href="${base}/tools">全部工具 <span class="arrow" aria-hidden="true"></span></a></header>
  <div class="quick-tools">${tools.map(([href, title, caption, color]) => `
    <a class="quick-tool quick-tool--${color}" href="${base}${href}"><strong>${title}</strong><span>${caption}</span><span class="arrow" aria-hidden="true"></span></a>`).join('')}</div>
</section>
<section class="home-section" aria-labelledby="home-resources">
  <header class="section-heading"><h2 id="home-resources">近期整理资料</h2><a class="text-link" href="${base}/resources">查看资料库 <span class="arrow" aria-hidden="true"></span></a></header>
  ${recent}
</section>
${topics}${posts}`, '/')
}

function renderUnavailableResources(basePath: string): string {
  return `<p class="warn-bar">在线资料暂时无法加载。可以先查看<a href="${basePath}/prenatal">产前检查</a>和<a href="${basePath}/tools">家庭工具</a>。</p>`
}

function routeKey(path: string, prefix: string) {
  try {
    const key = decodeURIComponent(path.slice(prefix.length))
    return key && !/[\x00-\x1f/]/.test(key) ? key : ''
  } catch {
    return ''
  }
}

function renderFilterBar(basePath: string, selectedType: string, extraQuery = ''): string {
  return `<div class="filter-bar">${TYPES.map((t) => {
    const params = new URLSearchParams(extraQuery)
    if (t.key) params.set('type', t.key)
    else params.delete('type')
    const qs = params.toString()
    const href = qs ? `${basePath}?${qs}` : basePath
    const cls = selectedType === t.key ? ' class="active" aria-current="true"' : ''
    return `<a href="${escapeHtml(href)}"${cls}>${t.label}</a>`
  }).join('')}</div>`
}

function renderStageFilterBar(basePath: string, selectedStage: string, extraQuery = ''): string {
  const items = [
    { key: '', label: '全部阶段' },
    ...listStageGuides().map(s => ({ key: s.key, label: s.shortLabel })),
  ]
  return `<nav class="filter-bar stage-filter-bar" aria-label="按阶段筛选">${items.map((s) => {
    const params = new URLSearchParams(extraQuery)
    if (s.key) params.set('stage', s.key)
    else params.delete('stage')
    const qs = params.toString()
    const href = qs ? `${basePath}?${qs}` : basePath
    const cls = selectedStage === s.key ? ' class="active" aria-current="true"' : ''
    return `<a href="${escapeHtml(href)}"${cls}>${escapeHtml(s.label)}</a>`
  }).join('')}</nav>`
}

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

function renderPagination<T>(path: string, result: PageResult<T>, query: URLSearchParams) {
  const hasNext = result.page * result.size < result.total
  if (result.page <= 1 && !hasNext) return ''
  const link = (page: number, label: string) => {
    const params = new URLSearchParams(query)
    params.set('page', String(page))
    return `<a href="${escapeHtml(`${path}?${params}`)}">${label}</a>`
  }
  return `<nav aria-label="分页" class="pagination">
    ${result.page > 1 ? link(result.page - 1, '上一页') : '<span></span>'}
    <span>第 ${result.page} 页</span>
    ${hasNext ? link(result.page + 1, '下一页') : '<span></span>'}
  </nav>`
}

function cleanExcerpt(title: string, excerpt?: string | null): string {
  const raw = (excerpt || '').trim()
  if (!raw) return ''
  const cleanTitle = title.trim()
  if (cleanTitle && raw.startsWith(cleanTitle)) {
    return raw.slice(cleanTitle.length).replace(/^[\s:：—\-·]+/, '').trim()
  }
  return raw
}

function renderGuideCard(guide: PostSummary, basePath: string, heading: 'h2' | 'h3' = 'h2') {
  const excerpt = cleanExcerpt(guide.title, guide.excerpt)
  return `<article class="card"><${heading} class="card-title"><a href="${basePath}/posts/${encodeURIComponent(guide.name)}">${escapeHtml(guide.title)}</a></${heading}>${excerpt ? `<p class="card-intro">${escapeHtml(excerpt)}</p>` : ''}${guide.author ? `<div class="meta-row">${escapeHtml(guide.author)}</div>` : ''}</article>`
}

async function renderRelated(resource: ResourceView, client: BackendClient, config: WebConfig) {
  const tag = resource.tags?.[0]
  const stage = resource.stages?.[0]
  if (resource.linkStatus === 'SOURCE_RETRACTED' || (!tag && !stage)) return ''
  try {
    const { items } = await client.listResources({ tag, stage: tag ? undefined : stage, size: 4 })
    const cards = items.filter(item => item.name !== resource.name && item.linkStatus !== 'SOURCE_RETRACTED')
      .slice(0, 3).map(item => renderCard(item, config)).join('')
    return cards ? `<h2>还可以了解</h2><div class="card-list">${cards}</div>` : ''
  } catch {
    return ''
  }
}

function renderResourceDetail(r: ResourceView, config: WebConfig): string {
  const citationUrl = safeHttpUrl(r.citationUrl)
  const originUrl = r.entry.type === 'WEB' || r.entry.type === 'MP_ARTICLE'
    ? safeHttpUrl(r.entry.url) : null
  const orig =
    r.originalTitle && r.originalTitle !== r.title
      ? `<p class="card-orig-title">原标题：${escapeHtml(r.originalTitle)}</p>`
      : ''

  let statusNotice = ''
  if (r.linkStatus === 'SOURCE_RETRACTED') {
    statusNotice =
      '<div class="warn-bar">该资料原文已被原站撤回或下线，已暂停正常推荐；仅保留题录核查记录。</div>'
  } else if (r.linkStatus === 'NEEDS_RECHECK') {
    statusNotice = '<div class="warn-bar">原文目前不可访问，稍后复核。以下保留原始出处信息供核对。</div>'
  }

  const downloadUrl = r.linkStatus === 'OK' ? safeHttpUrl(r.attachment?.url) : null
  const attachmentLink = downloadUrl?.startsWith('https://') && r.attachment
    ? `<p class="meta-row"><a href="${escapeHtml(downloadUrl)}" target="_blank" rel="noopener noreferrer">下载附件 · ${escapeHtml(r.attachment.fileName)}</a></p>`
    : ''
  const citationParts = [
    r.title,
    `来源：${r.sourceName}`,
    r.author ? `作者/机构：${r.author}` : '',
    citationUrl ? `链接：${citationUrl}` : '',
    r.doi ? `DOI：${r.doi}` : '',
    r.pmid ? `PMID：${r.pmid}` : '',
  ].filter(Boolean)
  const citationText = citationParts.join('\n')

  const actionRow = `<div class="action-bar" style="margin-top:14px">
    ${r.linkStatus === 'OK' && originUrl ? `<a class="btn" href="${escapeHtml(originUrl)}" target="_blank" rel="noopener noreferrer">前往原站阅读（${escapeHtml(r.sourceName)}）</a>` : ''}
    <button class="btn btn-outline" type="button" data-copy-text="${escapeHtml(citationText)}" data-copy-ok="已复制原文出处信息，可粘贴查阅或发给家人。" data-status-id="resource-copy-status">复制原文出处</button>
  </div>
  <p id="resource-copy-status" class="action-status" role="status" aria-live="polite"></p>`
  const urlLine = citationUrl
    ? `<p class="meta-row" style="margin-top:10px;word-break:break-all"><span>原始出处链接：${escapeHtml(citationUrl)}</span></p>`
    : ''

  return `<p><a href="${config.siteBasePath}/resources">← 返回资料库</a></p>
<article class="card">
  <div class="meta-row" style="margin-bottom:8px">
    <span class="badge">${materialLabel(r.materialType)}</span>
    <span class="badge">${accessLabel(r.access)}</span>
  </div>
  <h1 class="card-title" style="font-size:1.35rem">${escapeHtml(r.title)}</h1>
  ${orig}
  <div class="notice-bar"><strong>本站独立介绍：</strong>${escapeHtml(r.intro)}</div>
  <div class="meta-row" style="margin-bottom:14px">
    <span>来源站名：<strong>${escapeHtml(r.sourceName)}</strong></span>
    ${r.author ? `<span>作者/机构：${escapeHtml(r.author)}</span>` : ''}
    <span>原文发布日期：${r.publishedDate ? escapeHtml(r.publishedDate) : '未注明'}</span>
    ${r.lastVerifiedDate ? `<span>最后核对日期：${escapeHtml(r.lastVerifiedDate)}</span>` : ''}
    ${r.doi ? `<span>DOI：${escapeHtml(r.doi)}</span>` : ''}
    ${r.pmid ? `<span>PMID：${escapeHtml(r.pmid)}</span>` : ''}
    ${r.storyContext ? `<span>经历背景：${escapeHtml(r.storyContext)}</span>` : ''}
  </div>
  ${statusNotice}
  ${actionRow}
  ${attachmentLink}
  ${urlLine}
  <p class="meta-row" style="margin-top:16px">发现来源失效、错误或版权问题？<a href="${config.siteBasePath}/feedback?category=ISSUE&amp;resource=${encodeURIComponent(r.name)}">提交勘误</a> · <a href="${config.siteBasePath}/about?resource=${encodeURIComponent(r.name)}#feedback">版权与撤回联系</a></p>
</article>
<script src="${config.siteBasePath}/tools/page-actions.js" integrity="${pageActionsHash}" defer></script>`
}

export async function handleRequest(
  rawUrl: string,
  client: BackendClient,
  config: WebConfig,
): Promise<RouteResponse> {
  const url = new URL(rawUrl, 'http://localhost')
  const basePath = config.siteBasePath
  if (url.pathname === '/robots.txt') {
    const sitemapLine = config.siteOrigin ? `\nSitemap: ${config.siteOrigin}${basePath}/sitemap.xml` : ''
    return {
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: `User-agent: *\nAllow: ${basePath}/${sitemapLine}\n`,
    }
  }
  if (url.pathname === '/favicon.ico') {
    return { status: 200, contentType: 'image/png', body: LOGO_PNG, cacheControl: 'public, max-age=86400' }
  }
  if (basePath === '/xiaojiaoya' && (url.pathname === '/wanwan' || url.pathname.startsWith('/wanwan/'))) {
    return {
      status: 308, contentType: 'text/plain; charset=utf-8', body: '',
      location: `${basePath}${url.pathname.slice('/wanwan'.length) || '/'}${url.search}`,
    }
  }
  if (basePath && url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) {
    return notFoundResponse(config)
  }
  const path = url.pathname.slice(basePath.length).replace(/\/+$/, '') || '/'
  const renderPage = (title: string, body: string) => renderLayout(config, title, body, path)
  const requestedPage = Number(url.searchParams.get('page'))
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const selectedType = (url.searchParams.get('type') || '').trim().toUpperCase()
  const selectedTag = (url.searchParams.get('tag') || '').trim().slice(0, 50)
  const stageFilter = (url.searchParams.get('stage') || '').trim().toUpperCase()
  const query = new URLSearchParams(url.searchParams)
  query.delete('page')

  if (path === '/healthz') {
    return { status: 200, contentType: 'text/plain; charset=utf-8', body: 'ok' }
  }

  if (path === '/feedback') {
    return renderFeedback(config, {
      sent: url.searchParams.get('sent') === '1',
      category: (url.searchParams.get('category') || '').trim().toUpperCase() || undefined,
      resource: (url.searchParams.get('resource') || '').trim().slice(0, 120) || undefined,
    })
  }

  if (path === '/tools') return { ...htmlResponse(200, renderTools(config)), toolsScript: true }

  if (path === '/tools/preparation') {
    const stageKey = (url.searchParams.get('stage') || '').trim().toUpperCase()
    return { ...htmlResponse(200, renderPreparation(config, stageKey, pageActionsHash)), scriptHash: pageActionsHash }
  }

  if (path === '/channels') {
    const channelType = (url.searchParams.get('type') || 'doctor').trim().toLowerCase()
    const channelPeriod = (url.searchParams.get('period') || 'postnatal').trim().toLowerCase()
    return { ...htmlResponse(200, renderChannels(config, channelType, channelPeriod, pageActionsHash)), scriptHash: pageActionsHash }
  }

  if (path === '/tools/brace-followup') {
    return { ...htmlResponse(200, renderBraceDashboard(config)), scriptHash: braceScriptHash }
  }
  if (path === '/tools/brace-dashboard.js') {
    return { status: 200, contentType: 'text/javascript; charset=utf-8', body: braceScript, cacheControl: 'public, max-age=3600' }
  }

  if (path === '/tools/appointment.js') {
    return { status: 200, contentType: 'text/javascript; charset=utf-8', body: appointmentScript, cacheControl: 'public, max-age=3600' }
  }

  if (path === '/tools/page-actions.js') {
    return { status: 200, contentType: 'text/javascript; charset=utf-8', body: pageActionsScript, cacheControl: 'public, max-age=3600' }
  }

  if (path === '/prenatal' || path.startsWith('/prenatal/')) {
    const key = path === '/prenatal' ? undefined : routeKey(path, '/prenatal/')
    if (key === '') return notFoundResponse(config)
    const prenatalQuery = key ? '' : (url.searchParams.get('q') || '')
    const html = renderPrenatal(config, key, prenatalQuery)
    if (!html) return notFoundResponse(config)
    return key ? { ...htmlResponse(200, html), scriptHash: pageActionsHash } : htmlResponse(200, html)
  }

  if (path === '/downloads/clubfoot-ultrasound-checklist.pdf') {
    return {
      status: 200, contentType: 'application/pdf', body: CHECKLIST_PDF,
      contentDisposition: "attachment; filename=clubfoot-ultrasound-checklist.pdf",
      cacheControl: 'public, max-age=3600',
    }
  }

  if (path === '/assets/first-steps.webp') {
    return {
      status: 200, contentType: 'image/webp', body: HOME_PHOTO,
      cacheControl: 'public, max-age=86400',
    }
  }

  if (path === '/assets/logo.png' || path === '/favicon.ico') {
    return {
      status: 200,
      contentType: 'image/png',
      body: LOGO_PNG,
      cacheControl: 'public, max-age=86400',
    }
  }

  if (path === '/robots.txt') {
    const sitemapLine = config.siteOrigin ? `\nSitemap: ${config.siteOrigin}${basePath}/sitemap.xml` : ''
    return {
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: `User-agent: *\nAllow: ${basePath}/${sitemapLine}\n`,
    }
  }

  if (path === '/sitemap.xml') {
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
    const base = `${config.siteOrigin}${basePath}`
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
      ...stages.map((s) => `${base}/stages/${encodeURIComponent(s.key)}`),
      ...resources.map((r) => `${base}/resources/${encodeURIComponent(r.name)}`),
      ...topics.map((t) => `${base}/topics/${encodeURIComponent(t.name)}`),
      ...posts.map((p) => `${base}/posts/${encodeURIComponent(p.name)}`),
    ]
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${escapeHtml(u)}</loc></url>`)
      .join('\n')}\n</urlset>`
    return { status: 200, contentType: 'application/xml; charset=utf-8', body: xml }
  }

  if (path === '/') {
    if (!config.backendApiBase) {
      return htmlResponse(200, renderHome(config, FIXED_STAGES, '',
        '<p class="notice-bar">资料库正在准备中。</p>', ''))
    }
    const [stages, topics, recent, posts] = await Promise.allSettled([
      client.getStages(),
      client.listTopics(1, 3),
      client.listResources({ page: 1, size: 6 }),
      client.listPosts(1, 3),
    ])
    const visibleTopics = topics.status === 'fulfilled' ? topics.value.items.filter(t => t.resourceCount > 0) : []
    const topicHtml = visibleTopics.length
      ? `<section class="home-section"><header class="section-heading"><h2>精选专题</h2><a class="text-link" href="${basePath}/topics">全部专题</a></header><div class="card-list home-grid">${visibleTopics
          .map(t => `<article class="card"><h3 class="card-title"><a href="${basePath}/topics/${encodeURIComponent(t.name)}">${escapeHtml(t.title)}</a></h3><p class="card-intro">${escapeHtml(t.intro)}</p><div class="meta-row">含 ${t.resourceCount} 条资料</div></article>`)
          .join('')}</div></section>`
      : ''
    const recentHtml = recent.status === 'fulfilled'
      ? recent.value.items.length
        ? `<div class="card-list home-grid">${recent.value.items.map(item => renderCard(item, config)).join('')}</div>`
        : '<p class="notice-bar">暂未发布资料。</p>'
      : renderUnavailableResources(basePath)
    const postHtml = posts.status === 'fulfilled' && posts.value.items.length
      ? `<section class="home-section"><header class="section-heading"><h2>本站原创导读</h2><a class="text-link" href="${basePath}/posts">全部导读</a></header><div class="card-list home-grid">${posts.value.items
          .map(p => renderGuideCard(p, basePath, 'h3'))
          .join('')}</div></section>`
      : ''

    return htmlResponse(200, renderHome(config,
      stages.status === 'fulfilled' && stages.value.length ? stages.value : FIXED_STAGES,
      topicHtml, recentHtml, postHtml))
  }

  if (path === '/stages') {
    const stages = await client.getStages().catch(() => FIXED_STAGES)
    return htmlResponse(
      200,
      renderPage('按阶段浏览',
        `<h1>按阶段浏览</h1><p class="notice-bar">阶段只是阅读资料的组织方式，不代表对任何家庭规定检查或治疗路线。</p>${renderStageGrid(stages, basePath)}`,
      ),
    )
  }

  if (path.startsWith('/stages/')) {
    const key = routeKey(path, '/stages/').toUpperCase()
    if (!key) return notFoundResponse(config)
    const stages = await client.getStages().catch(() => FIXED_STAGES)
    const stage = stages.find((s) => s.key === key)
    if (!stage) {
      return notFoundResponse(config)
    }
    const stagePath = `${basePath}/stages/${encodeURIComponent(stage.key)}`
    const [list, posts] = await Promise.all([
      client.listResources({ stage: stage.key, type: selectedType || undefined, tag: selectedTag || undefined, page, size: 20 }).catch(() => null),
      client.listStagePosts(stage.key, 1, 3).catch(() => null),
    ])
    const stageGuides = posts?.items.length
      ? `<section class="stage-guides"><h2>这一阶段的原创导读</h2><div class="card-list">${posts.items.map(guide => renderGuideCard(guide, basePath, 'h3')).join('')}</div>
${posts.total > posts.items.length ? `<a href="${basePath}/posts?stage=${encodeURIComponent(stage.key)}">查看本阶段全部导读</a>` : ''}</section>`
      : ''
    const stageToolsHtml = renderStageToolsSection(stage.key, basePath)
    if (!list) {
      return htmlResponse(200, renderPage(stage.label,
        `<h1>${escapeHtml(stage.label)}</h1>${stageToolsHtml}${stageGuides}${renderUnavailableResources(basePath)}`,
      ))
    }
    const cards = list.items.length
      ? `<div class="card-list">${list.items.map((item) => renderCard(item, config)).join('')}</div>`
      : '<div class="warn-bar">该筛选条件下暂无已公开资料。</div>'
    return htmlResponse(
      200,
      renderPage(stage.label,
        `<h1>${escapeHtml(stage.label)}</h1>
${stageToolsHtml}
<p class="notice-bar">以下为手动核对后收录的公开资料。按编辑推荐阅读顺序排列，不构成个体医学建议。</p>
${stageGuides}
<h2>这一阶段的资料卡</h2>
${renderFilterBar(stagePath, selectedType, query.toString())}
<form class="search-form" action="${stagePath}" method="get">
<input type="hidden" name="type" value="${escapeHtml(selectedType)}" />
<input class="search-input" name="tag" maxlength="50" value="${escapeHtml(selectedTag)}" placeholder="主题标签" aria-label="主题标签" />
<button type="submit" class="btn">筛选</button></form>
${cards}${renderPagination(stagePath, list, query)}`,
      ),
    )
  }

  if (path === '/resources') {
    const list = await client.listResources({
      stage: stageFilter || undefined,
      tag: selectedTag || undefined,
      type: selectedType || undefined,
      page,
      size: 20,
    })
    const showPrenatalBanner = !stageFilter || stageFilter === 'JUST_FOUND' || stageFilter === 'PRENATAL'
    const cards = list.items.length
      ? `<div class="card-list">${list.items.map((item) => renderCard(item, config)).join('')}</div>`
      : '<div class="warn-bar">暂无符合条件的已公开资料。</div>'
    return htmlResponse(
      200,
      renderPage('资料库',
        `<h1>资料库</h1>
${renderStageFilterBar(`${basePath}/resources`, stageFilter, query.toString())}
${showPrenatalBanner ? renderPrenatalBanner(basePath) : ''}
${renderFilterBar(`${basePath}/resources`, selectedType, query.toString())}
${cards}${renderPagination(`${basePath}/resources`, list, query)}`,
      ),
    )
  }

  if (path.startsWith('/resources/')) {
    const name = routeKey(path, '/resources/')
    if (!name) return notFoundResponse(config)
    const r = await client.getResource(name)
    if (!r) return notFoundResponse(config)
    const related = await renderRelated(r, client, config)
    return { ...htmlResponse(200, renderPage(r.title, renderResourceDetail(r, config) + related)), scriptHash: pageActionsHash }
  }

  if (path === '/topics') {
    const list = await client.listTopics(page, 20)
    const body = list.items.length
      ? `<div class="card-list">${list.items
          .map(
            (t) =>
              `<article class="card"><h2 class="card-title"><a href="${basePath}/topics/${encodeURIComponent(t.name)}">${escapeHtml(t.title)}</a></h2><p class="card-intro">${escapeHtml(t.intro)}</p><div class="meta-row">含 ${t.resourceCount} 条资料</div></article>`,
          )
          .join('')}</div>`
      : '<div class="warn-bar">暂无已发布专题。</div>'
    return htmlResponse(200, renderPage('精选专题', `<h1>精选专题</h1>${body}${renderPagination(`${basePath}${path}`, list, query)}`))
  }

  if (path.startsWith('/topics/')) {
    const name = routeKey(path, '/topics/')
    if (!name) return notFoundResponse(config)
    const topic = await client.getTopic(name)
    if (!topic) return notFoundResponse(config)
    const cards = topic.resources.length
      ? `<div class="card-list">${topic.resources.map((item) => renderCard(item, config)).join('')}</div>`
      : '<div class="warn-bar">该专题下暂无可公开资料。</div>'
    return htmlResponse(
      200,
      renderPage(topic.title,
        `<p><a href="${basePath}/topics">← 返回专题列表</a></p><h1>${escapeHtml(topic.title)}</h1><div class="notice-bar">${escapeHtml(topic.intro)}</div>${cards}`,
      ),
    )
  }

  if (path === '/posts') {
    const stage = FIXED_STAGES.find(item => item.key === stageFilter)
    if (stageFilter && !stage) return notFoundResponse(config)
    const title = stage ? stage.label + ' · 原创导读' : '本站原创导读'
    const list = await (stage ? client.listStagePosts(stage.key, page, 20) : client.listPosts(page, 20))
    const body = list.items.length
      ? `<div class="card-list">${list.items.map(guide => renderGuideCard(guide, basePath)).join('')}</div>`
      : '<div class="warn-bar">暂无已发布的原创导读。</div>'
    return htmlResponse(200, renderPage(title, `<h1>${escapeHtml(title)}</h1>${body}${renderPagination(`${basePath}${path}`, list, query)}`))
  }

  if (path.startsWith('/posts/')) {
    const name = routeKey(path, '/posts/')
    if (!name) return notFoundResponse(config)
    const post = await client.getPost(name)
    if (!post) return notFoundResponse(config)
    const dateLine = post.publishTime ? `<span>发布日期：${escapeHtml(post.publishTime.slice(0, 10))}</span>` : ''
    const { html: proseHtml, toc, readingMinutes } = preparePostContent(post.content)
    const tocHtml = toc.length >= 2
      ? `<nav class="post-toc" aria-label="文章目录"><strong>本篇目录</strong><ol>${toc.map(item => `<li class="post-toc--${item.level}"><a href="#${item.id}">${escapeHtml(item.text)}</a></li>`).join('')}</ol></nav>`
      : ''
    return {
      ...htmlResponse(
        200,
        renderPage(post.title,
          `<p><a href="${basePath}/posts">← 返回原创导读</a></p>
<article class="card post-prose">
  <div class="meta-row"><span class="badge">本站原创导读</span><span>约 ${readingMinutes} 分钟阅读</span>${post.author ? `<span>作者 ${escapeHtml(post.author)}</span>` : ''}${dateLine}</div>
  <h1>${escapeHtml(post.title)}</h1>
  <div class="action-bar" style="margin:12px 0">
    <button class="btn btn-outline" type="button" data-copy-url="current" data-copy-prefix="${escapeHtml(`小脚丫步步指南｜${post.title}`)}" data-copy-ok="已复制文章链接，可直接粘贴发给微信好友或家人。" data-status-id="post-share-status">复制文章链接分享给家人</button>
  </div>
  <p id="post-share-status" class="action-status" role="status" aria-live="polite"></p>
  <div class="notice-bar">本文为本站原创导读或使用说明，不替代门诊沟通与专业医学意见。</div>
  ${tocHtml}
  <div class="prose-body">${proseHtml}</div>
</article>
<script src="${basePath}/tools/page-actions.js" integrity="${pageActionsHash}" defer></script>`,
        ),
      ),
      scriptHash: pageActionsHash,
    }
  }

  if (path === '/search') {
    const keyword = (url.searchParams.get('keyword') || '').trim()
    const tooLong = keyword.length > 100
    const [results, stages] = await Promise.all([
      keyword && !tooLong
        ? client.search({ keyword, stage: stageFilter || undefined, type: selectedType || undefined, page, size: 20 }).catch(() => null)
        : null,
      client.getStages().catch(() => FIXED_STAGES),
    ])
    const unavailable = Boolean(keyword && !tooLong && !results)
    const submittedEmpty = !keyword && (url.searchParams.has('keyword') || Boolean(stageFilter) || Boolean(selectedType))
    const prenatalMatches = keyword && !tooLong && (!selectedType || selectedType === 'ORIGINAL') && (!stageFilter || stageFilter === 'PRENATAL' || stageFilter === 'JUST_FOUND')
      ? searchPrenatalGuides(keyword)
      : []
    const prenatalHtml = prenatalMatches.length && page === 1
      ? `<h2>产前检查专项</h2><p class="meta-row">共 ${prenatalMatches.length} 项（本地离线可用）</p><div class="card-list">${prenatalMatches.map(item => `<article class="card"><h3 class="card-title"><a href="${basePath}/prenatal/${encodeURIComponent(item.key)}">${escapeHtml(item.title)}</a></h3><p class="card-intro">${escapeHtml(item.summary)}</p></article>`).join('')}</div>`
      : ''
    let resultHtml = ''
    if (tooLong) {
      resultHtml = '<div class="warn-bar">关键词超过 100 个字符限制，请缩短后重试。</div>'
    } else if (submittedEmpty) {
      resultHtml = `<div class="notice-bar">请输入关键词后再搜索，或直接前往<a href="${basePath}/resources">资料库</a>按类型和阶段浏览。</div>`
    } else if (unavailable) {
      resultHtml = renderUnavailableResources(basePath) + prenatalHtml
    } else if (results) {
      const guideItems = results.guideItems ?? []
      resultHtml = results.items.length
        ? `<h2>公开资料卡</h2><p class="meta-row">共 ${results.total} 条</p><div class="card-list">${results.items.map((item) => renderCard(item, config)).join('')}</div>`
        : ''
      if (guideItems.length) {
        resultHtml += `<h2>本站原创导读</h2><p class="meta-row">共 ${results.guideTotal ?? guideItems.length} 篇</p><div class="card-list">${guideItems.map(guide => renderGuideCard(guide, basePath, 'h3')).join('')}</div>`
      }
      if (prenatalHtml) {
        resultHtml += prenatalHtml
      }
      if (!resultHtml) {
        resultHtml = `<div class="warn-bar">本页没有匹配「${escapeHtml(keyword)}」的已公开内容。可以更换关键词，或<a href="${basePath}/stages">按阶段浏览</a>。</div>`
      }
      resultHtml += renderPagination(`${basePath}/search`, { ...results, total: Math.max(results.total, results.guideTotal ?? 0) }, query)
    }
    return htmlResponse(
      unavailable ? 503 : 200,
      renderPage('站内搜索',
        `<h1>站内搜索</h1>
<p class="meta-row">搜索公开资料卡的题录、来源和标签，也可搜索本站原创导读的标题和摘要。</p>
<form class="card search-panel" action="${basePath}/search" method="get" role="search">
  <label for="keyword">关键词</label>
  <input id="keyword" class="search-input" type="search" name="keyword" maxlength="100" value="${escapeHtml(keyword)}" placeholder="例如：超声复查、石膏、支具" />
  <div class="search-options">
  <label>阶段<select class="search-input" name="stage"><option value="">全部阶段</option>
    ${stages.map(s => `<option value="${escapeHtml(s.key)}"${stageFilter === s.key ? ' selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
  </select></label>
  <label>资料类型<select class="search-input" name="type">
    ${TYPES.map(t => `<option value="${t.key}"${selectedType === t.key ? ' selected' : ''}>${t.label}</option>`).join('')}
  </select></label>
  <button class="btn" type="submit">搜索</button>
  </div>
</form>
${resultHtml}`,
      ),
    )
  }

  if (path === '/about') {
    const resourceName = (url.searchParams.get('resource') || '').trim().slice(0, 253)
    const contactBlock = config.contactEmail
      ? `<p>联系邮箱：<strong>${escapeHtml(config.contactEmail)}</strong></p>`
      : '<p class="warn-bar">运营者尚未配置联系邮箱，请在正式公开前通过环境变量 CONTACT_EMAIL 填写真实可用联系方式。</p>'
    return htmlResponse(
      200,
      renderPage('关于与规则',
        `<h1>关于本站与收录规则</h1>
<div class="card" style="margin-bottom:14px">
  <h2>运营者身份与定位</h2>
  <p>${escapeHtml(config.aboutOperator)}</p>
  <p>本站定位为阶段式公开资料导航：帮助家庭定位可核对的机构资料、研究题录与家庭经历，点击前往合法原站阅读。不提供医学诊断、预后判断、个体诊疗方案或在线问答。</p>
</div>
<div class="card" style="margin-bottom:14px">
  <h2>收录与编辑方法</h2>
  <p>所有资料由运营者逐篇查看原始页面后手动录入：保留原标题与来源信息、独立撰写简短介绍，并提供合法原文入口。不自动采集第三方正文，不复制论文摘要或配图，不提供盗版下载或绕过付费墙入口。</p>
</div>
<div class="card" style="margin-bottom:14px">
  <h2 id="feedback">版权、勘误与撤回联系</h2>
  ${resourceName ? `<p>反馈资料编号 <code>${escapeHtml(resourceName)}</code></p>` : ''}
  <p>若您发现资料来源失效、介绍有误，或认为收录内容涉及版权或隐私问题，请联系运营者。收到有效通知后将先行暂停相关展示并核查处理。</p>
  <p><a href="${basePath}/downloads/clubfoot-ultrasound-checklist.pdf">下载足内翻超声复查清单（PDF）</a></p>
  ${contactBlock}
</div>
<div class="card">
  <h2>隐私与维护说明</h2>
  <p><a href="${basePath}/feedback">提交功能建议</a>。建议内容与提交渠道仅供运营人员查看，用于改进产品。</p>
  <p>公开浏览与搜索无需注册。Web 的日历工具在本机生成文件。小程序的石膏记录开通后，由本人或孩子的监护人单独授权，再加密保存手填记录。微信提醒另行授权，可在小程序取消提醒、删除记录或撤回同意。病历、检查报告和遗传资料没有上传入口。</p>
  <p>服务器保留保障运行所需的访问日志，默认省去完整搜索词。</p>
  <p>${escapeHtml(config.maintenanceStatus)}</p>
</div>`,
      ),
    )
  }

  return notFoundResponse(config)
}

function notFoundResponse(config: WebConfig): RouteResponse {
  return htmlResponse(
    404,
    renderLayout(
      config,
      '内容不存在或已下线',
      `<div class="warn-bar"><h1>内容不存在或已停用</h1><p>您访问的资料卡、专题或页面未找到，可能尚未发布或已按核查要求撤回下线。</p><p><a href="${config.siteBasePath}/">返回首页</a> · <a href="${config.siteBasePath}/stages">按阶段浏览</a></p></div>`,
    ),
  )
}
