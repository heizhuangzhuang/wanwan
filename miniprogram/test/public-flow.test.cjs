const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { after, test } = require('node:test')

const project = resolve(__dirname, '..')
const compiled = mkdtempSync(join(tmpdir(), 'wanwan-miniprogram-'))
after(() => rmSync(compiled, { recursive: true, force: true }))
execFileSync(resolve(project, '../web/node_modules/typescript/bin/tsc'), [
  '-p', join(project, 'tsconfig.json'), '--outDir', compiled,
], { stdio: 'inherit' })

function openPage(page, respond, globals = {}) {
  const navigations = []
  const toasts = []
  const requests = []
  let clipboard = ''
  let options
  global.Page = value => { options = value }
  global.getApp = () => ({ globalData: { apiBase: 'https://example.test/api', ...globals } })
  const request = (req, address) => {
    requests.push(address)
    const reply = respond(new URL(address, 'https://example.test'), req)
    if (!reply) req.fail(new Error('offline'))
    else req.success({ statusCode: reply.status ?? 200, data: reply.data })
  }
  global.wx = {
    request: req => request(req, req.url),
    cloud: { callContainer: req => request(req, req.path) },
    setNavigationBarTitle() {},
    navigateTo: ({ url }) => navigations.push(url),
    reLaunch: ({ url }) => navigations.push(url),
    setClipboardData: ({ data, success }) => { clipboard = data; success?.() },
    showToast: value => toasts.push(value.title),
  }
  const path = join(compiled, 'pages', page, `${page}.js`)
  delete require.cache[require.resolve(path)]
  require(path)
  options.setData = data => Object.assign(options.data, data)
  return { page: options, requests, navigations, toasts, getClipboard: () => clipboard }
}

const item = name => ({ name, title: name, originalTitle: name, sourceName: '资料来源',
  intro: '', materialType: 'PAPER', access: 'OPEN', linkStatus: 'OK',
  citationUrl: 'https://example.test/origin', entry: { type: 'CITATION_ONLY' } })
const settle = () => new Promise(resolve => setImmediate(resolve))

test('真实 AppID 连接弯弯云托管，游客继续使用本地联调地址', async () => {
  const path = join(compiled, 'app.js')
  function launch(appId, envVersion) {
    let app
    const calls = []
    global.App = options => { app = options }
    global.wx = {
      getAccountInfoSync: () => ({ miniProgram: { appId, envVersion } }),
      cloud: { init: options => calls.push(options) },
    }
    delete require.cache[require.resolve(path)]
    require(path)
    app.onLaunch()
    return { config: app.globalData, calls }
  }
  const cloud = launch('wx1234567890abcdef', 'develop')
  assert.deepEqual(cloud.calls, [{ env: 'prod-d8goya17ka2d1a272', traceUser: false }])
  assert.equal(cloud.config.cloudService, 'wanwan')
  assert.equal(cloud.config.useCloudContainer, true)
  const guest = launch('touristappid', 'develop')
  assert.deepEqual(guest.calls, [])
  assert.equal(guest.config.useCloudContainer, false)
  assert.match(guest.config.apiBase, /^http:\/\/127\.0\.0\.1:18090\//)
})

test('公众号专题入口按编辑顺序显示，返回前台后撤回内容不可见', async () => {
  let status = 200
  const { page, requests, navigations } = openPage('reading', (url, req) => {
    assert.equal(req.header['X-WX-SERVICE'], 'wanwan-backend')
    return { status, data: { title: '专题', intro: '导读', resources: [item('b'), item('a')] } }
  }, { useCloudContainer: true, cloudEnv: 'test', cloudService: 'wanwan-backend' })
  page.onLoad({ kind: 'topic', name: 'topic-a' })
  page.onShow()
  await settle()
  assert.equal(requests[0], '/apis/api.wanwan.run/v1alpha1/topics/topic-a')
  assert.deepEqual(page.data.items.map(resource => resource.name), ['b', 'a'])
  page.openDetail({ currentTarget: { dataset: { name: 'b' } } })
  assert.equal(navigations[0], '/pages/detail/detail?name=b')
  status = 404
  page.onShow()
  await settle()
  assert.deepEqual(page.data.items, [])
  assert.match(page.data.error, /下线/)
  assert.equal(page.data.retryable, false)
})

test('原创导读仅显示发布快照的文字内容', async () => {
  const { page } = openPage('reading', url => {
    assert.equal(url.pathname, '/api/posts/guide-a')
    return { data: { title: '导读', publishTime: '2026-11-19T00:00:00Z',
      content: '<p>正文 &amp; &#x8d44;&#26009;</p><script>alert(1)</script><img src="https://example.test/pixel"><ul><li>出处</li></ul>' } }
  })
  page.onLoad({ kind: 'guide', name: 'guide-a' })
  await page.load()
  assert.equal(page.data.body, '正文 & 资料\n\n• 出处')
  assert.equal(page.data.date, '2026-11-19')
})

test('搜索翻页保留已提交的关键词、阶段、材料类型', async () => {
  const { page, requests } = openPage('search', url => {
    if (url.pathname.endsWith('/stages')) return { data: [{ key: 'BIRTH', label: '出生后', order: 1 }] }
    return { data: { page: Number(url.searchParams.get('page')), size: 20, total: 35, items: [item('a')] } }
  })
  await page.loadFilters()
  page.onInput({ detail: { value: '石膏' } })
  page.onStage({ detail: { value: '1' } })
  page.onType({ detail: { value: '2' } })
  page.doSearch()
  await settle()
  page.onInput({ detail: { value: '尚未提交' } })
  page.nextPage()
  await settle()
  const params = new URL(requests.at(-1)).searchParams
  assert.deepEqual(Object.fromEntries(params), { keyword: '石膏', stage: 'BIRTH', type: 'PAPER', page: '2' })
  assert.equal(page.data.hasNext, false)
})

test('阶段翻页保留已提交的主题标签和类型', async () => {
  const { page, requests } = openPage('stage', url => ({ data: {
    page: Number(url.searchParams.get('page')), size: 20, total: 40, items: [item('a')],
  } }))
  page.onLoad({ key: 'BIRTH' })
  page.onType({ detail: { value: '2' } })
  await settle()
  page.onTag({ detail: { value: '石膏' } })
  page.applyTag()
  await settle()
  page.onTag({ detail: { value: '还没提交' } })
  page.nextPage()
  await settle()
  assert.deepEqual(Object.fromEntries(new URL(requests.at(-1)).searchParams), {
    stage: 'BIRTH', type: 'PAPER', tag: '石膏', page: '2',
  })
})

test('来源不可跳转时复制出处，网络故障可重试，404 清除旧资料', async () => {
  let reply
  const { page, getClipboard, toasts } = openPage('detail', () => reply)
  page.onLoad({ name: 'a' })
  await page.loadDetail()
  assert.equal(page.data.retryable, true)
  reply = { data: { ...item('a'), entry: { type: 'MP_ARTICLE', url: 'https://mp.weixin.qq.com/s/example' } } }
  await page.loadDetail()
  assert.equal(page.data.allowArticle, false)
  page.copyCitation()
  assert.match(getClipboard(), /资料来源\nhttps:\/\/example.test\/origin/)
  assert.equal(toasts.at(-1), '已复制出处')
  global.wx.openOfficialAccountArticle = ({ fail }) => fail()
  await page.loadDetail()
  assert.equal(page.data.allowArticle, true)
  page.openOfficialAccountArticle()
  assert.match(page.data.entryError, /无法打开/)
  reply = { data: { ...item('a'), linkStatus: 'SOURCE_RETRACTED' } }
  await page.loadDetail()
  page.copyCitation()
  assert.doesNotMatch(getClipboard(), /https/)
  reply = { status: 404 }
  await page.loadDetail()
  assert.equal(page.data.resource, null)
  assert.equal(page.data.retryable, false)
})


test('本地演示专题无需访问云服务，正式环境缺配置时返回连接错误', async () => {
  const demo = openPage('reading', () => assert.fail('示例数据无需网络'), { demoMode: true })
  demo.page.onLoad({ kind: 'topic', name: 'demo-start' })
  await demo.page.load()
  assert.equal(demo.page.data.title, '开始使用弯弯')
  assert.deepEqual(demo.page.data.items.map(resource => resource.name), ['demo-discovery', 'demo-cast'])
  const production = openPage('reading', () => assert.fail('缺少云环境不发起请求'), { useCloudContainer: true })
  production.page.onLoad({ kind: 'topic', name: 'demo-start' })
  await production.page.load()
  assert.equal(production.page.data.title, '')
  assert.equal(production.page.data.retryable, true)
})
