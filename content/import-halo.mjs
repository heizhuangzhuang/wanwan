import { readFile } from 'node:fs/promises'

const apiVersion = 'wanwan.run/v1alpha1'
const resourcesPath = '/apis/' + apiVersion + '/resourcecards'
const topicsPath = '/apis/' + apiVersion + '/topics'
const stages = ['JUST_FOUND', 'PRENATAL', 'POSTNATAL_TREATMENT', 'BRACE_DAILY', 'LONG_TERM']
const validId = id => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)

function sourceKeys(spec) {
  const keys = []
  if (spec.url) {
    try {
      const url = new URL(spec.url.trim())
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        keys.push('url:' + url.hostname + url.pathname.replace(/\/$/, '') + url.search)
      }
    } catch {
      // Existing records may contain an invalid URL but still have a usable identifier.
    }
  }
  if (spec.doi?.trim()) {
    keys.push('doi:' + spec.doi.trim().toLowerCase().replace(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/, ''))
  }
  if (spec.pmid?.trim()) keys.push('pmid:' + spec.pmid.trim())
  return keys
}

function extension(kind, name, spec) {
  return { apiVersion, kind, metadata: { name }, spec }
}

async function run() {
  const args = process.argv.slice(2)
  if (args.length && (args.length !== 1 || args[0] !== '--apply')) {
    throw new Error('用法：node content/import-halo.mjs [--apply]')
  }

  const { resources, topics, verifiedDate } = JSON.parse(
    await readFile(new URL('./first-batch.json', import.meta.url), 'utf8'),
  )
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedDate)) throw new Error('缺少有效的来源核对日期')
  const resourceNames = new Map()
  const keysSeen = new Set()
  const namesSeen = new Set()
  for (const item of resources) {
    const url = new URL(item.url)
    const keys = sourceKeys(item)
    if (!validId(item.id) || resourceNames.has(item.id)
      || !item.originalTitle?.trim() || !item.displayTitle?.trim() || !item.intro?.trim() || !item.sourceName?.trim()
      || url.protocol !== 'https:' || url.username || url.password
      || !item.stages?.length || item.stages.some(stage => !stages.includes(stage))
      || keys.some(key => keysSeen.has(key))) {
      throw new Error('资料字段或来源重复：' + item.id)
    }
    resourceNames.set(item.id, 'starter-' + item.id)
    keys.forEach(key => keysSeen.add(key))
  }
  for (const topic of topics) {
    if (!validId(topic.id) || namesSeen.has(topic.id)
      || !topic.title?.trim() || !topic.intro?.trim() || !topic.resources?.length
      || topic.resources.some(id => !resourceNames.has(id))) {
      throw new Error('专题字段或资料编号有误：' + topic.id)
    }
    namesSeen.add(topic.id)
  }

  if (!args.length) {
    for (const topic of topics) {
      console.log(topic.title)
      for (const id of topic.resources) {
        const card = resources.find(item => item.id === id)
        console.log('  ' + card.displayTitle + ' ｜ ' + card.sourceName + ' ｜ ' + card.url)
      }
    }
    console.log('预览完成，共 ' + resources.length + ' 条资料、' + topics.length + ' 个专题')
    return
  }

  const base = new URL(process.env.HALO_URL || 'http://127.0.0.1:8090')
  const token = process.env.HALO_TOKEN
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
  if (!token || (base.protocol !== 'https:' && !(local && base.protocol === 'http:'))
    || base.username || base.password || base.search || base.hash) {
    throw new Error('请设置 HALO_TOKEN 和可信的 HALO_URL。本机可用 HTTP，远程使用 HTTPS。')
  }

  async function request(path, record) {
    const response = await fetch(base.href.replace(/\/$/, '') + path, {
      method: record ? 'POST' : 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: record ? JSON.stringify(record) : undefined,
    })
    if (!response.ok) throw new Error(path + ' 返回 HTTP ' + response.status)
    return response.json()
  }

  async function list(path) {
    const items = []
    for (let page = 1; ; page++) {
      const result = await request(path + '?page=' + page + '&size=100')
      if (!Array.isArray(result.items) || !Number.isInteger(result.total)) {
        throw new Error('Halo 返回的列表格式有误：' + path)
      }
      items.push(...result.items)
      if (items.length >= result.total) return items
      if (!result.items.length) throw new Error('Halo 分页未完整返回：' + path)
    }
  }

  const [existingResources, existingTopics] = await Promise.all([list(resourcesPath), list(topicsPath)])
  const plan = resources.map(({ id, ...spec }, index) => {
    const wanted = resourceNames.get(id)
    const keys = sourceKeys(spec)
    const matching = existingResources.filter(card => sourceKeys(card.spec).some(key => keys.includes(key)))
    if (matching.length > 1 || existingResources.some(card => card.metadata.name === wanted && !matching.includes(card))) {
      throw new Error('已有资料重名或同源多条，请先在 Halo 核对：' + id)
    }
    if (matching.length) resourceNames.set(id, matching[0].metadata.name)
    const record = extension('ResourceCard', wanted, {
      materialType: 'INSTITUTION', language: 'ZH', ...spec, access: 'OPEN', entryType: 'WEB',
      lastVerifiedDate: verifiedDate, linkStatus: 'OK', state: 'PENDING_REVIEW', priority: (index + 1) * 10,
    })
    return { skip: matching.length > 0, record }
  })

  for (const { skip, record } of plan) {
    if (!skip) await request(resourcesPath, record)
    console.log((skip ? '已收录，跳过 ' : '待核对 ') + record.spec.displayTitle)
  }
  for (const [index, { id, title, intro, resources: references }] of topics.entries()) {
    const name = 'starter-' + id
    const skip = existingTopics.some(topic => topic.metadata.name === name || topic.spec.title === title)
    if (!skip) {
      await request(topicsPath, extension('Topic', name, {
        title, intro, resourceNames: [...new Set(references.map(id => resourceNames.get(id)))],
        state: 'DRAFT', priority: (index + 1) * 10,
      }))
    }
    console.log((skip ? '已存在，跳过 ' : '专题草稿 ') + title)
  }
}

run().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
