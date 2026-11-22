import { createServer } from 'node:http'
import { createBackendClient } from './api.js'
import { loadConfig } from './config.js'
import { handleFeedbackPost } from './feedback.js'
import { renderLayout } from './html.js'
import { appointmentHash } from './tools.js'
import { handleRequest } from './views.js'

const config = loadConfig()
const client = createBackendClient(config.backendApiBase)

const responseHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'; img-src 'self' https: http:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
}

const server = createServer(async (req, res) => {
  try {
    const requestUrl = req.url || '/'
    let pathname: string
    try {
      pathname = new URL(requestUrl, 'http://localhost').pathname.replace(/\/+$/, '')
    } catch {
      res.writeHead(400, { ...responseHeaders, 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Bad Request')
      return
    }
    const isFeedback = pathname === `${config.siteBasePath}/feedback`
    if (req.method !== 'GET' && req.method !== 'HEAD' && !(req.method === 'POST' && isFeedback)) {
      res.writeHead(405, { ...responseHeaders, 'Content-Type': 'text/plain; charset=utf-8',
        Allow: isFeedback ? 'GET, HEAD, POST' : 'GET, HEAD' })
      res.end('Method Not Allowed')
      return
    }
    const result = req.method === 'POST'
      ? await handleFeedbackPost(req, client, config)
      : await handleRequest(requestUrl, client, config)
    const defaultCache = req.method === 'POST' || isFeedback || result.status >= 400
      ? 'no-store'
      : 'public, max-age=60, stale-while-revalidate=300'
    res.writeHead(result.status, {
      'Content-Type': result.contentType,
      'Cache-Control': result.cacheControl ?? defaultCache,
      ...(result.location ? { Location: result.location } : {}),
      ...(result.contentDisposition ? { 'Content-Disposition': result.contentDisposition } : {}),
      ...responseHeaders,
      ...(result.toolsScript || result.scriptHash ? {
        'Content-Security-Policy': `${responseHeaders['Content-Security-Policy']}; script-src 'self' '${result.scriptHash ?? appointmentHash}'`,
      } : {}),
    })
    if (req.method === 'HEAD') {
      res.end()
    } else {
      res.end(result.body)
    }
  } catch (err) {
    console.error('SSR request failed:', err)
    if (res.headersSent) {
      res.end()
      return
    }
    const base = config.siteBasePath
    res.writeHead(503, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...responseHeaders,
    })
    if (req.method === 'HEAD') {
      res.end()
    } else {
      res.end(
        renderLayout(
          config,
          '服务暂时不可用',
          `<div class="warn-bar"><h1>服务暂时不可用</h1><p>暂时无法连接资料服务，请稍后刷新重试。以下离线工具仍可直接打开：</p><p><a href="${base}/tools">家庭工具</a> · <a href="${base}/prenatal">产前检查专项</a></p></div>`,
        ),
      )
    }
  }
})

server.requestTimeout = 15_000
server.headersTimeout = 10_000
server.keepAliveTimeout = 5_000

const shutdown = () => {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 8_000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

server.listen(config.port, config.host, () => {
  console.log(
    `wanwan-web listening on ${config.host || '*'}:${config.port}, backend ${config.backendApiBase ? 'configured' : 'pending'}`,
  )
})
