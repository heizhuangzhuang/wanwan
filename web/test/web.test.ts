import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { after, before, describe, test } from 'node:test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  cleanExcerpt,
  formatCitationSummary,
  resolveGuideCoverUrl,
  safeHttpUrl,
} from '../shared/types.ts'
import { searchPrenatalGuides } from '../shared/prenatal.ts'
import { preparePostContent, sanitizePostHtml } from '../server/utils/backend.ts'

describe('shared & server utilities', () => {
  test('safeHttpUrl allows http/https and rejects javascript/credentials', () => {
    assert.equal(safeHttpUrl('https://example.com/a'), 'https://example.com/a')
    assert.equal(safeHttpUrl('javascript:alert(1)'), null)
    assert.equal(safeHttpUrl('https://user:pass@example.com'), null)
  })

  test('resolveGuideCoverUrl resolves /upload/ relative paths against mediaOrigin and blocks traversal', () => {
    assert.equal(
      resolveGuideCoverUrl('/upload/cover.png', 'https://halo.example.com'),
      'https://halo.example.com/upload/cover.png',
    )
    assert.equal(resolveGuideCoverUrl('/upload/../secret.png', 'https://halo.example.com'), '')
    assert.equal(
      resolveGuideCoverUrl('https://cos.example.com/a.png', 'https://halo.example.com'),
      'https://cos.example.com/a.png',
    )
  })

  test('sanitizePostHtml strips scripts/iframes and rewrites /upload/ image src', () => {
    const out = sanitizePostHtml(
      '<h1>Title</h1><script>alert(1)</script><p><img src="/upload/pic.png" alt="ok"></p><a href="https://example.com">link</a>',
      'https://halo.example.com',
    )
    assert.ok(!out.includes('<script'))
    assert.ok(out.includes('<h2>Title</h2>'))
    assert.ok(out.includes('src="https://halo.example.com/upload/pic.png"'))
    assert.ok(out.includes('rel="noopener noreferrer"'))
  })

  test('preparePostContent builds TOC anchors and readingMinutes', () => {
    const res = preparePostContent('<h2>第一节</h2><p>内容</p><h3>子节</h3><p>更多内容</p>')
    assert.equal(res.toc.length, 2)
    assert.equal(res.toc[0]?.id, 'sec-1')
    assert.equal(res.toc[1]?.level, 'h3')
    assert.ok(res.html.includes('<h2 id="sec-1">第一节</h2>'))
    assert.ok(res.readingMinutes >= 1)
  })

  test('searchPrenatalGuides matches Chinese aliases like 羊穿 and CMA', () => {
    assert.ok(searchPrenatalGuides('羊穿').some(g => g.key === 'amniocentesis'))
    assert.ok(searchPrenatalGuides('CMA').some(g => g.key === 'chromosome'))
  })

  test('cleanExcerpt removes duplicate title prefix and formatCitationSummary joins fields', () => {
    assert.equal(cleanExcerpt('标题', '标题：正文摘要'), '正文摘要')
    assert.equal(
      formatCitationSummary({ journal: 'Pediatrics', publishedYear: '2025', doi: '10.1000/test' }),
      'Pediatrics · 2025 · DOI: 10.1000/test',
    )
  })
})

describe('Nuxt 3 SSR server end-to-end', () => {
  const webRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
  let mockApiServer: ReturnType<typeof createServer>
  let mockApiPort = 0
  let nuxtProc: ReturnType<typeof spawn> | null = null
  const nuxtPort = 34567

  before(async () => {
    mockApiServer = createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      if (url.pathname.includes('/family.xiaojiaoya.run/')) {
        if (url.pathname.endsWith('/pair')) {
          res.end(JSON.stringify({ code: 'A1B2C3D4E5F6', expiresAt: new Date(Date.now() + 180000).toISOString(), image: null }))
        } else if (url.pathname.endsWith('/exchange')) {
          res.end(JSON.stringify({ token: 'private-web-token', account: 'family-a', channel: 'web', expiresAt: '2026-12-01' }))
        } else if (req.headers['x-xiaojiaoya-session'] === 'private-web-token') {
          res.end(JSON.stringify({ account: 'family-a', channel: 'web' }))
        } else {
          res.statusCode = 401
          res.end(JSON.stringify({ status: 401 }))
        }
        return
      }
      if (url.pathname.endsWith('/stages')) {
        res.end(JSON.stringify([
          { key: 'JUST_FOUND', label: '刚发现', order: 0 },
          { key: 'PRENATAL', label: '产前了解与等待', order: 1 },
        ]))
        return
      }
      if (url.pathname.endsWith('/posts/post-lit')) {
        res.end(JSON.stringify({
          name: 'post-lit',
          title: '文献译读示例文章',
          excerpt: '示例摘要',
          author: 'Administrator',
          publishTime: '2026-11-23T08:00:00Z',
          articleKind: 'LITERATURE',
          coverUrl: '/upload/cover.png',
          citation: { journal: 'AOGS', publishedYear: '2019', doi: '10.1111/test' },
          content: '<h2>研究结论</h2><p>正文内容<img src="/upload/chart.png" /></p><h3>统计说明</h3><p>样本量</p>',
        }))
        return
      }
      if (url.pathname.endsWith('/posts') || url.pathname.endsWith('/stage-posts')) {
        res.end(JSON.stringify({
          page: 1,
          size: 20,
          total: 1,
          items: [{
            name: 'post-lit',
            title: '文献译读示例文章',
            excerpt: '示例摘要',
            author: 'Administrator',
            articleKind: 'LITERATURE',
            coverUrl: 'https://cos.example.com/cover.png',
          }],
        }))
        return
      }
      if (url.pathname.endsWith('/resources') || url.pathname.endsWith('/topics') || url.pathname.endsWith('/search')) {
        res.end(JSON.stringify({ page: 1, size: 20, total: 0, items: [], guideItems: [], guideTotal: 0 }))
        return
      }
      if (url.pathname.endsWith('/feedback') || url.pathname.endsWith('/analytics-events')) {
        res.end(JSON.stringify({ accepted: true }))
        return
      }
      res.statusCode = 404
      res.end(JSON.stringify({ error: 'not found' }))
    })

    await new Promise<void>((resolveReady) => {
      mockApiServer.listen(0, '127.0.0.1', () => {
        const addr = mockApiServer.address()
        mockApiPort = typeof addr === 'object' && addr ? addr.port : 0
        resolveReady()
      })
    })

    nuxtProc = spawn(process.execPath, [resolve(webRoot, 'dist/server.js')], {
      cwd: webRoot,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(nuxtPort),
        SITE_BASE_PATH: '/xiaojiaoya',
        SITE_ORIGIN: 'https://example.com',
        XIAOJIAOYA_FAMILY_LOCAL_HTTP: '1',
        BACKEND_API_BASE: `http://127.0.0.1:${mockApiPort}/apis/api.xiaojiaoya.run/v1alpha1`,
      },
      stdio: 'pipe',
    })

    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`http://127.0.0.1:${nuxtPort}/xiaojiaoya/healthz`)
        if (r.ok) break
      } catch { /* wait */ }
      await new Promise(r => setTimeout(r, 200))
    }
  })

  after(async () => {
    if (nuxtProc) {
      nuxtProc.kill('SIGTERM')
      await new Promise(r => setTimeout(r, 300))
    }
    mockApiServer.close()
  })

  test('healthz, robots.txt, sitemap.xml and /wanwan 308 redirect work', async () => {
    const h = await fetch(`http://127.0.0.1:${nuxtPort}/xiaojiaoya/healthz`)
    assert.equal(h.status, 200)
    const hJson = await h.json() as { status: string; framework: string }
    assert.equal(hJson.status, 'ok')
    assert.equal(hJson.framework, 'nuxt3')

    const robots = await fetch(`http://127.0.0.1:${nuxtPort}/xiaojiaoya/robots.txt`)
    assert.equal(robots.status, 200)
    assert.ok((await robots.text()).includes('Sitemap: https://example.com/xiaojiaoya/sitemap.xml'))

    const sitemap = await fetch(`http://127.0.0.1:${nuxtPort}/xiaojiaoya/sitemap.xml`)
    assert.equal(sitemap.status, 200)
    assert.ok((await sitemap.text()).includes('/xiaojiaoya/posts/post-lit'))

    const redir = await fetch(`http://127.0.0.1:${nuxtPort}/wanwan/posts`, { redirect: 'manual' })
    assert.equal(redir.status, 308)
    assert.equal(redir.headers.get('location'), '/xiaojiaoya/posts')
  })

  test('SSR renders home, posts (with stage filter), post detail, and tools', async () => {
    const home = await fetch(`http://127.0.0.1:${nuxtPort}/xiaojiaoya/`)
    assert.equal(home.status, 200)
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff')
    const homeHtml = await home.text()
    assert.ok(homeHtml.includes('足内翻家庭指南'))
    assert.ok(homeHtml.includes('文献译读示例文章'))
    assert.ok(homeHtml.includes('https://cos.example.com/cover.png'))

    const posts = await fetch(`http://127.0.0.1:${nuxtPort}/xiaojiaoya/posts?stage=JUST_FOUND`)
    assert.equal(posts.status, 200)
    const postsHtml = await posts.text()
    assert.ok(postsHtml.includes('刚发现 · 原创导读'))
    assert.ok(postsHtml.includes('按阶段筛选'))

    const detail = await fetch(`http://127.0.0.1:${nuxtPort}/xiaojiaoya/posts/post-lit`)
    assert.equal(detail.status, 200)
    const detailHtml = await detail.text()
    assert.ok(detailHtml.includes('文献出处与证据说明'))
    assert.ok(detailHtml.includes(`http://127.0.0.1:${mockApiPort}/upload/chart.png`))

    const brace = await fetch(`http://127.0.0.1:${nuxtPort}/xiaojiaoya/tools/brace-followup`)
    assert.equal(brace.status, 200)
    assert.ok((await brace.text()).includes('矫正鞋穿戴记录'))
  })

  test('family sign-in uses a browser-bound HttpOnly cookie and rejects other origins', async () => {
    const origin = `http://127.0.0.1:${nuxtPort}`
    const root = origin + '/xiaojiaoya'
    const form = await fetch(root + '/tools/family')
    assert.equal(form.status, 200)
    assert.match(await form.text(), /用微信登录/)
    const request = (action: string, sender = origin, cookie = '') => fetch(root + '/api/family/' + action, {
      method: 'POST', headers: { origin: sender, cookie, 'Content-Type': 'application/json' }, body: '{}',
    })
    assert.equal((await request('pair', 'http://other.example')).status, 403)
    assert.equal((await request('me')).status, 401)
    assert.equal((await request('exchange')).status, 401)
    const response = await request('pair')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const pairing = response.headers.get('set-cookie')!
    assert.match(pairing, /HttpOnly/i)
    assert.match(pairing, /SameSite=Strict/i)
    const authorized = await request('exchange', origin, pairing.split(';')[0])
    assert.equal(authorized.status, 200)
    assert.doesNotMatch(await authorized.text(), /private-web-token/)
    const session = authorized.headers.getSetCookie().find(value => value.startsWith('xiaojiaoya_family='))!
    assert.match(session, /HttpOnly/i)
    const me = await request('me', origin, session.split(';')[0])
    assert.deepEqual(await me.json(), { account: 'family-a', channel: 'web' })
  })

})
