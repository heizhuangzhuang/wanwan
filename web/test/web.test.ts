import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBackendClient, type BackendClient, type ResourceView } from '../dist/api.js'
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

  it('escapes HTML and rejects non-http URLs', () => {
    assert.equal(escapeHtml('<img onerror=1>'), '&lt;img onerror=1&gt;')
    assert.equal(safeHttpUrl('javascript:alert(1)'), null)
    assert.equal(safeHttpUrl('https://example.org/a'), 'https://example.org/a')
    assert.equal(sanitizePostHtml('<p onclick="x()">hi</p><script>1</script>'), '<p>hi</p>')
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

  it('serves the homepage while the deployment awaits a backend', async () => {
    const pendingConfig = loadConfig({ BACKEND_API_BASE: '', SITE_BASE_PATH: '/wanwan' })
    const client = createBackendClient(pendingConfig.backendApiBase)
    const home = await handleRequest('/wanwan/', client, pendingConfig)
    assert.equal(home.status, 200)
    assert.match(home.body, /资料库正在准备中/)
    await assert.rejects(handleRequest('/wanwan/resources', client, pendingConfig), /BACKEND_API_BASE/)
  })

  it('generates sitemap with only public entries', async () => {
    const res = await handleRequest('/sitemap.xml', mockClient(), config)
    assert.equal(res.status, 200)
    assert.ok(res.body.includes('https://wanwan.run/resources/r1'))
    assert.ok(res.body.includes('https://wanwan.run/posts/p1'))
  })
})
