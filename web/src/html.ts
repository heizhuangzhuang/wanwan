import { readFileSync } from 'node:fs'
import sanitizeHtml from 'sanitize-html'
import type { ResourceView } from './api.js'
import type { WebConfig } from './config.js'

const MATERIAL_LABELS: Record<string, string> = {
  INSTITUTION: '机构资料',
  PAPER: '论文题录',
  FAMILY_STORY: '家庭经历',
  ORIGINAL: '本站原创',
}

const ACCESS_LABELS: Record<string, string> = {
  OPEN: '公开可读',
  LOGIN_REQUIRED: '原站需要登录',
  MAY_BE_PAID: '原站可能付费',
  UNKNOWN: '访问条件未确认',
}

export function escapeHtml(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url || url.length > 2048) return null
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname || parsed.username || parsed.password) return null
    return parsed.toString()
  } catch {
    return null
  }
}

const EXCLUDED_POST_TAGS = new Set(['main', 'header', 'footer', 'nav', 'aside'])

/** 只渲染原创导读中需要的排版、图片与出处链接。 */
export function sanitizePostHtml(html: string | null | undefined): string {
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
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, loading: 'lazy', decoding: 'async' },
      }),
    },
    allowedSchemes: ['http', 'https'],
    allowProtocolRelative: false,
    nonTextTags: ['script', 'style', 'textarea', 'option', 'iframe', 'object', 'template', 'svg', 'math'],
  })
}

export function materialLabel(type: string): string {
  return MATERIAL_LABELS[type] ?? '资料'
}

export function accessLabel(access: string): string {
  return ACCESS_LABELS[access] ?? '访问条件未确认'
}

const CSS = readFileSync(new URL('../public/site.css', import.meta.url), 'utf8')

const NAV = [
  ['/', '首页'], ['/stages', '按阶段'], ['/prenatal', '产前检查'],
  ['/tools', '家庭工具'], ['/resources', '资料库'],
]

export function renderLayout(config: WebConfig, title: string | null, bodyHtml: string, path = ''): string {
  const fullTitle = title ? `${escapeHtml(title)} - ${escapeHtml(config.siteTitle)}` : escapeHtml(config.siteTitle)
  const base = config.siteBasePath
  const current = (href: string) => href === path || (href !== '/' && path.startsWith(href + '/'))
  const contact = config.contactEmail
    ? ` · 联系邮箱：${escapeHtml(config.contactEmail)}`
    : ''
  const icp = config.icpNumber
    ? ` · <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">${escapeHtml(config.icpNumber)}</a>`
    : ''

  const robotsMeta = path === '/search' ? '\n  <meta name="robots" content="noindex, follow" />' : ''
  const canonicalMeta = config.siteOrigin && path && path !== '/search'
    ? `\n  <link rel="canonical" href="${escapeHtml(config.siteOrigin + base + (path === '/' ? '/' : path))}" />`
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="小脚丫步步指南：从产前发现、产前复查、石膏治疗、支具穿戴到长期随访的足内翻家庭资料与工具。" />${robotsMeta}${canonicalMeta}
  <title>${fullTitle}</title>
  <link rel="icon" type="image/png" href="${config.siteBasePath}/assets/logo.png" />
  <link rel="apple-touch-icon" href="${config.siteBasePath}/assets/logo.png" />
  <style>${CSS}</style>
</head>
<body>
  <a class="skip-link" href="#main">跳到主要内容</a>
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="${base}/"><img class="brand-logo" src="${base}/assets/logo.png" alt="" width="40" height="40" /><span>${escapeHtml(config.siteTitle)}</span></a>
      <a class="nav-search" href="${base}/search"${current('/search') ? ' aria-current="page"' : ''}><span class="search-symbol" aria-hidden="true"></span>搜索</a>
      <nav class="nav" aria-label="主导航">
        ${NAV.map(([href, label]) => `<a href="${base}${href}"${current(href) ? ` aria-current="${href === path ? 'page' : 'true'}"` : ''}>${label}</a>`).join('')}
      </nav>
    </div>
  </header>
  <main class="container site-main" id="main" tabindex="-1">${bodyHtml}</main>
  <footer class="site-footer">
    <div class="container">
      <div class="footer-main">
        <div><strong>${escapeHtml(config.siteTitle)}</strong><p>${escapeHtml(config.maintenanceStatus)}</p></div>
        <nav aria-label="页脚导航"><a href="${base}/topics">精选专题</a><a href="${base}/posts">原创导读</a><a href="${base}/feedback">功能建议</a><a href="${base}/about">收录说明、版权勘误与隐私说明</a></nav>
      </div>
      ${contact || icp ? `<p class="footer-contact">${(contact + icp).replace(' · ', '')}</p>` : ''}
    </div>
  </footer>
</body>
</html>`
}

export function renderCard(r: ResourceView, config: WebConfig): string {
  const orig =
    r.originalTitle && r.originalTitle !== r.title
      ? `<p class="card-orig-title">原标题：${escapeHtml(r.originalTitle)}</p>`
      : ''
  const author = r.author ? `<span>作者/机构：${escapeHtml(r.author)}</span>` : ''
  const pubDate = r.publishedDate ? escapeHtml(r.publishedDate) : '未注明'
  const verified = r.lastVerifiedDate ? `<span>核对日期：${escapeHtml(r.lastVerifiedDate)}</span>` : ''
  const langBadge = r.language === 'OTHER' ? '<span class="badge">外文资料</span>' : ''

  return `<article class="card">
  <div class="meta-row card-badges">
    <span class="badge">${materialLabel(r.materialType)}</span>
    <span class="badge">${accessLabel(r.access)}</span>
    ${langBadge}
  </div>
  <h3 class="card-title"><a href="${config.siteBasePath}/resources/${encodeURIComponent(r.name)}">${escapeHtml(r.title)}</a></h3>
  ${orig}
  <p class="card-intro">${escapeHtml(r.intro)}</p>
  <div class="meta-row">
    <span>来源：<strong>${escapeHtml(r.sourceName)}</strong></span>
    ${author}
    <span>原文日期：${pubDate}</span>
    ${verified}
  </div>
</article>`
}
