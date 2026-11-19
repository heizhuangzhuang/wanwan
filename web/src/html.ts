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

/** 轻量清洗管理员原创导读 HTML，移除 script 与内联事件属性。 */
export function sanitizePostHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
}

export function materialLabel(type: string): string {
  return MATERIAL_LABELS[type] ?? '资料'
}

export function accessLabel(access: string): string {
  return ACCESS_LABELS[access] ?? '访问条件未确认'
}

const CSS = `
:root{--bg:#fafaf8;--surface:#fff;--text:#1f2937;--muted:#6b7280;--border:#e5e7eb;--accent:#0f766e;--accent-soft:#f0fdfa;--warn-bg:#fffbeb;--warn-text:#92400e;--max-w:880px}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.container{max-width:var(--max-w);margin:0 auto;padding:0 16px}
.site-header{background:var(--surface);border-bottom:1px solid var(--border);padding:12px 0}
.header-inner{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}
.brand{display:inline-flex;align-items:center;gap:8px;font-size:1.15rem;font-weight:700;color:var(--text)}
.brand:hover{text-decoration:none;color:var(--accent)}
.brand-logo{width:32px;height:32px;border-radius:8px;border:1px solid #ccfbf1;flex-shrink:0}
.nav{display:flex;flex-wrap:wrap;gap:14px;font-size:.92rem}
.nav a{color:var(--text)}
.notice-bar{background:var(--accent-soft);border:1px solid #ccfbf1;border-radius:8px;padding:12px 14px;font-size:.88rem;color:#134e4a;margin:16px 0}
.warn-bar{background:var(--warn-bg);border:1px solid #fde68a;border-radius:8px;padding:12px 14px;font-size:.88rem;color:var(--warn-text);margin:16px 0}
.search-form{display:flex;gap:8px;margin:16px 0}
.search-input{flex:1;min-width:0;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:.95rem;background:var(--surface)}
.btn{display:inline-block;padding:9px 16px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:#fff;font-size:.9rem;cursor:pointer}
.stage-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin:16px 0 24px}
.stage-card{display:block;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;color:var(--text)}
.stage-card:hover{border-color:var(--accent);text-decoration:none}
.stage-order{font-size:.75rem;color:var(--muted)}
.stage-name{font-weight:600;margin-top:4px}
.card-list{display:flex;flex-direction:column;gap:12px;margin:16px 0}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px}
.card-title{margin:0 0 6px;font-size:1.05rem;line-height:1.4}
.card-orig-title{font-size:.85rem;color:var(--muted);margin:0 0 8px}
.card-intro{margin:0 0 10px;font-size:.94rem}
.meta-row{display:flex;flex-wrap:wrap;gap:8px 14px;font-size:.8rem;color:var(--muted)}
.badge{display:inline-block;padding:1px 8px;border-radius:999px;background:#f3f4f6;color:#374151;font-size:.75rem}
.filter-bar{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.filter-bar a{padding:4px 10px;border:1px solid var(--border);border-radius:999px;font-size:.82rem;color:var(--text);background:var(--surface)}
.filter-bar a.active{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}
.site-footer{margin-top:40px;padding:20px 0 32px;border-top:1px solid var(--border);font-size:.82rem;color:var(--muted)}
.pagination{display:flex;justify-content:space-between;align-items:center;margin:20px 0;font-size:.88rem}
`.trim()

export function renderLayout(config: WebConfig, title: string | null, bodyHtml: string): string {
  const fullTitle = title ? `${escapeHtml(title)} - ${escapeHtml(config.siteTitle)}` : escapeHtml(config.siteTitle)
  const contact = config.contactEmail
    ? ` · 联系邮箱：${escapeHtml(config.contactEmail)}`
    : ''
  const icp = config.icpNumber
    ? ` · <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">${escapeHtml(config.icpNumber)}</a>`
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${fullTitle}</title>
  <link rel="icon" type="image/png" href="${config.siteBasePath}/assets/logo.png" />
  <link rel="apple-touch-icon" href="${config.siteBasePath}/assets/logo.png" />
  <style>${CSS}</style>
</head>
<body>
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="${config.siteBasePath}/"><img class="brand-logo" src="${config.siteBasePath}/assets/logo.png" alt="" width="32" height="32" /><span>${escapeHtml(config.siteTitle)}</span></a>
      <nav class="nav" aria-label="主导航">
        <a href="${config.siteBasePath}/">首页</a>
        <a href="${config.siteBasePath}/stages">按阶段</a>
        <a href="${config.siteBasePath}/topics">专题</a>
        <a href="${config.siteBasePath}/resources">资料库</a>
        <a href="${config.siteBasePath}/posts">原创导读</a>
        <a href="${config.siteBasePath}/search">搜索</a>
        <a href="${config.siteBasePath}/about">关于与规则</a>
      </nav>
    </div>
  </header>
  <main class="container">${bodyHtml}</main>
  <footer class="site-footer">
    <div class="container">
      <p>${escapeHtml(config.maintenanceStatus)}</p>
      <p><a href="${config.siteBasePath}/about">收录说明、版权勘误与隐私说明</a>${contact}${icp}</p>
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
  <div class="meta-row" style="margin-bottom:6px">
    <span class="badge">${materialLabel(r.materialType)}</span>
    <span class="badge">${accessLabel(r.access)}</span>
    ${langBadge}
  </div>
  <h3 class="card-title"><a href="${config.siteBasePath}/resources/${encodeURIComponent(r.name)}">${escapeHtml(r.title)}</a></h3>
  ${orig}
  <p class="card-intro"><span class="badge">本站介绍</span> ${escapeHtml(r.intro)}</p>
  <div class="meta-row">
    <span>来源：<strong>${escapeHtml(r.sourceName)}</strong></span>
    ${author}
    <span>原文日期：${pubDate}</span>
    ${verified}
  </div>
</article>`
}
