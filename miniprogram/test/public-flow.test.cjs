const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
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
  const storage = globals.storage || new Map()
  global.wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    request: req => request(req, req.url),
    cloud: { callContainer: req => request(req, req.path) },
    setNavigationBarTitle() {},
    navigateTo: ({ url }) => navigations.push(url),
    switchTab: ({ url }) => navigations.push(url),
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
  assert.deepEqual(cloud.calls, [{ env: 'prod-d1gm7gr9e711335be', traceUser: false }])
  assert.equal(cloud.config.cloudService, 'xiaojiaoya')
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
  assert.equal(requests[0], '/apis/api.xiaojiaoya.run/v1alpha1/topics/topic-a')
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
  assert.equal(demo.page.data.title, '开始使用小脚丫步步指南')
  assert.deepEqual(demo.page.data.items.map(resource => resource.name), ['demo-discovery', 'demo-cast'])
  const production = openPage('reading', () => assert.fail('缺少云环境不发起请求'), { useCloudContainer: true })
  production.page.onLoad({ kind: 'topic', name: 'demo-start' })
  await production.page.load()
  assert.equal(production.page.data.title, '')
  assert.equal(production.page.data.retryable, true)
})


test('首页阶段加载失败时，仍可在资料栏目读取专题及精选资料', async () => {
  const respond = url => {
    if (url.pathname.endsWith('/stages')) return { data: '<html>登录</html>' }
    if (url.pathname.endsWith('/topics')) return { data: { items: [{ name: 't1', title: '专题一' }] } }
    return { data: { items: [item('r1')] } }
  }
  const { page: home, requests } = openPage('index', respond)
  await home.onLoad()
  assert.match(home.data.error, /阶段/)
  assert.deepEqual(requests, ['https://example.test/api/stages'])
  const { page: library } = openPage('library', respond)
  await library.onShow()
  assert.deepEqual(library.data.topics.map(topic => topic.name), ['t1'])
  assert.deepEqual(library.data.resources.map(resource => resource.name), ['r1'])
})

test('收藏和最近阅读只保存标识，撤回后清理收藏', async () => {
  const storage = new Map()
  const { page: detail } = openPage('detail', url => url.pathname.endsWith('/a')
    ? { data: { ...item('a'), tags: ['资料'] } }
    : { data: { items: [item('a'), item('b'), { ...item('withdrawn'), linkStatus: 'SOURCE_RETRACTED' }] } },
  { storage })
  detail.onLoad({ name: 'a' })
  await detail.loadDetail()
  await settle()
  assert.deepEqual(detail.data.related.map(resource => resource.name), ['b'])
  detail.toggleFavorite()
  assert.equal(detail.data.saved, true)
  assert.deepEqual([...storage.values()], [['a'], ['a']])
  const { page: shelf } = openPage('shelf', () => ({ status: 404 }), { storage })
  await shelf.load(1)
  assert.deepEqual(shelf.data.items, [])
  assert.equal(shelf.data.failed, false)
  assert.deepEqual(storage.get('wanwan-reading-local-saved'), [])
})

test('沟通清单只复制勾选的问题', () => {
  const { page, getClipboard } = openPage('preparation', () => assert.fail('不需要请求服务'))
  page.onChange({ detail: { value: ['0', '4'] } })
  page.copyQuestions()
  assert.match(getClipboard(), /这次沟通需要带哪些资料/)
  assert.match(getClipboard(), /应该联系哪个科室/)
  assert.doesNotMatch(getClipboard(), /报告里/)
})

test('点击授权后才用微信登录码登记，消息拒绝不发起写入，并支持取消', async () => {
  const template = 'wechat-template-testing'
  const registrations = []
  let requested
  let loginCount = 0
  const { page } = openPage('me', (url, req) => {
    if (url.pathname.endsWith('/notice-config')) return { data: { templateId: template } }
    assert.equal(req.method, 'POST')
    assert.equal(req.header['X-WX-SERVICE'], 'wanwan-backend')
    assert.ok(url.pathname.endsWith('/notice-subscriptions'))
    registrations.push(req.data)
    return { data: { subscribed: req.data.enabled } }
  }, { useCloudContainer: true, cloudEnv: 'test', cloudService: 'wanwan-backend' })
  wx.requestSubscribeMessage = options => { requested = options }
  wx.login = ({ success }) => { loginCount += 1; success({ code: 'wechat-login-code' }) }
  page.onLoad()
  await settle()
  assert.equal(page.data.noticeTemplate, template)
  assert.equal(requested, undefined)
  page.subscribeNotice()
  assert.deepEqual(requested.tmplIds, [template])
  requested.success({ [template]: 'reject' })
  assert.equal(loginCount, 0)
  assert.deepEqual(registrations, [])

  page.subscribeNotice()
  requested.success({ [template]: 'accept' })
  await settle()
  assert.equal(loginCount, 1)
  assert.deepEqual(registrations[0], { code: 'wechat-login-code', templateId: template, enabled: true })
  assert.match(page.data.noticeStatus, /订阅已保存/)

  page.cancelNotice()
  await settle()
  assert.equal(loginCount, 2)
  assert.equal(registrations[1].enabled, false)
  assert.match(page.data.noticeStatus, /已取消/)
})

test('原版清单可离线保存到小程序、预览和微信转发', async () => {
  const { page, requests } = openPage('downloads', () => { throw new Error('unexpected network request') })
  const saved = new Map()
  const previews = []
  const shares = []
  wx.env = { USER_DATA_PATH: 'wxfile://usr' }
  wx.getFileSystemManager = () => ({
    access({ path, success, fail }) { saved.has(path) ? success() : fail({}) },
    writeFile({ filePath, data, encoding, success }) {
      saved.set(filePath, Buffer.from(data, encoding))
      success()
    },
  })
  wx.openDocument = options => previews.push(options)
  wx.shareFileMessage = options => shares.push(options)

  await page.onLoad({})
  assert.equal(page.data.kind, 'document')
  assert.equal(page.data.localPath, '')
  await page.downloadFile()
  assert.equal(requests.length, 0)
  assert.match(page.data.localPath, /^wxfile:\/\/usr\/xiaojiaoya-[\da-f]+\.pdf$/)
  assert.deepEqual(saved.get(page.data.localPath),
    readFileSync(resolve(project, '../web/public/downloads/clubfoot-ultrasound-checklist.pdf')))
  page.preview()
  assert.equal(previews[0].filePath, page.data.localPath)
  assert.equal(previews[0].showMenu, true)
  page.forwardFile()
  assert.equal(shares[0].fileName, '足内翻超声复查清单_一页简版.pdf')
  await page.onLoad({})
  assert.ok(page.data.localPath)
})

test('授权远程附件兼容 Office、图片和 ZIP，HTTP 错误不保存文件', async () => {
  const { approvedDownload, fileKind } = require(join(compiled, 'services/downloads.js'))
  for (const [ext, kind] of [['docx', 'document'], ['xlsx', 'document'], ['jpeg', 'image'], ['zip', 'archive']]) {
    assert.equal(fileKind(`guide.${ext}`), kind)
  }
  assert.equal(approvedDownload('bad', { fileName: 'a.pdf', url: 'http://example.test/a' }), null)
  assert.equal(approvedDownload('bad', { fileName: '../a.pdf', url: 'https://example.test/a' }), null)

  const input = { ...item('r1'), linkStatus: 'OK', attachment: { fileName: '资料.zip', url: 'https://example.test/files/zip' } }
  const { page } = openPage('downloads', () => ({ data: input }))
  let statusCode = 404
  let persisted = 0
  const opened = []
  wx.env = { USER_DATA_PATH: 'wxfile://usr' }
  wx.downloadFile = ({ url, success }) => {
    assert.equal(url, input.attachment.url)
    success({ statusCode, tempFilePath: 'wxfile://temp-download' })
  }
  wx.getFileSystemManager = () => ({
    access({ fail }) { fail({}) },
    saveFile({ filePath, tempFilePath, success }) {
      assert.equal(tempFilePath, 'wxfile://temp-download')
      persisted += 1
      success({ savedFilePath: filePath })
    },
  })
  wx.openDocument = options => opened.push(options)
  await page.onLoad({ resource: 'r1' })
  assert.equal(page.data.kind, 'archive')
  await page.downloadFile()
  assert.match(page.data.status, /下载失败/)
  assert.equal(persisted, 0)
  statusCode = 200
  await page.downloadFile()
  assert.equal(persisted, 1)
  assert.match(page.data.localPath, /\.zip$/)
  page.preview()
  assert.equal(opened.length, 0)
  input.linkStatus = 'SOURCE_RETRACTED'
  await page.onShow()
  assert.match(page.data.error, /已停用/)
  assert.equal(page.data.localPath, '')
})

test('公开列表在新接口跳转登录时使用线上兼容路径，私有接口不降级', async () => {
  const cloud = { useCloudContainer: true, cloudEnv: 'test', cloudService: 'xiaojiaoya' }
  const { page, requests } = openPage('index', url => {
    if (url.pathname.includes('api.xiaojiaoya.run')) return { status: 302, data: '' }
    return { data: url.pathname.endsWith('/stages')
      ? [{ key: 'JUST_FOUND', label: '初次发现', order: 0 }]
      : { items: [] } }
  }, cloud)
  await page.loadHome()
  assert.equal(page.data.stages[0].label, '初次发现')
  assert.equal(page.data.error, '')
  assert.ok(requests.includes('/apis/api.wanwan.run/v1alpha1/stages'))

  const cast = openPage('cast', () => ({ status: 302, data: '' }), cloud)
  await cast.page.refresh()
  assert.deepEqual(cast.requests, ['/apis/api.xiaojiaoya.run/v1alpha1/cast-journal-config'])
  assert.equal(cast.page.data.config, null)
  assert.equal(cast.page.data.error, '')
})

test('石膏记录需要单独同意，微信拒绝提醒时不提交授权', async () => {
  const calls = []
  const pending = []
  const fixture = { consented: false, entries: [], reminder: null }
  const templateId = 'appointment-template'
  const { page } = openPage('cast', (url, req) => {
    if (url.pathname.endsWith('/cast-journal-config')) return {
      data: { enabled: true, consentVersion: 'cast-v1', contact: 'privacy@example.test', templateId },
    }
    calls.push(req.data)
    if (req.data.action === 'consent') fixture.consented = true
    return { data: fixture }
  })
  wx.login = ({ success }) => success({ code: 'test-wechat-login' })
  wx.requestSubscribeMessage = options => pending.push(options)
  await page.refresh()
  assert.equal(page.data.consented, false)
  await page.consent()
  assert.equal(page.data.consented, true)
  assert.equal(calls[1].consentVersion, 'cast-v1')
  const event = { currentTarget: { dataset: { id: 'cast-test' } } }
  const declined = page.schedule(event)
  pending.shift().success({ [templateId]: 'reject' })
  await declined
  assert.equal(calls.length, 2)
  const accepted = page.schedule(event)
  pending.shift().success({ [templateId]: 'accept' })
  await accepted
  assert.deepEqual(calls[2], { action: 'schedule', entryId: 'cast-test', templateId, code: 'test-wechat-login' })
})

test('产前专项在没有 API 的情况下可用，与 Web 专项内容一致', () => {
  const { page, requests, getClipboard } = openPage('prenatal', () => { throw new Error('unexpected request') })
  const json = JSON.parse(readFileSync(resolve(project, '../web/public/guides/prenatal.json'), 'utf8'))
  assert.deepEqual(page.data.guides, json)
  page.onLoad({ key: 'exome' })
  assert.match(page.data.selected.title, /全外显子/)
  page.copySource()
  assert.equal(getClipboard(), page.data.selected.sourceUrl)
  assert.equal(requests.length, 0)
})

test('四个一级栏目和自定义底栏同步，切换使用 switchTab', () => {
  const config = JSON.parse(readFileSync(join(project, 'app.json'), 'utf8'))
  assert.equal(config.tabBar.custom, true)
  assert.deepEqual(config.tabBar.list.map(item => item.text), ['首页', '资料', '工具', '我的'])
  for (const { pagePath } of config.tabBar.list) {
    assert.ok(config.pages.includes(pagePath))
    const pageName = pagePath.split('/')[1]
    const { page } = openPage(pageName, () => ({ data: { items: [] } }))
    let selected
    page.getTabBar = () => ({ setData: ({ active }) => { selected = active } })
    page.onShow()
    assert.equal(selected, pagePath)
  }

  const calls = []
  let component
  global.Component = options => { component = options }
  wx.switchTab = ({ url }) => calls.push(url)
  global.getCurrentPages = () => [{ route: 'pages/index/index' }]
  const tabPath = join(compiled, 'custom-tab-bar/index.js')
  delete require.cache[require.resolve(tabPath)]
  require(tabPath)
  component.setData = values => Object.assign(component.data, values)
  component.lifetimes.ready.call(component)
  assert.equal(component.data.active, 'pages/index/index')
  assert.deepEqual(component.data.tabs.map(tab => ({ pagePath: tab.path, text: tab.label })), config.tabBar.list)
  for (const path of ['pages/index/index', 'pages/library/library', 'pages/tools/tools', 'unknown']) {
    component.methods.switchSection.call(component, { currentTarget: { dataset: { path } } })
  }
  assert.deepEqual(calls, ['/pages/library/library', '/pages/tools/tools'])
})

test('我的在返回时更新本机阅读数量，最近阅读可直达', async () => {
  const storage = new Map([['wanwan-reading-local-saved', ['r1']], ['wanwan-reading-local-recent', ['r1', 'r2']]])
  const { page } = openPage('me', () => { throw new Error('Unexpected request') }, { storage })
  page.onShow()
  assert.equal(page.data.saved, 1)
  assert.equal(page.data.recent, 2)
  storage.set('wanwan-reading-local-saved', [])
  page.onShow()
  assert.equal(page.data.saved, 0)
  const { page: shelf, requests } = openPage('shelf', url => ({ data: item(url.pathname.split('/').pop()) }), { storage })
  shelf.onLoad({ kind: 'recent' })
  await shelf.load(1)
  assert.equal(shelf.data.kind, 'recent')
  assert.deepEqual(requests.map(url => url.split('/').pop()), ['r1', 'r2'])
})
