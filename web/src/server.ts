import { createServer } from 'node:http'
import { createBackendClient } from './api.js'
import { loadConfig } from './config.js'
import { renderLayout } from './html.js'
import { handleRequest } from './views.js'

const config = loadConfig()
const client = createBackendClient(config.backendApiBase)

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Method Not Allowed')
    return
  }

  try {
    const result = await handleRequest(req.url || '/', client, config)
    res.writeHead(result.status, {
      'Content-Type': result.contentType,
      'Cache-Control': result.cacheControl ?? 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    })
    if (req.method === 'HEAD') {
      res.end()
    } else {
      res.end(result.body)
    }
  } catch (err) {
    console.error('SSR request failed:', err)
    res.writeHead(503, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    if (req.method === 'HEAD') {
      res.end()
    } else {
      res.end(
        renderLayout(
          config,
          '服务暂时不可用',
          '<div class="warn-bar"><h1>服务暂时不可用</h1><p>暂时无法连接资料服务，请稍后刷新重试。本站不会编造内容或使用模型补全。</p></div>',
        ),
      )
    }
  }
})

server.listen(config.port, config.host, () => {
  console.log(
    `wanwan-web listening on ${config.host || '*'}:${config.port}, backend ${config.backendApiBase ? 'configured' : 'pending'}`,
  )
})
