import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createServer } from 'node:http'
import { createBackendClient, HttpStatusError, type BackendClient, type ResourceView } from '../dist/api.js'
import { loadConfig } from '../dist/config.js'
import { escapeHtml, safeHttpUrl, sanitizePostHtml } from '../dist/html.js'
import { handleRequest } from '../dist/views.js'

function mockResource(overrides: Partial<ResourceView> = {}): ResourceView {
  return {
    name: 'r1',
    title: '中文标题 <script>alert(1)</script>',
    originalTitle: 'Original Title',
    intro: '本站独立介绍。',
    sourceName: '权威机构',
    author: '作者',
    publishedDate: '2026-01-01',
    lastVerifiedDate: '2026-11-17',
    stages: ['JUST_FOUND'],
    materialType: 'INSTITUTION',
    tags: [],
    language: 'ZH',
    access: 'OPEN',
    linkStatus: 'OK',
    citationUrl: 'https://example.org/doc',
    entry: { type: 'WEB', url: 'https://example.org/doc', appId: null, path: null },
    ...overrides,
  }
}

function mockClient(resource: ResourceView | null = mockResource()): BackendClient {
  return {
    async submitFeedback() {},
    async getStages() {
      return [{ key: 'JUST_FOUND', label: '刚发现', order: 0 }]
    },
    async listResources() {
      return { page: 1, size: 20, total: resource ? 1 : 0, items: resource ? [resource] : [] }
    },
    async getResource(name) {
      return resource && resource.name === name ? resource : null
    },
    async listTopics() {
      return { page: 1, size: 20, total: 0, items: [] }
    },
    async getTopic() {
      return null
    },
    async listPosts() {
      return { page: 1, size: 20, total: 1, items: [{ name: 'p1', title: '导读一', excerpt: '摘要' }] }
    },
    async listStagePosts() {
      return { page: 1, size: 20, total: 0, items: [] }
    },
    async getPost() {
      return { name: 'p1', title: '导读一', content: '<p>正文</p><script>bad()</script>' }
    },
    async search() {
      return { page: 1, size: 20, total: 0, items: [] }
    },
  }
}

describe('web security & SSR', () => {
  const config = loadConfig({ SITE_ORIGIN: 'https://wanwan.run' })

  it('renders the feedback form inside the configured site path without depending on the backend', async () => {
    const subpath = loadConfig({ SITE_BASE_PATH: '/xiaojiaoya' })
    const form = await handleRequest('/xiaojiaoya/feedback', mockClient(), subpath)
    assert.equal(form.status, 200)
    assert.match(String(form.body), /method="post" action="\/xiaojiaoya\/feedback"/)
    assert.match(String(form.body), /name="requestId" value="[a-f0-9-]{36}"/)
    const success = await handleRequest('/xiaojiaoya/feedback?sent=1', mockClient(), subpath)
    assert.match(String(success.body), /已收到你的建议/)
  })

  it('renders original-guide search results and paginates when only guides have more matches', async () => {
    const client = mockClient(null)
    client.search = async () => ({
      page: 1, size: 20, total: 0, items: [], guideTotal: 23,
      guideItems: [{ name: 'guide-1', title: '导读 <测试>', excerpt: '公开摘要' }],
    })
    const result = await handleRequest(new URL('https://wanwan.run/search?keyword=CMA&type=ORIGINAL'), client, config)
    assert.equal(result.status, 200)
    assert.match(String(result.body), /href="\/posts\/guide-1">导读 &lt;测试&gt;/)
    assert.match(String(result.body), /keyword=CMA&amp;type=ORIGINAL&amp;page=2/)
  })

  it('retains the search form and entered query when the resource service is unavailable', async () => {
    const client = mockClient()
    client.search = async () => { throw new Error('Backend unavailable') }
    const result = await handleRequest('/search?keyword=石膏&type=PAPER', client, config)
    assert.equal(result.status, 503)
    assert.match(String(result.body), /name="keyword" maxlength="100" value="石膏"/)
    assert.match(String(result.body), /value="PAPER" selected/)
    assert.match(String(result.body), /在线资料暂时无法加载/)
  })

  it('escapes HTML and rejects non-http URLs', () => {
    assert.equal(escapeHtml('<img onerror=1>'), '&lt;img onerror=1&gt;')
    assert.equal(safeHttpUrl('javascript:alert(1)'), null)
    assert.equal(safeHttpUrl('https://example.org/a'), 'https://example.org/a')
    assert.equal(sanitizePostHtml('<p onclick="x()">hi</p><script>1</script>'), '<p>hi</p>')
  })

  it('keeps article formatting and removes embeds and external form controls', () => {
    const source = '<h1>小标题</h1><h2>标题</h2><p><em>正文</em></p><iframe src="https://example.org/"></iframe>'
      + '<form action="https://example.org/"><input name="patient"></form>'
      + '<p><a href="https://example.org/" title="来源">出处</a></p>'
    const clean = sanitizePostHtml(source)
    assert.match(clean, /<h2>小标题<\/h2><h2>标题<\/h2><p><em>正文<\/em><\/p>/)
    assert.match(clean, /<a href="https:\/\/example.org\/" title="来源" rel="noopener noreferrer">出处<\/a>/)
    assert.doesNotMatch(clean, /<h1|iframe|form|input/)
  })

  it('treats backend redirects as an upstream failure and only maps a true 404 to missing', async () => {
    const calls: string[] = []
    const server = createServer((req, res) => {
      calls.push(req.url || '')
      if (req.url === '/resources/redirected') {
        res.writeHead(302, { Location: '/login' }).end()
      } else {
        res.writeHead(404).end()
      }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address()
    assert.ok(addr && typeof addr === 'object')
    try {
      const client = createBackendClient(`http://127.0.0.1:${addr.port}`)
      await assert.rejects(client.getResource('redirected'), (err: unknown) =>
        err instanceof HttpStatusError && err.status === 302)
      assert.equal(await client.getResource('missing'), null)
      assert.deepEqual(calls, ['/resources/redirected', '/resources/missing'])
    } finally {
      server.close()
    }
  })

  it('uses the previous public API if the canonical route redirects to Halo login', async () => {
    const routes: string[] = []
    const channels: Array<string | string[] | undefined> = []
    const server = createServer((req, res) => {
      const address = req.url || ''
      routes.push(address)
      channels.push(req.headers['x-wanwan-client'])
      if (address.includes('api.wanwan.run')) {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"items":[]}')
      } else if (address.endsWith('/resources/withdrawn')) {
        res.writeHead(404).end()
      } else {
        res.writeHead(302, { Location: '/login?authentication_required' }).end()
      }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address()
    assert.ok(addr && typeof addr === 'object')
    try {
      const client = createBackendClient(`http://127.0.0.1:${addr.port}/apis/api.xiaojiaoya.run/v1alpha1`)
      assert.deepEqual((await client.search({ keyword: '足内翻' })).items, [])
      assert.equal(await client.getResource('withdrawn'), null)
      assert.deepEqual(routes.map(route => route.split('?')[0]), [
        '/apis/api.xiaojiaoya.run/v1alpha1/search', '/apis/api.wanwan.run/v1alpha1/search',
        '/apis/api.xiaojiaoya.run/v1alpha1/resources/withdrawn',
      ])
      assert.equal(new URL(routes[1], 'https://example.test').searchParams.get('keyword'), '足内翻')
      assert.deepEqual(channels, ['web', 'web', 'web'])
    } finally {
      server.close()
    }
  })

  it('serves tools, their local calendar script, and cited prenatal guides without the backend', async () => {
    const offline = createBackendClient('')
    const namespaced = loadConfig({ SITE_BASE_PATH: '/xiaojiaoya' })
    const tools = await handleRequest('/xiaojiaoya/tools', offline, namespaced)
    assert.equal(tools.status, 200)
    assert.equal(tools.toolsScript, true)
    assert.match(String(tools.body), /家庭工具/)
    assert.match(String(tools.body), /\/xiaojiaoya\/tools\/appointment.js/)
    const script = await handleRequest('/xiaojiaoya/tools/appointment.js', offline, namespaced)
    assert.match(script.contentType, /javascript/)
    const guide = await handleRequest('/xiaojiaoya/prenatal/exome', offline, namespaced)
    assert.equal(guide.status, 200)
    assert.match(String(guide.body), /全外显子测序/)
    assert.match(String(guide.body), /https:\/\/www.qingdao.gov.cn\//)
    assert.equal((await handleRequest('/xiaojiaoya/prenatal/unknown', offline, namespaced)).status, 404)
  })

  it('rejects malformed or multi-segment detail identifiers before calling the backend', async () => {
    const client = mockClient()
    client.getResource = async () => { throw new Error('unexpected backend request') }
    for (const path of ['/resources/%ZZ', '/resources/r1%2Fr2', '/resources/r1/r2']) {
      assert.equal((await handleRequest(path, client, config)).status, 404)
    }
  })

  it('renders resource detail safely and returns 404 when withdrawn/missing', async () => {
    const ok = await handleRequest('/resources/r1', mockClient(), config)
    assert.equal(ok.status, 200)
    assert.ok(ok.body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
    assert.ok(!ok.body.includes('<script>alert(1)</script>'))

    const missing = await handleRequest('/resources/withdrawn', mockClient(), config)
    assert.equal(missing.status, 404)
    assert.ok(missing.body.includes('内容不存在或已停用'))
  })

  it('downgrades retracted resource button', async () => {
    const retracted = mockResource({
      linkStatus: 'SOURCE_RETRACTED',
      entry: { type: 'CITATION_ONLY', url: null, appId: null, path: null },
    })
    const res = await handleRequest('/resources/r1', mockClient(retracted), config)
    assert.equal(res.status, 200)
    assert.ok(res.body.includes('原文已被原站撤回或下线'))
    assert.ok(!res.body.includes('前往原站阅读'))
  })

  it('honors citation-only even when the original URL is healthy', async () => {
    const resource = mockResource({ entry: { type: 'CITATION_ONLY', url: null, appId: null, path: null } })
    const result = await handleRequest('/resources/r1', mockClient(resource), config)
    assert.match(result.body, /原始出处链接/)
    assert.doesNotMatch(result.body, /前往原站阅读/)
  })

  it('serves the original checklist and redirects legacy links to xiaojiaoya', async () => {
    const site = loadConfig({ SITE_BASE_PATH: '/xiaojiaoya' })
    const old = await handleRequest('/wanwan/search?keyword=%E7%9F%B3%E8%86%8F', mockClient(), site)
    assert.equal(old.status, 308)
    assert.equal(old.location, '/xiaojiaoya/search?keyword=%E7%9F%B3%E8%86%8F')
    const result = await handleRequest('/xiaojiaoya/downloads/clubfoot-ultrasound-checklist.pdf', mockClient(), site)
    assert.equal(result.status, 200)
    assert.equal(result.contentType, 'application/pdf')
    assert.match(result.contentDisposition || '', /^attachment/)
    assert.ok(Buffer.isBuffer(result.body))
    assert.equal(result.body.subarray(0, 5).toString(), '%PDF-')
  })

  it('keeps routes, navigation, forms and sitemap inside the configured path', async () => {
    const subpathConfig = loadConfig({ SITE_ORIGIN: 'https://wanwan.run', SITE_BASE_PATH: '/wanwan/' })
    const client = mockClient()

    const home = await handleRequest('/wanwan/', client, subpathConfig)
    assert.equal(home.status, 200)
    assert.match(home.body, /href="\/wanwan\/resources\/r1"/)
    assert.match(home.body, /action="\/wanwan\/search"/)
    assert.doesNotMatch(home.body, /(?:href|action)="\/(?!wanwan\/)/)

    const detail = await handleRequest('/wanwan/resources/r1', client, subpathConfig)
    assert.equal(detail.status, 200)
    assert.match(detail.body, /href="\/wanwan\/resources"/)
    assert.match(detail.body, /href="https:\/\/example\.org\/doc"/)
    assert.equal((await handleRequest('/wanwans/resources/r1', client, subpathConfig)).status, 404)

    const sitemap = await handleRequest('/wanwan/sitemap.xml', client, subpathConfig)
    assert.match(sitemap.body, /<loc>https:\/\/wanwan\.run\/wanwan\/resources\/r1<\/loc>/)
  })

  it('keeps stage, type and tag across paginated public queries', async () => {
    const client = mockClient()
    client.listResources = async params => {
      assert.deepEqual(params, { stage: 'JUST_FOUND', type: 'PAPER', tag: '石膏', page: 2, size: 20 })
      return { page: 2, size: 20, total: 50, items: [] }
    }
    const result = await handleRequest('/resources?stage=JUST_FOUND&type=PAPER&tag=石膏&page=2', client, config)
    assert.equal(result.status, 200)
    assert.match(String(result.body), /stage=JUST_FOUND&amp;type=PAPER&amp;tag=%E7%9F%B3%E8%86%8F&amp;page=3/)
  })

  it('shows categorized Halo posts on the stage page despite unavailable resource cards', async () => {
    const client = mockClient()
    client.listResources = async () => { throw new HttpStatusError(503, 'unavailable') }
    client.listStagePosts = async (stage, page, size) => {
      assert.equal(stage, 'JUST_FOUND')
      return { page: page!, size: size!, total: 4, items: [{ name: 'guide', title: '阶段导读', excerpt: '' }] }
    }
    const stage = await handleRequest('/stages/JUST_FOUND', client, config)
    assert.match(String(stage.body), /这一阶段的原创导读/)
    assert.match(String(stage.body), /href="\/posts\/guide">阶段导读/)
    assert.match(String(stage.body), /href="\/posts\?stage=JUST_FOUND"/)
    const articles = await handleRequest('/posts?stage=JUST_FOUND', client, config)
    assert.match(String(articles.body), /刚发现 · 原创导读/)
    assert.match(String(articles.body), /阶段导读/)
  })

  it('serves the homepage while the deployment awaits a backend', async () => {
    const pendingConfig = loadConfig({ BACKEND_API_BASE: '', SITE_BASE_PATH: '/wanwan' })
    const client = createBackendClient(pendingConfig.backendApiBase)
    const home = await handleRequest('/wanwan/', client, pendingConfig)
    assert.equal(home.status, 200)
    assert.match(home.body, /资料库正在准备中/)
    await assert.rejects(handleRequest('/wanwan/resources', client, pendingConfig), /BACKEND_API_BASE/)
  })

  it('keeps the home and stage guides usable when the configured API returns 404', async () => {
    const failing = () => Promise.reject(new HttpStatusError(404, 'Backend HTTP 404'))
    const client = { ...mockClient(), getStages: failing, listTopics: failing, listResources: failing, listPosts: failing }
    const site = loadConfig({ SITE_BASE_PATH: '/xiaojiaoya' })

    for (const path of ['/', '/stages']) {
      const result = await handleRequest(`/xiaojiaoya${path}`, client, site)
      assert.equal(result.status, 200)
      assert.match(result.body, /href="\/xiaojiaoya\/stages\/JUST_FOUND"/)
      assert.match(result.body, /href="\/xiaojiaoya\/stages\/LONG_TERM"/)
    }

    const stage = await handleRequest('/xiaojiaoya/stages/JUST_FOUND', client, site)
    assert.equal(stage.status, 200)
    assert.match(stage.body, /<h1>刚发现<\/h1>/)
    assert.match(stage.body, /在线资料暂时无法加载/)
    assert.match(stage.body, /href="\/xiaojiaoya\/prenatal"/)
    assert.doesNotMatch(stage.body, /暂无已公开资料/)
    assert.equal((await handleRequest('/xiaojiaoya/stages/UNKNOWN', client, site)).status, 404)
    await assert.rejects(handleRequest('/xiaojiaoya/resources', client, site), /Backend HTTP 404/)
  })

  it('shows live MySQL-backed content again when the resources API responds', async () => {
    const client = mockClient()
    client.listTopics = async () => { throw new HttpStatusError(503, 'Backend HTTP 503') }
    const home = await handleRequest('/', client, config)
    assert.match(home.body, /href="\/resources\/r1"/)
    assert.match(home.body, /导读一/)
    const stage = await handleRequest('/stages/JUST_FOUND', client, config)
    assert.match(stage.body, /href="\/resources\/r1"/)
    assert.doesNotMatch(stage.body, /在线资料暂时无法加载/)
  })

  it('generates sitemap with only public entries', async () => {
    const res = await handleRequest('/sitemap.xml', mockClient(), config)
    assert.equal(res.status, 200)
    assert.ok(typeof res.body === 'string')
    assert.ok(res.body.includes('https://wanwan.run/resources/r1'))
    assert.ok(res.body.includes('https://wanwan.run/posts/p1'))
  })

  it('uses updated brand title and serves logo PNG asset', async () => {
    assert.equal(config.siteTitle, '小脚丫步步指南')
    const home = await handleRequest('/', mockClient(), config)
    assert.equal(home.status, 200)
    assert.ok(typeof home.body === 'string')
    assert.ok(home.body.includes('<title>小脚丫步步指南</title>'))
    assert.ok(home.body.includes('href="/assets/logo.png"'))
    assert.ok(home.body.includes('src="/assets/logo.png"'))

    const logo = await handleRequest('/assets/logo.png', mockClient(), config)
    assert.equal(logo.status, 200)
    assert.equal(logo.contentType, 'image/png')
    assert.ok(Buffer.isBuffer(logo.body))
    assert.deepEqual(logo.body.subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  })

  it('supports SITE_BASE_PATH subpath and pending backend mode', async () => {
    const subConfig = loadConfig({
      SITE_BASE_PATH: '/wanwan',
      SITE_ORIGIN: 'http://81.71.123.100',
      BACKEND_API_BASE: '',
    })
    const home = await handleRequest('/wanwan/', mockClient(), subConfig)
    assert.equal(home.status, 200)
    assert.ok(typeof home.body === 'string')
    assert.ok(home.body.includes('资料库正在准备中'))
    assert.ok(home.body.includes('href="/wanwan/about"'))
    assert.ok(home.body.includes('src="/wanwan/assets/logo.png"'))
    assert.match(home.body, /href="\/wanwan\/tools\/brace-followup"/)
    assert.match(home.body, /src="\/wanwan\/assets\/first-steps.webp"/)
    assert.match(home.body, /href="\/wanwan\/" aria-current="page">首页/)

    const photo = await handleRequest('/wanwan/assets/first-steps.webp', mockClient(), subConfig)
    assert.equal(photo.status, 200)
    assert.equal(photo.contentType, 'image/webp')
    assert.ok(Buffer.isBuffer(photo.body))
    assert.equal(photo.body.subarray(8, 12).toString(), 'WEBP')

    const subLogo = await handleRequest('/wanwan/assets/logo.png', mockClient(), subConfig)
    assert.equal(subLogo.status, 200)
    assert.equal(subLogo.contentType, 'image/png')

    const outside = await handleRequest('/other', mockClient(), subConfig)
    assert.equal(outside.status, 404)

    const rootRobots = await handleRequest('/robots.txt', mockClient(), subConfig)
    assert.equal(rootRobots.status, 200)
    assert.match(String(rootRobots.body), /Sitemap: http:\/\/81\.71\.123\.100\/wanwan\/sitemap\.xml/)
  })

  it('includes brace-followup in sitemap and matches prenatal guides in search', async () => {
    const res = await handleRequest('/sitemap.xml', mockClient(), config)
    assert.equal(res.status, 200)
    assert.ok(String(res.body).includes('https://wanwan.run/tools/brace-followup'))

    const search = await handleRequest('/search?keyword=%E7%BE%8A%E7%A9%BF', mockClient(), config)
    assert.equal(search.status, 200)
    assert.match(String(search.body), /\/prenatal\/amniocentesis/)
  })
})
