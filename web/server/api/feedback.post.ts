import { randomUUID } from 'node:crypto'
import { FEEDBACK_CATEGORIES } from '../../shared/types'
import { HttpStatusError, useBackend } from '../utils/backend'

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

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const config = useRuntimeConfig()
  const forwarded = String(getHeader(event, 'x-forwarded-for') ?? '').split(',')[0].trim()
  const clientIp = forwarded || event.node.req.socket?.remoteAddress || 'unknown'
  if (!allowFeedbackIp(clientIp)) {
    throw createError({ statusCode: 429, statusMessage: '提交过于频繁，请 1 分钟后再试。' })
  }

  const origin = getHeader(event, 'origin')
  const siteOrigin = String(config.public.siteOrigin || '').replace(/\/+$/, '')
  if (getHeader(event, 'sec-fetch-site') === 'cross-site' || (origin && siteOrigin && origin !== siteOrigin)) {
    throw createError({ statusCode: 403, statusMessage: '请从本站的功能建议页面提交。' })
  }

  const body = await readBody<{ requestId?: string; category?: string; message?: string }>(event)
  const rawId = typeof body?.requestId === 'string' ? body.requestId : ''
  const requestId = /^[a-z0-9-]{20,64}$/i.test(rawId) ? rawId : randomUUID()
  const category = typeof body?.category === 'string' ? body.category : ''
  const message = typeof body?.message === 'string' ? body.message.trim() : ''

  if (!FEEDBACK_CATEGORIES.some(c => c.key === category) || message.length < 3 || message.length > 500) {
    throw createError({ statusCode: 400, statusMessage: '请选择建议类型，并填写 3–500 字的建议。' })
  }

  const { client } = useBackend()
  try {
    await client.submitFeedback({ requestId, category, message })
    return { accepted: true, requestId }
  } catch (error) {
    if (error instanceof HttpStatusError && error.status === 409) {
      throw createError({
        statusCode: 409,
        statusMessage: '这次提交与已收到的建议内容不同。请确认后再次提交。',
      })
    }
    if (error instanceof HttpStatusError && error.status === 429) {
      throw createError({ statusCode: 429, statusMessage: '当前提交较多，请稍后重试。' })
    }
    throw createError({ statusCode: 503, statusMessage: '暂时无法提交，内容已保留，请稍后重试。' })
  }
})
