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

test('功能建议失败后保留内容并使用同一编号重试', async () => {
  const submitted = []
  const { page } = openPage('feedback', (url, req) => {
    assert.equal(url.pathname, '/apis/api.xiaojiaoya.run/v1alpha1/feedback')
    assert.equal(req.method, 'POST')
    assert.equal(req.header['X-Wanwan-Client'], 'wechat-miniprogram')
    submitted.push(req.data)
    if (submitted.length === 2) return { status: 201, data: { accepted: true } }
  }, { useCloudContainer: true, cloudEnv: 'dev', cloudService: 'xiaojiaoya' })
  page.changeMessage({ detail: { value: '希望按月导出穿戴记录' } })
  await page.submit()
  assert.match(page.data.error, /内容已保留/)
  assert.equal(page.data.message, '希望按月导出穿戴记录')
  await page.submit()
  assert.deepEqual(submitted[0], submitted[1])
  assert.equal(page.data.sent, true)
  assert.equal(page.data.message, '')
})

test('搜索结果能翻到没有资料卡的原创导读页，并打开对应导读', async () => {
  const { page, navigations } = openPage('search', url => ({
    data: { page: Number(url.searchParams.get('page')), size: 20, total: 0, items: [], guideTotal: 21,
      guideItems: [{ name: 'guide-test', title: '公开原创导读' }] },
  }))
  page.setData({ keyword: 'CMA' })
  page.doSearch()
  await settle()
  assert.equal(page.data.hasNext, true)
  page.nextPage()
  await settle()
  assert.equal(page.data.page, 2)
  assert.equal(page.data.hasNext, false)
  page.openGuide({ currentTarget: { dataset: { name: page.data.guideItems[0].name } } })
  assert.deepEqual(navigations, ['/pages/reading/reading?kind=guide&name=guide-test'])
})

test('支具档案按历史计划区分漏记、低于目标、确认未穿和仅随访', () => {
  const core = require(join(compiled, 'services/brace-ledger.js'))
  const log = core.blankWearLog()
  const at = (value) => core.parseLocalTime(...value.split(' '))
  log.sessions.push({ id: 'overnight', start: at('2016-11-20 22:00'), end: at('2016-11-21 06:00') },
    { id: 'overlap', start: at('2016-11-21 04:00'), end: at('2016-11-21 08:00') })
  log.plans.push({ day: '2016-11-20', type: 'wear', minutes: 720 },
    { day: '2016-11-21', type: 'wear', minutes: 480 },
    { day: '2016-11-24', type: 'followup', minutes: null })
  log.confirmedZero.push('2016-11-23')
  const now = at('2026-11-20 13:00')
  const days = core.dailyWear(core.parseBackup(core.serializeBackup(log)), '2016-11-20', '2026-11-20', now)
  assert.equal(days.length, 3653)
  assert.deepEqual(days.slice(0, 5).map(row => [row.state, row.recordedMinutes]),
    [['below', 120], ['met', 480], ['unrecorded', null], ['zero', 0], ['followup', null]])
  assert.equal(days[days.length - 1].state, 'today')
  assert.deepEqual(core.summarizeWear(days), { recorded: 3, minutes: 600, below: 1, missing: 1, zero: 1, met: 1 })
  assert.equal(core.chartWear(days).length, 11)
})

test('矫正鞋把过夜与午睡分别计入对应日期，重叠时间只计一次', () => {
  const { dayWear, parseLocalTime, lastSevenDays } = require(join(compiled, 'services/brace-wear.js'))
  const at = (day, time) => parseLocalTime(day, time)
  const yesterday = '2026-11-20'
  const today = '2026-11-21'
  const state = {
    sessions: [
      { id: 'overnight', start: at(yesterday, '22:00'), end: at(today, '07:30') },
      { id: 'duplicate', start: at(today, '06:00'), end: at(today, '07:45') },
      { id: 'nap', start: at(today, '13:00'), end: at(today, '14:15') },
    ],
    activeStart: at(today, '21:15'), targetMinutes: null,
  }
  assert.equal(dayWear(state, yesterday, at(today, '21:30')).elapsed / 60_000, 120)
  assert.equal(dayWear(state, today, at(today, '21:30')).elapsed / 60_000, 555)
  assert.equal(dayWear(state, today, at(today, '21:30')).includesActive, true)
  assert.equal(lastSevenDays(today).at(-1), '2026-11-15')
  assert.ok(Number.isNaN(at('2026-02-30', '08:00')))
  assert.ok(Number.isNaN(at(today, '24:00')))
})

test('矫正鞋页面离线计时跨重开，支持补记、编辑、删除与自填目标', () => {
  const { parseLocalTime } = require(join(compiled, 'services/brace-wear.js'))
  const originalNow = Date.now
  const storage = new Map()
  const day = '2026-11-21'
  const event = dataset => ({ currentTarget: { dataset } })
  const update = (page, field, value) => page.changeTime({ ...event({ field }), detail: { value } })
  const pages = []
  const open = () => {
    const { page, requests } = openPage('brace-wear', () => assert.fail('穿戴记录不调用网络'), { storage })
    pages.push(page)
    page.onShow()
    assert.deepEqual(requests, [])
    return page
  }
  try {
    Date.now = () => parseLocalTime(day, '08:00')
    const first = open()
    assert.equal(first.data.week.at(-1).day, day)
    assert.equal(first.data.week.at(-1).total, '无记录')
    first.toggleWear()
    assert.equal(first.data.active, true)
    first.onHide()

    Date.now = () => parseLocalTime(day, '09:30')
    const page = open()
    assert.equal(page.data.elapsed, '1 小时 30 分钟')
    assert.equal(page.data.activeElapsed, '1 小时 30 分钟')
    page.toggleWear()
    assert.equal(page.data.active, false)
    assert.equal(page.data.sessions.length, 1)
    page.chooseDay(event({ day: '2026-11-20' }))
    assert.equal(page.data.selectedLabel, '11月20日')
    page.addSession()
    assert.equal(page.data.selectedDay, '2026-11-20')
    assert.equal(page.data.form.startDay, '2026-11-20')
    page.closeForm()
    page.chooseDay(event({ day }))
    page.addSession()
    update(page, 'startTime', '06:00')
    update(page, 'endTime', '06:30')
    page.saveSession()
    assert.equal(page.data.elapsed, '2 小时 0 分钟')

    const recorded = page.data.sessions.at(-1)
    page.editSession(event({ id: recorded.id }))
    update(page, 'endTime', '07:00')
    page.saveSession()
    assert.equal(page.data.elapsed, '2 小时 30 分钟')
    wx.showModal = options => options.success({ confirm: true })
    page.removeSession(event({ id: recorded.id }))
    assert.equal(page.data.elapsed, '1 小时 30 分钟')

    page.openTarget()
    page.changeHours({ detail: { value: '12' } })
    page.saveTarget()
    assert.equal(page.data.target, '12 小时 0 分钟')
    assert.equal(page.data.targetPercent, 12.5)
    const restarted = open()
    assert.equal(restarted.data.target, '12 小时 0 分钟')
    assert.equal(restarted.data.elapsed, '1 小时 30 分钟')
  } finally {
    for (const page of pages) page.onUnload()
    Date.now = originalNow
  }
})

test('真实 AppID 连接弯弯云托管，游客继续使用本地联调地址', async () => {
  const path = join(compiled, 'app.js')
  function launch(appId, envVersion, query) {
    let app
    const calls = []
    global.App = options => { app = options }
    global.wx = {
      getAccountInfoSync: () => ({ miniProgram: { appId, envVersion } }),
      cloud: { init: options => calls.push(options) },
    }
    delete require.cache[require.resolve(path)]
    require(path)
    app.onLaunch({ query })
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

  const demo = launch('wx1234567890abcdef', 'develop', { demo: '1' })
  assert.deepEqual(demo.calls, [])
  assert.equal(demo.config.demoMode, true)
  assert.equal(demo.config.useCloudContainer, false)
  const local = launch('wx1234567890abcdef', 'develop', { local: 'mysql' })
  assert.deepEqual(local.calls, [])
  assert.equal(local.config.demoMode, false)
  assert.equal(local.config.useCloudContainer, false)
  assert.match(local.config.apiBase, /^http:\/\/127\.0\.0\.1:18091\//)
  for (const envVersion of ['trial', 'release']) {
    const live = launch('wx1234567890abcdef', envVersion, { demo: '1', local: 'mysql' })
    assert.equal(live.config.demoMode, false)
    assert.equal(live.config.useCloudContainer, true)
  }
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

test('原创导读保留发布快照层级和列表，并过滤可执行内容', async () => {
  const { page } = openPage('reading', url => {
    assert.equal(url.pathname, '/api/posts/guide-a')
    return { data: { title: '导读', publishTime: '2026-11-19T00:00:00Z',
      content: '<h1>导读</h1><hr><h2 id="intro">小标题</h2><p>正文 &amp; &#x8d44;&#26009;</p><script>alert(1)</script><img src="https://example.test/pixel"><ul><li>\n<p onclick="evil()"><strong>出处</strong></p>\n</li></ul>' } }
  })
  page.onLoad({ kind: 'guide', name: 'guide-a' })
  await page.load()
  const [heading, paragraph, list] = page.data.body
  assert.equal(heading.name, 'h2')
  assert.equal(paragraph.children[0].text, '正文 & 资料')
  assert.equal(list.name, 'ul')
  assert.equal(list.children[0].children[0].children[0].name, 'strong')
  assert.doesNotMatch(JSON.stringify(page.data.body), /alert|onclick|https:/)
  assert.equal(page.data.date, '2026-11-19')
})

test('阶段页加载归类文章，更多入口保留阶段并单独分页', async () => {
  const summary = { name: 'guide-a', title: '刚发现导读', excerpt: '摘要' }
  const respond = (url) => {
    if (url.pathname.endsWith('/stage-posts')) {
      assert.equal(url.searchParams.get('stage'), 'JUST_FOUND')
      return { data: { page: 1, size: 3, total: 4, items: [summary] } }
    }
    assert.ok(url.pathname.endsWith('/resources'))
    return { data: { page: 1, size: 20, total: 0, items: [] } }
  }
  const { page } = openPage('stage', respond)
  page.onLoad({ key: 'JUST_FOUND' })
  page.onShow()
  await settle()
  assert.equal(page.data.heading, '刚发现')
  assert.equal(page.data.articles[0].title, '刚发现导读')
  assert.equal(page.data.moreArticles, true)
  const { page: topics } = openPage('topics', respond)
  topics.onLoad({ kind: 'guide', stage: 'JUST_FOUND' })
  await topics.fetch(1)
  assert.equal(topics.data.items[0].name, 'guide-a')
  assert.equal(topics.data.hasNext, true)
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

test('站内搜索命中内置检查简称，第二页只展示公开资料', async () => {
  const { page } = openPage('search', url => ({
    data: { page: Number(url.searchParams.get('page')), size: 20, total: 21, items: [item('公开资料')] },
  }))

  page.onInput({ detail: { value: 'ＣＭＡ' } })
  page.doSearch()
  assert.deepEqual(page.data.prenatalResults.map(guide => guide.key), ['chromosome'])
  await settle()
  assert.deepEqual(page.data.items.map(resource => resource.name), ['公开资料'])

  page.nextPage()
  await settle()
  assert.equal(page.data.page, 2)
  assert.deepEqual(page.data.prenatalResults, [])
})

test('公开接口不可用时仍能查到「羊穿」，内置导读遵循阶段和类型筛选', async () => {
  const { page } = openPage('search', () => null)
  await page.loadFilters()
  page.onInput({ detail: { value: '羊穿' } })
  page.doSearch()
  await settle()
  assert.match(page.data.error, /公开资料暂时不可用/)
  assert.deepEqual(page.data.history, ['羊穿'])
  assert.deepEqual(page.data.prenatalResults.map(guide => guide.key), ['amniocentesis'])

  const postnatalIndex = page.data.stages.findIndex(stage => stage.key === 'POSTNATAL_TREATMENT')
  page.onStage({ detail: { value: String(postnatalIndex) } })
  await settle()
  assert.deepEqual(page.data.prenatalResults, [])

  const prenatalIndex = page.data.stages.findIndex(stage => stage.key === 'PRENATAL')
  const paperIndex = page.data.materials.findIndex(type => type.key === 'PAPER')
  page.onStage({ detail: { value: String(prenatalIndex) } })
  await settle()
  page.onType({ detail: { value: String(paperIndex) } })
  await settle()
  assert.deepEqual(page.data.prenatalResults, [])

  const originalIndex = page.data.materials.findIndex(type => type.key === 'ORIGINAL')
  page.onType({ detail: { value: String(originalIndex) } })
  await settle()
  assert.deepEqual(page.data.prenatalResults.map(guide => guide.key), ['amniocentesis'])
  page.clearKeyword()
  assert.deepEqual(page.data.prenatalResults, [])
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


test('首页阶段加载失败时保留五个入口，资料栏目仍可读取专题及精选资料', async () => {
  const respond = url => {
    if (url.pathname.endsWith('/stages')) return { data: '<html>登录</html>' }
    if (url.pathname.endsWith('/topics')) return { data: { items: [{ name: 't1', title: '专题一' }] } }
    return { data: { items: [item('r1')] } }
  }
  const { page: home, requests } = openPage('index', respond)
  await home.onLoad()
  assert.match(home.data.error, /阶段/)
  assert.equal(home.data.stages.length, 5)
  assert.match(home.data.stages[0].url, /key=JUST_FOUND/)
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

test('五个阶段可以离线查看准备事项，并进入各自可用的工具', async () => {
  const config = JSON.parse(readFileSync(join(project, 'app.json'), 'utf8'))
  const stages = ['JUST_FOUND', 'PRENATAL', 'POSTNATAL_TREATMENT', 'BRACE_DAILY', 'LONG_TERM']
  const expectedTool = ['downloads', 'prenatal', 'cast', 'channels', 'channels']
  for (const [index, key] of stages.entries()) {
    const { page, getClipboard } = openPage('stage', () => null)
    page.onLoad({ key })
    await page.fetch(1)
    assert.match(page.data.error, /无法加载资料/)
    assert.ok(page.data.guide.summary)
    assert.equal(page.data.guide.actions[0].url.split('/')[2], expectedTool[index])
    assert.match(page.data.prepareUrl, new RegExp('stage=' + key + '$'))
    for (const { url } of page.data.guide.actions) {
      assert.ok(config.pages.includes(url.split('?')[0].slice(1)))
    }
    page.copyGuideSource()
    assert.match(getClipboard(), /^https:\/\//)
  }
  const { page } = openPage('stage', () => null)
  page.onLoad({})
  assert.equal(page.data.guide, null)
})

test('阶段问诊清单复制当前阶段的问题，普通入口保留通用问题', () => {
  const { page, getClipboard } = openPage('preparation', () => assert.fail('固定问题无需联网'))
  page.onLoad({ stage: 'BRACE_DAILY' })
  assert.equal(page.data.showUltrasoundChecklist, false)
  page.onChange({ detail: { value: ['1'] } })
  page.copyQuestions()
  assert.match(getClipboard(), /鞋或连杆/)
  assert.doesNotMatch(getClipboard(), /现场演示/)
  page.onLoad({ stage: 'invalid' })
  assert.equal(page.data.showUltrasoundChecklist, true)
  assert.deepEqual(page.data.selected, [])
  assert.match(page.data.prompts[0], /这次沟通/)
})

test('就诊和社交渠道区分用途，仅在点击时复制固定来源或搜索词', () => {
  const { page, getClipboard, navigations } = openPage('channels', () => assert.fail('渠道目录无需联网'))
  const copy = (key, field) => page.copy({ currentTarget: { dataset: { key, field } } })
  page.onLoad({ period: 'prenatal' })
  assert.equal(page.data.channels[0].key, 'prenatal-clinic')
  assert.equal(getClipboard(), '')
  copy('haodf', 'source')
  assert.match(getClipboard(), /^https:\/\/www\.haodf\.com\//)
  page.onLoad({ type: 'social' })
  assert.equal(page.data.social, true)
  copy('xiaohongshu-families', 'keyword')
  assert.match(getClipboard(), /马蹄内翻足/)
  copy('haodf', 'source')
  assert.match(getClipboard(), /马蹄内翻足/)
  copy('douyin-sun', 'source')
  assert.match(getClipboard(), /^https:\/\/www\.smu\.edu\.cn\//)
  assert.deepEqual(navigations, [])
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
  const { page, requests } = openPage('index', (url, req) => {
    assert.equal(req.header['X-Wanwan-Client'], 'wechat-miniprogram')
    assert.equal(req.header['X-WX-SERVICE'], 'xiaojiaoya')
    if (url.pathname.includes('api.xiaojiaoya.run')) return { status: 302, data: '' }
    return { data: url.pathname.endsWith('/stages')
      ? [{ key: 'JUST_FOUND', label: '初次发现', order: 0 }]
      : { items: [] } }
  }, cloud)
  await page.loadHome()
  assert.equal(page.data.stages[0].label, '初次发现')
  assert.equal(page.data.error, '')
  assert.ok(requests.includes('/apis/api.wanwan.run/v1alpha1/stages'))

  const cast = openPage('cast', (_, req) => {
    assert.equal(req.header['X-Wanwan-Client'], 'wechat-miniprogram')
    return { status: 302, data: '' }
  }, cloud)
  await cast.page.refresh()
  assert.deepEqual(cast.requests, ['/apis/api.xiaojiaoya.run/v1alpha1/cast-journal-config'])
  assert.equal(cast.page.data.config, null)
  assert.equal(cast.page.data.error, '')
})

test('直连后端的微信小程序请求也携带来源标记', async () => {
  const channels = []
  const { page } = openPage('index', (url, req) => {
    channels.push(req.header['X-Wanwan-Client'])
    return { data: url.pathname.endsWith('/stages') ? [] : { items: [] } }
  })
  await page.loadHome()
  assert.ok(channels.length > 0)
  assert.deepEqual([...new Set(channels)], ['wechat-miniprogram'])
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
  const { prenatalGuides } = require(join(compiled, 'services/prenatal-guides.js'))
  assert.deepEqual(prenatalGuides, json)
  assert.deepEqual(page.data.groups.flatMap(group => group.items.map(item => item.key)), json.map(guide => guide.key))
  page.onLoad({ key: 'exome' })
  assert.match(page.data.selected.title, /全外显子/)
  page.copySource()
  assert.equal(getClipboard(), page.data.selected.sourceUrl)
  assert.equal(requests.length, 0)
})

test('产前目录按项目分组，支持常用简称、全角字母和清除搜索', () => {
  const { page, requests } = openPage('prenatal', () => assert.fail('目录搜索不需要网络'))
  assert.deepEqual(page.data.groups.map(group => group.items.length), [2, 3, 1])
  for (const [query, key] of [['羊穿', 'amniocentesis'], ['cma 核型', 'chromosome'], [' ＷＥＳ ', 'exome'], ['nipt', 'screening']]) {
    page.search({ detail: { value: query } })
    assert.deepEqual(page.data.groups.flatMap(group => group.items.map(item => item.key)), [key])
  }
  page.search({ detail: { value: '没有匹配的名称' } })
  assert.deepEqual(page.data.groups, [])
  page.clearSearch()
  assert.equal(page.data.query, '')
  assert.equal(page.data.groups.flatMap(group => group.items).length, 6)
  assert.equal(requests.length, 0)
})

test('产前导读保留公众号直达链接，可复制问题，从目录打开时返回原目录', () => {
  const { page, getClipboard, navigations } = openPage('prenatal', () => assert.fail('查看导读不需要网络'))
  const route = 'pages/prenatal/prenatal'
  global.getCurrentPages = () => [{ route }, { route }]
  wx.navigateBack = () => navigations.push('back')
  wx.redirectTo = ({ url }) => navigations.push(url)
  page.onLoad({ key: 'amniocentesis' })
  assert.equal(page.data.category, '取样与遗传检测')
  assert.equal(page.onShareAppMessage().path, '/' + route + '?key=amniocentesis')
  page.copyQuestions()
  assert.equal(getClipboard(), page.data.selected.sections.find(section => section.heading === '可以问医生').body)
  page.openDirectory()
  global.getCurrentPages = () => [{ route }]
  page.onLoad({ key: 'unknown' })
  assert.equal(page.data.missing, true)
  assert.equal(page.onShareAppMessage().path, '/' + route)
  page.openDirectory()
  assert.deepEqual(navigations, ['back', '/' + route])
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

function installFileSystem(keys = []) {
  const files = new Set(keys)
  const unlinked = []
  const directory = { readable: true, removable: true }
  const userPath = 'wxfile://usr'
  wx.env = { USER_DATA_PATH: userPath }
  wx.getFileSystemManager = () => ({
    access: ({ path, success, fail }) => files.has(path.slice(userPath.length + 1)) ? success() : fail({}),
    readdir: ({ dirPath, success, fail }) => {
      assert.equal(dirPath, userPath)
      if (directory.readable) success({ files: [...files] })
      else fail({ errMsg: 'permission denied' })
    },
    unlink: ({ filePath, success, fail }) => {
      assert.ok(filePath.startsWith(userPath + '/'))
      unlinked.push(filePath)
      const key = filePath.slice(userPath.length + 1)
      if (directory.removable && files.delete(key)) success()
      else fail({ errMsg: 'unlink failed' })
    },
  })
  return { files, unlinked, directory }
}

test('已下载找回旧清单，旧附件可清理，忽略其他本地文件和失效索引', async () => {
  const { downloadFileKey, ultrasoundChecklist } = require(join(compiled, 'services/downloads.js'))
  const pdf = downloadFileKey(ultrasoundChecklist)
  const unknown = 'xiaojiaoya-ab12.zip'
  const storage = new Map([['xiaojiaoya-saved-files', [
    { key: 'xiaojiaoya-9876.pdf', fileName: '已丢失.pdf', resourceName: 'lost', savedAt: 2000 },
    { key: '../private.pdf', fileName: '无效项.pdf', resourceName: 'bad', savedAt: 3000 },
  ]]])
  const { page, requests } = openPage('saved-files', () => assert.fail('本机列表不读取后端'), { storage })
  installFileSystem([pdf, unknown, 'patient.pdf', 'xiaojiaoya-1234.exe', '../private.pdf'])

  await page.onShow()
  assert.equal(page.data.files.length, 2)
  const checklist = page.data.files.find(file => file.key === pdf)
  assert.equal(checklist.fileName, ultrasoundChecklist.fileName)
  assert.equal(checklist.url, '/pages/downloads/downloads')
  const oldCopy = page.data.files.find(file => file.key === unknown)
  assert.equal(oldCopy.fileName, '以前保存的附件')
  assert.equal(oldCopy.url, '')
  assert.equal(requests.length, 0)
})

test('确认后只移除指定文件，取消与删除失败保留原副本', async () => {
  const key = 'xiaojiaoya-abcd.pdf'
  const { page, toasts } = openPage('saved-files', () => assert.fail('不需要网络'))
  const { files, unlinked, directory } = installFileSystem([key, 'other.pdf'])
  let modal
  wx.showModal = value => { modal = value }
  await page.refresh()
  const event = { currentTarget: { dataset: { key } } }
  page.confirmRemoval(event)
  assert.equal(modal.confirmText, '移除')
  modal.success({ confirm: false })
  assert.equal(unlinked.length, 0)
  assert.equal(page.data.files.length, 1)

  directory.removable = false
  page.confirmRemoval(event)
  modal.success({ confirm: true })
  await settle()
  assert.match(page.data.removalError, /未能移除/)
  assert.ok(files.has(key))

  directory.removable = true
  await page.remove(key)
  assert.deepEqual([...files], ['other.pdf'])
  assert.equal(page.data.files.length, 0)
  assert.equal(toasts.at(-1), '已移除')
  const { deleteSavedFile } = require(join(compiled, 'services/download-library.js'))
  await assert.rejects(deleteSavedFile('../other.pdf'), /Invalid saved file/)
  assert.ok(unlinked.every(path => path === 'wxfile://usr/' + key))
})

test('读目录失败提供重试，恢复后文件重新出现', async () => {
  const { page } = openPage('saved-files', () => assert.fail('不需要网络'))
  const { directory } = installFileSystem(['xiaojiaoya-a123.png'])
  directory.readable = false
  await page.onShow()
  assert.match(page.data.error, /无法读取/)
  assert.equal(page.data.loading, false)
  directory.readable = true
  await page.refresh()
  assert.equal(page.data.error, '')
  assert.equal(page.data.files[0].suffix, 'PNG')
})

test('已存在的远程副本补登记；重新打开时核对附件版本、撤回和分享路径', async () => {
  const { downloadFileKey, approvedDownload } = require(join(compiled, 'services/downloads.js'))
  const initial = { fileName: '检查清单.pdf', url: 'https://example.test/a.pdf?download=1' }
  const key = downloadFileKey(approvedDownload('r1', initial))
  const storage = new Map()
  const resource = { ...item('r1'), attachment: initial }
  const page1 = openPage('downloads', () => ({ data: resource }), { storage })
  installFileSystem([key])
  await page1.page.onLoad({ resource: 'r1' })
  assert.ok(page1.page.data.localPath)
  const saved = openPage('saved-files', () => assert.fail('目录无需后端'), { storage })
  installFileSystem([key])
  await saved.page.refresh()
  assert.equal(saved.page.data.files[0].fileName, initial.fileName)
  assert.match(saved.page.data.files[0].url, /resource=r1&copy=/)
  assert.doesNotMatch(JSON.stringify([...storage.values()]), /https:\/\//)

  const page2 = openPage('downloads', () => ({ data: resource }), { storage })
  installFileSystem([key])
  await page2.page.onLoad({ resource: 'r1', copy: key })
  assert.ok(page2.page.data.localPath)
  assert.equal(page2.page.onShareAppMessage().path, '/pages/downloads/downloads?resource=r1')
  resource.attachment = { ...initial, url: 'https://example.test/updated.pdf' }
  await page2.page.onShow()
  assert.equal(page2.page.data.versionChanged, true)
  assert.equal(page2.page.data.localPath, '')
  page2.page.openResource()
  assert.equal(page2.navigations[0], '/pages/detail/detail?name=r1')
  resource.linkStatus = 'SOURCE_RETRACTED'
  await page2.page.onShow()
  assert.match(page2.page.data.error, /已停用/)
  assert.equal(page2.page.data.versionChanged, false)
})

test('删除清单后返回原下载页可重新下载', async () => {
  const { downloadFileKey, ultrasoundChecklist } = require(join(compiled, 'services/downloads.js'))
  const key = downloadFileKey(ultrasoundChecklist)
  const { page, requests } = openPage('downloads', () => assert.fail('内置文件不需要网络'))
  const { files } = installFileSystem([key])
  await page.onLoad({})
  assert.ok(page.data.localPath)
  files.delete(key)
  await page.onShow()
  assert.equal(page.data.localPath, '')
  assert.equal(page.data.kind, 'document')
  assert.equal(requests.length, 0)
})

test('搜索记录保持最近八条，去空格和去重，点击时才发起搜索', async () => {
  const storage = new Map()
  const respond = () => ({ data: { items: [], page: 1, size: 20, total: 0 } })
  const first = openPage('search', respond, { storage })
  for (const keyword of [...Array.from({ length: 9 }, (_, i) => '复诊' + i), ' 复诊5 ']) {
    first.page.onInput({ detail: { value: keyword } })
    first.page.doSearch()
    await settle()
  }
  assert.deepEqual(first.page.data.history, ['复诊5', '复诊8', '复诊7', '复诊6', '复诊4', '复诊3', '复诊2', '复诊1'])

  const reopened = openPage('search', respond, { storage })
  reopened.page.onShow()
  assert.equal(reopened.requests.length, 0)
  assert.deepEqual(reopened.page.data.history, first.page.data.history)
  reopened.page.pickKeyword({ currentTarget: { dataset: { keyword: '复诊3' } } })
  await settle()
  assert.equal(new URL(reopened.requests[0]).searchParams.get('keyword'), '复诊3')
  assert.equal(reopened.page.data.history[0], '复诊3')
  reopened.page.clearKeyword()
  assert.equal(reopened.page.data.submittedKeyword, '')
  assert.equal(reopened.page.data.history.length, 8)
})

test('空关键词不发请求，搜索失败不登记，成功重试后才能清空记录', async () => {
  let works = false
  const storage = new Map([['other', '保留']])
  const { page, requests } = openPage('search', () => works
    ? { data: { items: [], page: 1, size: 20, total: 0 } } : { status: 503 }, { storage })
  page.doSearch()
  assert.equal(requests.length, 0)
  page.onInput({ detail: { value: '石膏' } })
  page.doSearch()
  await settle()
  assert.deepEqual(page.data.history, [])
  assert.match(page.data.error, /暂时不可用/)
  works = true
  page.retry()
  await settle()
  assert.deepEqual(page.data.history, ['石膏'])

  page.clearKeyword()
  let modal
  wx.showModal = options => { modal = options }
  page.confirmClearHistory()
  modal.success({ confirm: false })
  assert.deepEqual(page.data.history, ['石膏'])
  page.confirmClearHistory()
  modal.success({ confirm: true })
  assert.deepEqual(page.data.history, [])
  assert.equal(storage.get('other'), '保留')
})

test('专题和导读精准转发，加载中和撤回后只分享公开资料库', async () => {
  let status = 200
  const { page, navigations } = openPage('reading', url => ({
    status,
    data: url.pathname.includes('/topics/') ? { title: '产前专题', intro: '', resources: [] }
      : { title: '导读', content: '<p>公开</p>' },
  }))
  const fallback = '/pages/library/library'
  page.onLoad({ kind: 'topic', name: '专题%20一' })
  assert.equal(page.onShareAppMessage().path, fallback)
  await page.load()
  assert.deepEqual(page.onShareAppMessage(), {
    title: '产前专题', path: '/pages/reading/reading?kind=topic&name=%E4%B8%93%E9%A2%98%20%E4%B8%80',
  })
  page.onLoad({ kind: 'guide', name: 'guide-a' })
  await page.load()
  assert.equal(page.onShareAppMessage().path, '/pages/reading/reading?kind=guide&name=guide-a')
  status = 404
  await page.load()
  assert.match(page.data.error, /已下线/)
  assert.equal(page.onShareAppMessage().path, fallback)
  page.backToLibrary()
  assert.equal(navigations[0], fallback)
})

test('相册权限失败后保留本机图片，可重试保存', async () => {
  const image = { fileName: '资料.png', url: 'https://example.test/a.png' }
  const { downloadFileKey, approvedDownload } = require(join(compiled, 'services/downloads.js'))
  const key = downloadFileKey(approvedDownload('r1', image))
  const { page } = openPage('downloads', () => ({ data: { ...item('r1'), attachment: image } }))
  installFileSystem([key])
  let allowed = false
  wx.saveImageToPhotosAlbum = ({ success, fail }) => allowed ? success() : fail({})
  await page.onLoad({ resource: 'r1' })
  page.saveToAlbum()
  assert.match(page.data.status, /相册权限/)
  assert.ok(page.data.localPath)
  allowed = true
  page.saveToAlbum()
  assert.match(page.data.status, /已保存到手机相册/)
})

test('首页选择穿戴阶段后可直接开始并保存计时', () => {
  const core = require(join(compiled, 'services/brace-ledger.js'))
  const storage = new Map()
  const { page, requests } = openPage('index', () => assert.fail('首页计时无需网络'), { storage })
  const originalNow = Date.now
  try {
    Date.now = () => core.parseLocalTime('2026-11-22', '09:00')
    page.onShow()
    assert.equal(page.data.phase, 0)
    page.choosePhase({ detail: { value: '4' } })
    assert.equal(page.data.wearTime, '今天还没记录')
    page.toggleWear()
    assert.equal(page.data.active, true)
    Date.now = () => core.parseLocalTime('2026-11-22', '10:00')
    page.toggleWear()
    assert.equal(page.data.wearTime, '1 小时 0 分钟')
    assert.equal(page.data.active, false)
    assert.deepEqual(requests, [])
  } finally { Date.now = originalNow }
})

test('复诊摘要显示覆盖分母、未记录和医嘱变更，时间线保留历史备份里的观察', () => {
  const core = require(join(compiled, 'services/brace-ledger.js'))
  const { followupSummary, treatmentTimeline } = require(join(compiled, 'services/followup-summary.js'))
  const today = '2026-11-22'
  const at = core.parseLocalTime
  const log = {
    ...core.blankWearLog(),
    sessions: [{ id: 's1', start: at('2026-11-20', '08:00'), end: at('2026-11-20', '11:00') }],
    plans: [{ day: '2026-11-17', type: 'wear', minutes: 480 }, { day: '2026-11-21', type: 'wear', minutes: 360 }],
    visits: [{ id: 'v1', day: '2026-11-19', kind: '复诊', note: '' }, { id: 'v2', day: '2026-11-21', kind: '更换矫正鞋', note: '' }],
    confirmedZero: ['2026-11-21'],
    observations: [{ id: 'o1', day: '2026-11-20', kind: '皮肤不适', side: '左侧', contacted: true, outcome: '记录结果' }],
    questions: ['下次什么时候复诊？'],
  }
  const restored = core.parseBackup(core.serializeBackup(log))
  const summary = followupSummary(restored, today, at(today, '13:00'))
  assert.equal(summary.from, '2026-11-19')
  assert.equal(summary.total, 4)
  assert.equal(summary.recorded, 2)
  assert.equal(summary.unknown, 2)
  assert.equal(summary.zero, 1)
  assert.equal(summary.below, 1)
  assert.equal(summary.average, '1 小时 30 分钟')
  assert.equal(summary.plans[0].day, '2026-11-21')
  assert.match(summary.adjustment, /更换矫正鞋/)
  const timeline = treatmentTimeline(restored, [{ id: '1', castDate: '2026-11-18', care: '', visitAt: null, side: '双侧', sequence: 3 }])
  assert.ok(timeline.some(event => event.title === '第 3 次石膏' && event.note === '双侧'))
  assert.ok(timeline.some(event => event.title === '皮肤不适' && event.note.includes('已联系治疗团队')))
})

test('同步在云端已改变时阻止直接上传，本机记录仍可用', async () => {
  const core = require(join(compiled, 'services/brace-ledger.js'))
  const storage = new Map([['wanwan-wear-cloud-revision', 'v1']])
  const { page } = openPage('brace-sync', (url, req) => {
    assert.equal(url.pathname, '/api/brace-archive')
    assert.equal(req.data.action, 'read')
    return { data: { revision: 'v2', consentVersion: 'brace-v1', consented: true,
      updatedAt: '2026-11-22T08:00:00Z', archive: core.serializeBackup({ ...core.blankWearLog(), questions: ['云端新问题'] }) } }
  }, { storage })
  wx.login = options => options.success({ code: 'test-login' })
  await page.upload()
  assert.equal(page.data.conflict, true)
  assert.match(page.data.message, /另一台设备/)
  assert.equal(storage.get('wanwan-wear-cloud-revision'), 'v1')
})


test('导读目录与重点速览、资料卡折叠出处、阶段分栏与首页快捷选阶段正常联动', async () => {
  const reading = openPage('reading', () => ({
    data: {
      name: 'g1',
      title: '全景综述',
      content: '<h1>全景综述</h1><h2>一、病因与诊断</h2><p>正文一</p><h2>二、Ponseti 治疗</h2><p>正文二</p>',
      publishTime: '2026-11-22T10:00:00Z',
    },
  }))
  const scrolled = []
  wx.pageScrollTo = opts => scrolled.push(opts.selector)
  reading.page.onLoad({ kind: 'guide', name: 'g1' })
  await reading.page.load()
  assert.deepEqual(reading.page.data.highlights, ['一、病因与诊断', '二、Ponseti 治疗'])
  assert.equal(reading.page.data.toc.length, 2)
  assert.equal(reading.page.data.openSections[reading.page.data.toc[0].id], true)
  assert.equal(reading.page.data.openSections[reading.page.data.toc[1].id], false)
  assert.ok(reading.page.data.readMinutes >= 1)
  reading.page.toggleToc()
  assert.equal(reading.page.data.showToc, true)
  reading.page.jumpToSection({ currentTarget: { dataset: { id: reading.page.data.toc[1].id } } })
  assert.equal(reading.page.data.showToc, false)
  assert.equal(reading.page.data.openSections[reading.page.data.toc[1].id], true)
  assert.deepEqual(scrolled, [`#${reading.page.data.toc[1].id}`])

  const detail = openPage('detail', () => ({ data: item('r-meta') }))
  detail.page.onLoad({ name: 'r-meta' })
  await detail.page.loadDetail()
  assert.equal(detail.page.data.metaExpanded, false)
  assert.equal(detail.page.data.resource.entryLabel, '原文出处')
  detail.page.toggleMeta()
  assert.equal(detail.page.data.metaExpanded, true)

  const stage = openPage('stage', () => ({ data: { items: [item('r1'), item('r2'), item('r3'), item('r4')], page: 1, size: 20, total: 4 } }))
  stage.page.onLoad({ key: 'JUST_FOUND' })
  await stage.page.fetch(1)
  assert.equal(stage.page.data.previewItems.length, 3)
  assert.equal(stage.page.data.items.length, 4)
  assert.equal(stage.page.data.totalItems, 4)
  stage.page.selectTab({ currentTarget: { dataset: { tab: 'guides' } } })
  assert.equal(stage.page.data.activeTab, 'guides')
  stage.page.selectType({ currentTarget: { dataset: { index: '2' } } })
  await settle()
  assert.equal(stage.page.data.typeIndex, 2)

  const lib = openPage('library', url => {
    if (url.pathname.endsWith('/posts') || url.pathname.endsWith('/stage-posts')) {
      return { data: { items: [{ name: 'p1', title: '产前导读', excerpt: '产前导读 正文内容' }], page: 1, size: 5, total: 1 } }
    }
    if (url.pathname.endsWith('/topics')) return { data: { items: [], page: 1, size: 2, total: 0 } }
    return { data: { items: [item('r1')], page: 1, size: 3, total: 1 } }
  })
  lib.page.selectStage({ currentTarget: { dataset: { key: 'JUST_FOUND' } } })
  await settle()
  assert.equal(lib.page.data.selectedStage, 'JUST_FOUND')
  assert.equal(lib.page.data.guides[0].excerpt, '正文内容')
  assert.equal(lib.page.data.resources.length, 1)

  const home = openPage('index', () => ({ data: [] }))
  home.page.selectPhase({ currentTarget: { dataset: { phase: '1' } } })
  assert.equal(home.page.data.phase, 1)
  assert.ok(home.page.data.quickTiles.some(tile => tile.title.includes('超声复查清单')))
  assert.ok(!home.page.data.quickTiles.some(tile => tile.title.includes('穿戴') || tile.title.includes('石膏')))
  home.page.selectPhase({ currentTarget: { dataset: { phase: '4' } } })
  assert.equal(home.page.data.phase, 4)
  assert.ok(home.page.data.quickTiles.some(tile => tile.title.includes('穿戴')))
})

test('全局切换回归：资料页切阶段立即清空并切换资料卡、阶段页切回全部重置筛选、首页计时中可切阶段', async () => {
  const byStage = {
    '': [item('r-all-1'), item('r-all-2')],
    JUST_FOUND: [item('r-jf-1')],
    POSTNATAL_TREATMENT: [item('r-post-1')],
    PRENATAL: [],
  }
  const lib = openPage('library', url => {
    if (url.pathname.endsWith('/topics')) return { data: { items: [{ name: 't1', title: '专题一', resourceCount: 2 }], page: 1, size: 6, total: 1 } }
    if (url.pathname.endsWith('/posts') || url.pathname.endsWith('/stage-posts')) {
      const st = url.searchParams.get('stage') || 'ALL'
      return { data: { items: [{ name: `g-${st}`, title: `${st} 导读`, excerpt: '摘要' }], page: 1, size: 5, total: 1 } }
    }
    const st = url.searchParams.get('stage') || ''
    return { data: { items: byStage[st] ?? [], page: 1, size: 3, total: (byStage[st] ?? []).length } }
  })
  await lib.page.onShow()
  assert.deepEqual(lib.page.data.resources.map(r => r.name), ['r-all-1', 'r-all-2'])

  lib.page.selectStage({ currentTarget: { dataset: { key: 'POSTNATAL_TREATMENT' } } })
  assert.deepEqual(lib.page.data.resources, [])
  assert.equal(lib.page.data.loading, true)
  await settle()
  assert.deepEqual(lib.page.data.resources.map(r => r.name), ['r-post-1'])

  lib.page.selectStage({ currentTarget: { dataset: { key: 'PRENATAL' } } })
  await settle()
  assert.deepEqual(lib.page.data.resources, [])

  lib.page.resetStage()
  await settle()
  assert.equal(lib.page.data.selectedStage, '')
  assert.deepEqual(lib.page.data.resources.map(r => r.name), ['r-all-1', 'r-all-2'])

  // 阶段页：资料卡 Tab 筛选后切回「全部内容」自动恢复精选资料卡
  const stg = openPage('stage', url => {
    if (url.pathname.endsWith('/stage-posts')) return { data: { items: [], page: 1, size: 3, total: 0 } }
    const type = url.searchParams.get('type') || ''
    return { data: { items: type === 'PAPER' ? [] : [item('r-jf-1')], page: 1, size: 20, total: type === 'PAPER' ? 0 : 1 } }
  })
  stg.page.onLoad({ key: 'JUST_FOUND', label: '刚发现' })
  stg.page.onShow()
  await settle()
  assert.equal(stg.page.data.previewItems.length, 1)
  stg.page.selectTab({ currentTarget: { dataset: { tab: 'resources' } } })
  stg.page.selectType({ currentTarget: { dataset: { index: '2' } } })
  await settle()
  assert.equal(stg.page.data.items.length, 0)
  stg.page.selectTab({ currentTarget: { dataset: { tab: 'all' } } })
  await settle()
  assert.equal(stg.page.data.typeIndex, 0)
  assert.equal(stg.page.data.previewItems.length, 1)

  // 首页：计时进行中依然允许用户手动切到其他阶段
  const storage = new Map()
  const home = openPage('index', () => ({ data: [] }), { storage })
  home.page.selectPhase({ currentTarget: { dataset: { phase: '4' } } })
  home.page.toggleWear()
  assert.equal(home.page.data.active, true)
  home.page.selectPhase({ currentTarget: { dataset: { phase: '1' } } })
  assert.equal(home.page.data.phase, 1)
  assert.equal(home.page.data.active, true)
})

test('微信好友分享全链路：文章/专题/资料卡/阶段转发与好友冷启动直达落地，撤回内容不发坏链', async () => {
  const guideId = '01a20276-ac3b-7379-92b4-bf34084aaee7'
  const respond = url => {
    if (url.pathname.endsWith(`/posts/${guideId}`)) {
      return {
        data: {
          name: guideId,
          title: '《深度解读：特发性先天性马蹄内翻足全景综述》',
          publishTime: '2026-11-20T00:00:00Z',
          content: '<h2>一、核心事实</h2><p>规范治疗预后良好。</p><h2>二、治疗流程</h2><p>Ponseti 方案。</p>',
        },
      }
    }
    if (url.pathname.endsWith('/topics/t-cast')) {
      return { data: { name: 't-cast', title: '出生后石膏准备专题', intro: '专题导读', resources: [item('r-ok')] } }
    }
    if (url.pathname.endsWith('/resources/r-ok')) {
      return { data: { ...item('r-ok'), title: 'Ponseti 石膏居家观察', linkStatus: 'OK' } }
    }
    if (url.pathname.endsWith('/resources/r-ret')) {
      return { data: { ...item('r-ret'), title: '已撤回资料', linkStatus: 'SOURCE_RETRACTED' } }
    }
    if (url.pathname.endsWith('/resources/r-404')) {
      return { statusCode: 404, data: {} }
    }
    return { data: { items: [item('r-ok')], page: 1, size: 20, total: 1 } }
  }

  // 1. 发送方打开导读并分享给微信好友 + 朋友圈
  const senderGuide = openPage('reading', respond)
  senderGuide.page.onLoad({ kind: 'guide', name: guideId })
  await senderGuide.page.onShow()
  const guideCard = senderGuide.page.onShareAppMessage()
  assert.equal(guideCard.title, '《深度解读：特发性先天性马蹄内翻足全景综述》')
  assert.equal(guideCard.path, `/pages/reading/reading?kind=guide&name=${guideId}`)
  const guideTimeline = senderGuide.page.onShareTimeline()
  assert.equal(guideTimeline.query, `kind=guide&name=${guideId}`)

  // 好友点击微信卡片冷启动落地
  const sharedUrl = new URL('https://mp.local' + guideCard.path)
  const friendGuide = openPage('reading', respond)
  friendGuide.page.onLoad(Object.fromEntries(sharedUrl.searchParams.entries()))
  await friendGuide.page.onShow()
  assert.equal(friendGuide.page.data.title, '《深度解读：特发性先天性马蹄内翻足全景综述》')
  assert.equal(friendGuide.page.data.toc.length, 2)
  assert.equal(friendGuide.page.data.error, '')

  // 2. 专题分享后关闭微信转发面板（触发 onShow）不会清空专题内容
  const senderTopic = openPage('reading', respond)
  senderTopic.page.onLoad({ kind: 'topic', name: 't-cast' })
  await senderTopic.page.onShow()
  const topicCard = senderTopic.page.onShareAppMessage()
  assert.equal(topicCard.path, '/pages/reading/reading?kind=topic&name=t-cast')
  const refreshPromise = senderTopic.page.onShow()
  assert.equal(senderTopic.page.data.items.length, 1) // 不会瞬间闪白清空
  await refreshPromise

  // 3. 资料卡分享：正常卡片精准直达，已撤回/404 降级分享资料库
  const senderDetail = openPage('detail', respond)
  senderDetail.page.onLoad({ name: 'r-ok' })
  await senderDetail.page.onShow()
  const detailCard = senderDetail.page.onShareAppMessage()
  assert.equal(detailCard.title, 'Ponseti 石膏居家观察')
  assert.equal(detailCard.path, '/pages/detail/detail?name=r-ok')
  const detailRefresh = senderDetail.page.onShow()
  assert.ok(senderDetail.page.data.resource) // 分享返回不闪白屏
  await detailRefresh

  const retractedDetail = openPage('detail', respond)
  retractedDetail.page.onLoad({ name: 'r-ret' })
  await retractedDetail.page.onShow()
  assert.equal(retractedDetail.page.onShareAppMessage().path, '/pages/library/library')

  const missingDetail = openPage('detail', respond)
  missingDetail.page.onLoad({ name: 'r-404' })
  await missingDetail.page.onShow()
  assert.equal(missingDetail.page.onShareAppMessage().path, '/pages/library/library')

  // 4. 首页、资料页、阶段页、专题列表页均支持微信好友与朋友圈分享
  const home = openPage('index', respond)
  assert.equal(home.page.onShareAppMessage().path, '/pages/index/index')
  assert.ok(home.page.onShareTimeline().title.includes('小脚丫'))

  const lib = openPage('library', respond)
  assert.equal(lib.page.onShareAppMessage().path, '/pages/library/library')
  lib.page.selectStage({ currentTarget: { dataset: { key: 'JUST_FOUND' } } })
  assert.match(lib.page.onShareAppMessage().path, /^\/pages\/stage\/stage\?key=JUST_FOUND/)

  const stg = openPage('stage', respond)
  stg.page.onLoad({ key: 'BRACE_DAILY', label: '支具与日常生活' })
  assert.match(stg.page.onShareAppMessage().path, /^\/pages\/stage\/stage\?key=BRACE_DAILY/)

  const tp = openPage('topics', respond)
  tp.page.onLoad({ kind: 'guide', stage: 'JUST_FOUND' })
  assert.equal(tp.page.onShareAppMessage().path, '/pages/topics/topics?kind=guide&stage=JUST_FOUND')
})

test('阶段页为五大阶段提供重点工作摘要与二级弹出详解', () => {
  const { familyGuide } = require(join(compiled, 'services/family-guide.js'))
  for (const key of ['JUST_FOUND', 'PRENATAL', 'POSTNATAL_TREATMENT', 'BRACE_DAILY', 'LONG_TERM']) {
    const guide = familyGuide(key)
    assert.ok(guide && guide.focus, `missing focus for ${key}`)
    assert.ok(guide.focus.goal.length > 10)
    assert.equal(guide.focus.tags.length, 3)
    assert.equal(guide.focus.items.length, 3)
    assert.ok(guide.focus.reminder.length > 10)
  }

  const { page, navigations } = openPage('stage', () => ({ data: { page: 1, size: 20, total: 0, items: [] } }))
  page.onLoad({ key: 'PRENATAL', label: '产前了解与等待' })
  assert.equal(page.data.showFocusModal, false)
  assert.ok(page.data.guide.focus.tags.includes('按日期归档报告'))

  page.openStageFocus()
  assert.equal(page.data.showFocusModal, true)

  page.goPrepareFromModal()
  assert.equal(page.data.showFocusModal, false)
  assert.deepEqual(navigations, ['/pages/preparation/preparation?stage=PRENATAL'])

  page.openStageFocus()
  page.closeStageFocus()
  assert.equal(page.data.showFocusModal, false)
})

test('首页阶段与工具页在每次返回时同步，重排后所有工具仍可访问', () => {
  const storage = new Map()
  const { page: tools } = openPage('tools', () => undefined, { storage })
  const { page: home } = openPage('index', () => undefined, { storage })
  const expected = ['prenatal', 'prenatal', 'prenatal', 'cast', 'brace', 'brace']
  for (let phase = 0; phase <= 5; phase++) {
    home.selectPhase({ currentTarget: { dataset: { phase: String(phase) } } })
    tools.onShow()
    assert.equal(home.data.phase, phase)
    assert.equal(tools.data.phaseLabel, phase ? home.data.phases[phase] : '')
    assert.equal(tools.data.groups[0].key, expected[phase])
    const urls = tools.data.groups.flatMap(group => group.items.map(item => item.url))
    assert.equal(urls.length, 7)
    assert.equal(new Set(urls).size, 7)
    if (phase === 5) assert.equal(tools.data.groups[0].items[0].url, '/pages/followup/followup')
  }
  home.choosePhase({ detail: { value: '2' } })
  tools.onShow()
  assert.equal(tools.data.phaseLabel, '产前准备')
  home.selectPhase({ currentTarget: { dataset: { phase: '2.5' } } })
  assert.equal(storage.get('wanwan-home-stage'), 2)
})

test('阶段推断与手动偏好共用规则，计时中仍尊重已选的产前阶段', () => {
  const storage = new Map()
  openPage('tools', () => undefined, { storage })
  const { homePhase } = require(join(compiled, 'services/home-stage.js'))
  const { blankWearLog, dateKey } = require(join(compiled, 'services/brace-ledger.js'))
  const log = blankWearLog()
  assert.equal(homePhase(log), 0)
  log.activeStart = Date.now()
  assert.equal(homePhase(log), 4)
  storage.set('wanwan-home-stage', 2)
  assert.equal(homePhase(log), 2)
  storage.set('wanwan-home-stage', 99)
  log.activeStart = null
  log.plans.push({ day: dateKey(Date.now()), type: 'followup', minutes: null })
  assert.equal(homePhase(log), 5)
})

test('导读预览保留正常摘要，出处开头和空摘要只显示如实的阅读提示', async () => {
  const { postPreview } = require(join(compiled, 'services/post-preview.js'))
  const post = { name: 'paper', title: '足内翻综述译读', articleKind: 'LITERATURE',
    excerpt: '足内翻综述译读 一、 原始英文综述出处（权威来源信息） 英文原题：Diagnosis and Treatment' }
  assert.equal(postPreview(post), '查看文献译读、原文出处与阅读说明。')
  assert.equal(postPreview({ title: '复查准备', excerpt: '复查准备：整理历次超声报告，准备要问医生的问题。' }),
    '整理历次超声报告，准备要问医生的问题。')
  assert.equal(postPreview({ title: '导读', excerpt: '' }), '打开导读，查看内容与资料出处。')
  assert.equal(postPreview({ title: 'DOI 是什么', excerpt: '了解 DOI 与原文检索的关系。' }), '了解 DOI 与原文检索的关系。')
  const respond = url => ({ data: { items: /\/(?:stage-)?posts$/.test(url.pathname) ? [post] : [], page: 1, size: 5, total: 1 } })
  const library = openPage('library', respond)
  await library.page.loadFeatured()
  assert.equal(library.page.data.guides[0].excerpt, postPreview(post))
  const stage = openPage('stage', respond)
  stage.page.onLoad({ key: 'PRENATAL' })
  await stage.page.fetchArticles()
  assert.equal(stage.page.data.articles[0].excerpt, postPreview(post))
  const topics = openPage('topics', respond)
  topics.page.onLoad({ kind: 'guide' })
  await topics.page.fetch(1)
  assert.equal(topics.page.data.items[0].intro, postPreview(post))
  assert.equal(post.excerpt.includes('英文原题'), true)
})

test('文献译读展示出处卡、支持复制出处与筛选，分享标题带【文献译读】前缀', async () => {
  const lit = {
    name: 'lit-1',
    title: 'Ponseti 长期随访中文译读',
    excerpt: '30 年随访综述译读。',
    publishTime: '2026-11-23T00:00:00Z',
    author: '整理者',
    articleKind: 'LITERATURE',
    citation: {
      originalTitle: 'Long-Term Outcomes of the Ponseti Method',
      journal: 'JBJS',
      publishedYear: '2024',
      evidenceType: '长期随访',
      doi: '10.2106/JBJS.24.00001',
      sourceUrl: 'https://doi.org/10.2106/JBJS.24.00001',
      verifiedDate: '2026-11-23',
    },
    content: '<h2>研究背景</h2><p>正文内容</p>',
  }

  const topics = openPage('topics', () => ({ data: { page: 1, size: 20, total: 1, items: [lit] } }))
  topics.page.onLoad({ kind: 'guide' })
  await topics.page.fetch(1)
  assert.equal(topics.page.data.items[0].isLiterature, true)
  assert.equal(topics.page.data.items[0].evidenceType, '长期随访')
  assert.equal(topics.page.data.items[0].citationLine, 'JBJS · 2024')

  topics.page.selectArticleKind({ currentTarget: { dataset: { value: 'LITERATURE' } } })
  await settle()
  assert.ok(topics.requests.some(url => url.includes('kind=LITERATURE')))

  const reading = openPage('reading', () => ({ data: lit }))
  reading.page.onLoad({ kind: 'guide', name: 'lit-1' })
  await reading.page.load()
  assert.equal(reading.page.data.isLiterature, true)
  assert.equal(reading.page.data.citationPubInfo, 'JBJS · 2024')
  assert.equal(reading.page.onShareAppMessage().title, '【文献译读】Ponseti 长期随访中文译读')
  assert.equal(reading.page.onShareTimeline().title, '【文献译读】Ponseti 长期随访中文译读')

  reading.page.copyCitation()
  assert.match(reading.getClipboard(), /10\.2106\/JBJS\.24\.00001/)
  assert.equal(reading.toasts.at(-1), '已复制文献出处')
})
