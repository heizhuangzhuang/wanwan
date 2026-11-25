import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { getCookie, getHeader, setCookie } from 'h3'
import type { AnalyticsEvent } from '../../shared/types'
import { createBackendClient } from './backend'

const COOKIE_NAME = 'ww_vid'
const MAX_AGE_SECONDS = 180 * 24 * 3600
const BOT_RE = /bot|spider|crawler|headless|uptime|kube-probe|healthcheck/i
const VISITOR_RE = /^[A-Za-z0-9_-]{8,64}$/

interface PendingBucket {
  visitorId?: string
  events: AnalyticsEvent[]
}

const buckets = new Map<string, PendingBucket>()
let totalQueued = 0
let lastApiBase = ''
let timerStarted = false

function flushNow() {
  if (!lastApiBase || buckets.size === 0) return
  const client = createBackendClient(lastApiBase)
  const items = Array.from(buckets.values())
  buckets.clear()
  totalQueued = 0
  for (const bucket of items) {
    client.reportAnalytics(bucket).catch(() => {})
  }
}

function ensureTimer() {
  if (timerStarted) return
  timerStarted = true
  const timer = setInterval(flushNow, 5_000)
  timer.unref()
}

export function trackPageview(event: H3Event, pathname: string, siteBasePath: string, apiBase: string) {
  if (!apiBase) return
  lastApiBase = apiBase
  ensureTimer()

  const ua = String(getHeader(event, 'user-agent') || '')
  if (BOT_RE.test(ua)) return

  const optOut = getHeader(event, 'sec-gpc') === '1' || getHeader(event, 'dnt') === '1'
  let visitorId: string | undefined

  if (!optOut) {
    const existing = getCookie(event, COOKIE_NAME)
    if (existing && VISITOR_RE.test(existing)) {
      visitorId = existing
    } else {
      visitorId = randomBytes(12).toString('hex')
      const proto = String(getHeader(event, 'x-forwarded-proto') || '').toLowerCase()
      setCookie(event, COOKIE_NAME, visitorId, {
        path: '/',
        maxAge: MAX_AGE_SECONDS,
        httpOnly: true,
        sameSite: 'lax',
        secure: proto === 'https',
      })
    }
  }

  let normalized = pathname
  if (siteBasePath && normalized.startsWith(siteBasePath)) {
    normalized = normalized.slice(siteBasePath.length)
  }
  normalized = normalized ? (normalized.startsWith('/') ? normalized : `/${normalized}`) : '/'

  const key = visitorId ?? '__anon__'
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { visitorId, events: [] }
    buckets.set(key, bucket)
  }
  bucket.events.push({ type: 'pageview', path: normalized })
  totalQueued++
  if (totalQueued >= 15 || bucket.events.length >= 15) {
    flushNow()
  }
}
