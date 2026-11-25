import { randomBytes } from 'node:crypto'

const forwardedActions = new Set(['me', 'cast', 'brace', 'logout'])
const sessionCookie = 'xiaojiaoya_family'
const pairingCookie = 'xiaojiaoya_family_pair'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'Referrer-Policy', 'no-referrer')
  const config = useRuntimeConfig(event)
  const origin = getHeader(event, 'origin')
  const local = String(config.familyLocalHttp) === '1' &&
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin || '') &&
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(event.node.req.socket.remoteAddress || '')
  const requestOrigin = getRequestURL(event).origin
  if (!origin || (local ? origin !== requestOrigin
    : !config.public.siteOrigin.startsWith('https://') || origin !== config.public.siteOrigin)) {
    throw createError({ statusCode: 403, statusMessage: 'Family records require the configured site origin' })
  }
  if (getHeader(event, 'sec-fetch-site') === 'cross-site' ||
    !getHeader(event, 'content-type')?.toLowerCase().startsWith('application/json')) {
    throw createError({ statusCode: 403 })
  }

  const action = getRouterParam(event, 'action') || ''
  if (action !== 'pair' && action !== 'exchange' && action !== 'cancel' && !forwardedActions.has(action)) {
    throw createError({ statusCode: 404 })
  }
  const options = { httpOnly: true, secure: !local, sameSite: 'strict' as const,
    path: `${config.public.siteBasePath}/api/family` }
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  let body = '{}'
  let secret = ''
  if (action === 'pair') {
    secret = randomBytes(32).toString('hex')
    body = JSON.stringify({ browserSecret: secret })
  } else if (action === 'exchange' || action === 'cancel') {
    const pair = getCookie(event, pairingCookie) || ''
    const [code, browserSecret] = pair.split('.')
    if (!code || !browserSecret) throw createError({ statusCode: 401 })
    body = JSON.stringify({ code, browserSecret, cancel: action === 'cancel' })
  } else {
    const token = getCookie(event, sessionCookie)
    if (!token) throw createError({ statusCode: 401 })
    headers['X-Xiaojiaoya-Session'] = token
    const account = getHeader(event, 'X-Xiaojiaoya-Account')
    if (action !== 'me') {
      if (!account || !/^family-[a-f0-9]{40}$/.test(account)) throw createError({ statusCode: 400 })
      headers['X-Xiaojiaoya-Account'] = account
    }
    if (action === 'cast' || action === 'brace') {
      const limit = 4 * 1024 * 1024
      if (Number(getHeader(event, 'content-length')) > limit) throw createError({ statusCode: 413 })
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of event.node.req) {
        size += Buffer.byteLength(chunk)
        if (size > limit) throw createError({ statusCode: 413 })
        chunks.push(Buffer.from(chunk))
      }
      body = Buffer.concat(chunks).toString('utf8')
    }
  }

  const endpoint = new URL(config.backendApiBase)
  endpoint.pathname = endpoint.pathname.replace(/\/apis\/api\.xiaojiaoya\.run\/v1alpha1\/?$/,
    '/apis/family.xiaojiaoya.run/v1alpha1')
  if (!endpoint.pathname.endsWith('/apis/family.xiaojiaoya.run/v1alpha1')) {
    throw createError({ statusCode: 503 })
  }
  const response = await fetch(`${endpoint.origin}${endpoint.pathname}/${action === 'cancel' ? 'exchange' : action}`, {
    method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(16000),
  }).catch(() => { throw createError({ statusCode: 503 }) })
  if (action === 'cancel') deleteCookie(event, pairingCookie, options)
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    if (action === 'logout' || (response.status === 401 && action !== 'exchange')) {
      deleteCookie(event, sessionCookie, options)
    }
    throw createError({ statusCode: response.status >= 400 ? response.status : 502 })
  }

  const result = await response.json()
  if (action === 'pair') {
    setCookie(event, pairingCookie, `${result.code}.${secret}`, { ...options, maxAge: 180 })
  } else if (action === 'exchange' && typeof result.token === 'string') {
    setCookie(event, sessionCookie, result.token, { ...options, maxAge: 7 * 86400 })
    deleteCookie(event, pairingCookie, options)
    return { account: result.account, channel: result.channel, expiresAt: result.expiresAt }
  } else if (action === 'logout') {
    deleteCookie(event, sessionCookie, options)
  }
  return result
})
