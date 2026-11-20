import { readFileSync } from 'node:fs'
import type { BackendClient, PageResult, ResourceView } from './api.js'
import type { WebConfig } from './config.js'
import { appointmentScript, prenatalPaths, renderPrenatal, renderTools } from './tools.js'
import {
  accessLabel,
  escapeHtml,
  materialLabel,
  renderCard,
  renderLayout,
  safeHttpUrl,
  sanitizePostHtml,
} from './html.js'

const LOGO_PNG = readFileSync(new URL('../public/logo.png', import.meta.url))
const CHECKLIST_PDF = readFileSync(new URL('../public/downloads/clubfoot-ultrasound-checklist.pdf', import.meta.url))

export interface RouteResponse {
  status: number
  contentType: string
  body: string | Buffer
  cacheControl?: string
  location?: string
  contentDisposition?: string
  toolsScript?: boolean
}

const TYPES = [
  { key: '', label: '全部类型' },
  { key: 'INSTITUTION', label: '机构资料' },
  { key: 'PAPER', label: '论文题录' },
  { key: 'FAMILY_STORY', label: '家庭经历' },
  { key: 'ORIGINAL', label: '本站原创' },
]

function htmlResponse(status: number, body: string): RouteResponse {
  return { status, contentType: 'text/html; charset=utf-8', body }
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
    const cls = selectedType === t.key ? ' class="active"' : ''
    return `<a href="${escapeHtml(href)}"${cls}>${t.label}</a>`
  }).join('')}</div>`
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
  const originBtn =
    r.linkStatus === 'OK' && originUrl
      ? `<div style="margin-top:14px"><a class="btn" href="${escapeHtml(originUrl)}" target="_blank" rel="noopener noreferrer">前往原站阅读（${escapeHtml(r.sourceName)}）</a></div>`
      : ''
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
  ${originBtn}
  ${attachmentLink}
  ${urlLine}
  <p class="meta-row" style="margin-top:16px">发现来源失效、错误或版权问题？请查看<a href="${config.siteBasePath}/about?resource=${encodeURIComponent(r.name)}#feedback">提交勘误</a>。</p>
</article>`
}

export async function handleRequest(
  rawUrl: string,
  client: BackendClient,
  config: WebConfig,
): Promise<RouteResponse> {
  const url = new URL(rawUrl, 'http://localhost')
  const basePath = config.siteBasePath
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

  if (path === '/tools') return { ...htmlResponse(200, renderTools(config)), toolsScript: true }

  if (path === '/tools/appointment.js') {
    return { status: 200, contentType: 'text/javascript; charset=utf-8', body: appointmentScript }
  }

  if (path === '/prenatal' || path.startsWith('/prenatal/')) {
    const key = path === '/prenatal' ? undefined : routeKey(path, '/prenatal/')
    if (key === '') return notFoundResponse(config)
    const html = renderPrenatal(config, key)
    return html ? htmlResponse(200, html) : notFoundResponse(config)
  }

  if (path === '/downloads/clubfoot-ultrasound-checklist.pdf') {
    return {
      status: 200, contentType: 'application/pdf', body: CHECKLIST_PDF,
      contentDisposition: "attachment; filename=clubfoot-ultrasound-checklist.pdf",
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
    const [stages, resources, topics, posts] = await Promise.all([
      client.getStages(),
      client.listResources({ page: 1, size: 50 }),
      client.listTopics(1, 50),
      client.listPosts(1, 50),
    ])
    const base = `${config.siteOrigin}${basePath}`
    const urls = [
      `${base}/`,
      `${base}/stages`,
      `${base}/resources`,
      `${base}/topics`,
      `${base}/posts`,
      `${base}/about`,
      `${base}/tools`,
      ...prenatalPaths.map(path => base + path),
      ...stages.map((s) => `${base}/stages/${encodeURIComponent(s.key)}`),
      ...resources.items.map((r) => `${base}/resources/${encodeURIComponent(r.name)}`),
      ...topics.items.map((t) => `${base}/topics/${encodeURIComponent(t.name)}`),
      ...posts.items.map((p) => `${base}/posts/${encodeURIComponent(p.name)}`),
    ]
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${escapeHtml(u)}</loc></url>`)
      .join('\n')}\n</urlset>`
    return { status: 200, contentType: 'application/xml; charset=utf-8', body: xml }
  }

  if (path === '/' && !config.backendApiBase) {
    return htmlResponse(
      200,
      renderLayout(
        config,
        null,
        `<h1>${escapeHtml(config.siteTitle)}</h1>
<p>为关注足内翻的家庭整理机构资料、论文题录和家庭经历。</p>
<p class="notice-bar">资料库正在准备中。您可以先查看<a href="${basePath}/about">本站的收录规则</a>。</p>`,
      ),
    )
  }

  if (path === '/') {
    const [stages, topics, recent, posts] = await Promise.all([
      client.getStages(),
      client.listTopics(1, 4),
      client.listResources({ page: 1, size: 6 }),
      client.listPosts(1, 4),
    ])
    const stageHtml = stages
      .map(
        (s) =>
          `<a class="stage-card" href="${basePath}/stages/${encodeURIComponent(s.key)}"><div class="stage-order">阶段 ${s.order + 1}</div><div class="stage-name">${escapeHtml(s.label)}</div></a>`,
      )
      .join('')
    const topicHtml = topics.items.length
      ? `<h2>精选专题</h2><div class="card-list">${topics.items
          .map(
            (t) =>
              `<article class="card"><h3 class="card-title"><a href="${basePath}/topics/${encodeURIComponent(t.name)}">${escapeHtml(t.title)}</a></h3><p class="card-intro">${escapeHtml(t.intro)}</p><div class="meta-row">含 ${t.resourceCount} 条资料</div></article>`,
          )
          .join('')}</div>`
      : ''
    const recentHtml = recent.items.length
      ? `<div class="card-list">${recent.items.map((item) => renderCard(item, config)).join('')}</div>`
      : '<div class="warn-bar">暂未发布资料卡。运营者核对收录后将陆续公开。</div>'
    const postHtml = posts.items.length
      ? `<h2>本站原创导读</h2><div class="card-list">${posts.items
          .map(
            (p) =>
              `<article class="card"><h3 class="card-title"><a href="${basePath}/posts/${encodeURIComponent(p.name)}">${escapeHtml(p.title)}</a></h3><p class="card-intro">${escapeHtml(p.excerpt)}</p>${p.author ? `<div class="meta-row">${escapeHtml(p.author)}</div>` : ''}</article>`,
          )
          .join('')}</div>`
      : ''

    return htmlResponse(
      200,
      renderLayout(
        config,
        null,
        `<div class="notice-bar">面向产前发现胎儿疑似足内翻的家庭：按阶段整理的公开资料导航。本页展示题录、来源与本站自写介绍，点击资料可前往合法原站阅读。不提供医学诊断或替代门诊沟通。</div>
<form class="search-form" action="${basePath}/search" method="get">
  <input class="search-input" type="search" name="keyword" maxlength="100" placeholder="搜索已收录资料标题、介绍或来源..." aria-label="搜索关键词" />
  <button class="btn" type="submit">搜索</button>
</form>
<h2>按阶段开始浏览</h2>
<div class="stage-grid">${stageHtml}</div>
${topicHtml}
<h2>近期整理资料</h2>
${recentHtml}
${postHtml}`,
      ),
    )
  }

  if (path === '/stages') {
    const stages = await client.getStages()
    const grid = stages
      .map(
        (s) =>
          `<a class="stage-card" href="${basePath}/stages/${encodeURIComponent(s.key)}"><div class="stage-order">阶段 ${s.order + 1}</div><div class="stage-name">${escapeHtml(s.label)}</div></a>`,
      )
      .join('')
    return htmlResponse(
      200,
      renderLayout(
        config,
        '按阶段浏览',
        `<h1>按阶段浏览</h1><p class="notice-bar">阶段只是阅读资料的组织方式，不代表对任何家庭规定检查或治疗路线。</p><div class="stage-grid">${grid}</div>`,
      ),
    )
  }

  if (path.startsWith('/stages/')) {
    const key = routeKey(path, '/stages/').toUpperCase()
    if (!key) return notFoundResponse(config)
    const stages = await client.getStages()
    const stage = stages.find((s) => s.key === key)
    if (!stage) {
      return notFoundResponse(config)
    }
    const stagePath = `${basePath}/stages/${encodeURIComponent(stage.key)}`
    const list = await client.listResources({ stage: stage.key, type: selectedType || undefined, tag: selectedTag || undefined, page, size: 20 })
    const cards = list.items.length
      ? `<div class="card-list">${list.items.map((item) => renderCard(item, config)).join('')}</div>`
      : '<div class="warn-bar">该筛选条件下暂无已公开资料。</div>'
    return htmlResponse(
      200,
      renderLayout(
        config,
        stage.label,
        `<h1>${escapeHtml(stage.label)}</h1>
<p class="notice-bar">以下为手动核对后收录的公开资料。按编辑推荐阅读顺序排列，不构成个体医学建议。</p>
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
    const cards = list.items.length
      ? `<div class="card-list">${list.items.map((item) => renderCard(item, config)).join('')}</div>`
      : '<div class="warn-bar">暂无符合条件的已公开资料。</div>'
    return htmlResponse(
      200,
      renderLayout(
        config,
        '资料库',
        `<h1>资料库</h1>${renderFilterBar(`${basePath}/resources`, selectedType, query.toString())}${cards}${renderPagination(`${basePath}/resources`, list, query)}`,
      ),
    )
  }

  if (path.startsWith('/resources/')) {
    const name = routeKey(path, '/resources/')
    if (!name) return notFoundResponse(config)
    const r = await client.getResource(name)
    if (!r) return notFoundResponse(config)
    const related = await renderRelated(r, client, config)
    return htmlResponse(200, renderLayout(config, r.title, renderResourceDetail(r, config) + related))
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
    return htmlResponse(200, renderLayout(config, '精选专题', `<h1>精选专题</h1>${body}${renderPagination(`${basePath}${path}`, list, query)}`))
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
      renderLayout(
        config,
        topic.title,
        `<p><a href="${basePath}/topics">← 返回专题列表</a></p><h1>${escapeHtml(topic.title)}</h1><div class="notice-bar">${escapeHtml(topic.intro)}</div>${cards}`,
      ),
    )
  }

  if (path === '/posts') {
    const list = await client.listPosts(page, 20)
    const body = list.items.length
      ? `<div class="card-list">${list.items
          .map(
            (p) =>
              `<article class="card"><h2 class="card-title"><a href="${basePath}/posts/${encodeURIComponent(p.name)}">${escapeHtml(p.title)}</a></h2><p class="card-intro">${escapeHtml(p.excerpt)}</p>${p.author ? `<div class="meta-row">${escapeHtml(p.author)}</div>` : ''}</article>`,
          )
          .join('')}</div>`
      : '<div class="warn-bar">暂无已发布的原创导读。</div>'
    return htmlResponse(200, renderLayout(config, '本站原创导读', `<h1>本站原创导读</h1>${body}${renderPagination(`${basePath}${path}`, list, query)}`))
  }

  if (path.startsWith('/posts/')) {
    const name = routeKey(path, '/posts/')
    if (!name) return notFoundResponse(config)
    const post = await client.getPost(name)
    if (!post) return notFoundResponse(config)
    const dateLine = post.publishTime ? `<span>发布日期：${escapeHtml(post.publishTime.slice(0, 10))}</span>` : ''
    return htmlResponse(
      200,
      renderLayout(
        config,
        post.title,
        `<p><a href="${basePath}/posts">← 返回原创导读</a></p>
<article class="card">
  <div class="meta-row" style="margin-bottom:6px"><span class="badge">本站原创导读</span>${post.author ? `<span>作者 ${escapeHtml(post.author)}</span>` : ''}${dateLine}</div>
  <h1>${escapeHtml(post.title)}</h1>
  <div class="notice-bar">本文为本站原创导读或使用说明，不替代门诊沟通与专业医学意见。</div>
  <div>${sanitizePostHtml(post.content)}</div>
</article>`,
      ),
    )
  }

  if (path === '/search') {
    const keyword = (url.searchParams.get('keyword') || '').trim()
    const tooLong = keyword.length > 100
    let resultHtml = ''
    if (tooLong) {
      resultHtml = '<div class="warn-bar">关键词超过 100 个字符限制，请缩短后重试。</div>'
    } else if (keyword) {
      const results = await client.search({ keyword, stage: stageFilter || undefined, type: selectedType || undefined, page, size: 20 })
      resultHtml = results.items.length
        ? `<p class="meta-row">共找到 ${results.total} 条匹配资料</p><div class="card-list">${results.items.map((item) => renderCard(item, config)).join('')}</div>`
        : `<div class="warn-bar">没有找到匹配「${escapeHtml(keyword)}」的已公开资料。您可以尝试更换关键词，或<a href="${basePath}/stages">按阶段浏览</a>。</div>`
      resultHtml += renderPagination(`${basePath}/search`, results, query)
    }
    const stages = await client.getStages().catch(() => [])
    return htmlResponse(
      200,
      renderLayout(
        config,
        '站内搜索',
        `<h1>站内搜索</h1>
<p class="meta-row">仅搜索本站已发布资料卡的题录、本站介绍、来源与标签，不联网抓取原文，也不使用 AI 生成回答。</p>
<form class="search-form" action="${basePath}/search" method="get">
  <input class="search-input" type="search" name="keyword" maxlength="100" value="${escapeHtml(keyword)}" placeholder="输入关键词（最多 100 字符）..." aria-label="搜索关键词" />
  <input type="hidden" name="stage" value="${escapeHtml(stageFilter)}" />
  <input type="hidden" name="type" value="${escapeHtml(selectedType)}" />
  <button class="btn" type="submit">搜索</button>
</form>
<form class="search-form" action="${basePath}/search" method="get">
  <input type="hidden" name="keyword" value="${escapeHtml(keyword)}" />
  <select class="search-input" name="stage" aria-label="阶段"><option value="">全部阶段</option>
    ${stages.map(s => `<option value="${escapeHtml(s.key)}"${stageFilter === s.key ? ' selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
  </select>
  <select class="search-input" name="type" aria-label="资料类型">
    ${TYPES.map(t => `<option value="${t.key}"${selectedType === t.key ? ' selected' : ''}>${t.label}</option>`).join('')}
  </select>
  <button class="btn" type="submit">筛选</button>
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
      renderLayout(
        config,
        '关于与规则',
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
