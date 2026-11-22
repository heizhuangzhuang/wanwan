import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { HttpStatusError, type BackendClient } from './api.js'
import type { WebConfig } from './config.js'
import { escapeHtml, renderLayout } from './html.js'
import type { RouteResponse } from './views.js'

const categories = [
  ['FEATURE', '希望增加功能'],
  ['USABILITY', '使用体验'],
  ['ISSUE', '遇到问题'],
  ['OTHER', '其他建议'],
]
const maximumBytes = 12 * 1024
const contentType = 'text/html; charset=utf-8'

export function renderFeedback(config: WebConfig, options: {
  sent?: boolean; error?: string; status?: number; category?: string; message?: string; requestId?: string; resource?: string
} = {}): RouteResponse {
  const route = `${config.siteBasePath}/feedback`
  const validCategory = categories.some(([key]) => key === options.category) ? options.category : undefined
  const resource = (options.resource ?? '').trim().slice(0, 120)
  const defaultMessage = options.message ?? (resource ? `关于资料「${resource}」的反馈：` : '')
  const body = options.sent
    ? `<div class="card" role="status"><h2>已收到你的建议</h2><p>谢谢你告诉我们哪些地方可以做得更好。</p>
      <a class="btn" href="${route}">再提一条</a></div>`
    : `<form method="post" action="${route}" class="card">
      ${options.error ? `<p role="alert" class="warn-bar">${escapeHtml(options.error)}</p>` : ''}
      ${resource ? `<p class="notice-bar">正在反馈资料编号：<code>${escapeHtml(resource)}</code></p>` : ''}
      <input type="hidden" name="requestId" value="${escapeHtml(options.requestId ?? randomUUID())}">
      <label for="category">建议类型</label>
      <select name="category" id="category" class="search-input" style="display:block;width:100%;margin:6px 0 18px">
        ${categories.map(([key, label]) => `<option value="${key}"${key === validCategory ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
      <label for="suggestion">你希望改进什么？</label>
      <textarea id="suggestion" name="message" required minlength="3" maxlength="500" rows="5"
        aria-describedby="suggestion-hint" class="search-input"
        style="display:block;box-sizing:border-box;width:100%;margin-top:6px;min-height:128px;font:inherit"
        placeholder="例如，希望穿戴记录可以按月下载。">${escapeHtml(defaultMessage)}</textarea>
      <p id="suggestion-hint" class="meta-row">3–500 字。请勿填写姓名、联系方式、病历或检查报告。</p>
      <button type="submit" class="btn">提交建议</button>
    </form>`
  return { status: options.status ?? 200, contentType,
    body: renderLayout(config, '功能建议', `<section style="max-width:620px">
      <h1>功能建议</h1><p>告诉我们你想增加的功能，或遇到的使用问题。建议由运营人员查看。</p>
      ${body}</section>`) }
}

const ipWindow = new Map<string, number[]>()
function allowFeedbackIp(ip: string): boolean {
  const now = Date.now()
  const cutoff = now - 60_000
  const recent = (ipWindow.get(ip) ?? []).filter(t => t > cutoff)
  if (recent.length >= 10) return false
  recent.push(now)
  ipWindow.delete(ip)
  ipWindow.set(ip, recent)
  if (ipWindow.size > 2000) {
    for (const [k, v] of ipWindow) if (!v.some(t => t > cutoff)) ipWindow.delete(k)
    while (ipWindow.size > 2000) {
      const oldest = ipWindow.keys().next().value
      if (oldest === undefined) break
      ipWindow.delete(oldest)
    }
  }
  return true
}

export async function handleFeedbackPost(req: IncomingMessage, client: BackendClient, config: WebConfig): Promise<RouteResponse> {
  const fail = (status: number, error: string) => renderFeedback(config, { status, error })
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
  const clientIp = forwarded || req.socket?.remoteAddress || 'unknown'
  if (!allowFeedbackIp(clientIp)) {
    req.resume()
    return fail(429, '提交过于频繁，请 1 分钟后再试。')
  }
  const { origin } = req.headers
  if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && config.siteOrigin && origin !== config.siteOrigin)) {
    req.resume()
    return fail(403, '请从本站的功能建议页面提交。')
  }
  if (req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/x-www-form-urlencoded') {
    req.resume()
    return fail(415, '请使用页面上的表单提交。')
  }
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += buffer.length
    if (length > maximumBytes) break
    chunks.push(buffer)
  }
  if (length > maximumBytes) {
    req.destroy()
    return fail(413, '建议内容太长，请缩短后再提交。')
  }
  const fields = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
  const rawId = fields.get('requestId') ?? ''
  const requestId = /^[a-z0-9-]{20,64}$/.test(rawId) ? rawId : randomUUID()
  const category = fields.get('category') ?? ''
  const message = (fields.get('message') ?? '').trim()
  const values = { requestId, category, message: message.slice(0, 500) }
  if (!categories.some(([key]) => key === category) || message.length < 3 || message.length > 500) {
    return renderFeedback(config, { ...values, status: 400, error: '请选择建议类型，并填写 3–500 字的建议。' })
  }
  try {
    await client.submitFeedback(values)
    return { status: 303, contentType, body: '', location: `${config.siteBasePath}/feedback?sent=1` }
  } catch (error) {
    if (error instanceof HttpStatusError && error.status === 409) {
      return renderFeedback(config, { ...values, requestId: randomUUID(), status: 409,
        error: '这次提交与已收到的建议内容不同。请确认后再次提交。' })
    }
    if (error instanceof HttpStatusError && error.status === 429) {
      return renderFeedback(config, { ...values, status: 429, error: '当前提交较多，请稍后重试。' })
    }
    return renderFeedback(config, { ...values, status: 503, error: '暂时无法提交，内容已保留，请稍后重试。' })
  }
}
