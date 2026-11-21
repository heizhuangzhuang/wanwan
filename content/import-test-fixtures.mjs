import { readFile } from 'node:fs/promises'

const resources = '/apis/wanwan.run/v1alpha1/resourcecards'
const args = process.argv.slice(2)

async function main() {
  if (args.length > 1 || (args.length && args[0] !== '--apply')) {
    throw new Error('用法：node content/import-test-fixtures.mjs [--apply]')
  }
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/just-found.json', import.meta.url), 'utf8'))
  const names = new Set()
  for (const fixture of fixtures) {
    const { metadata, spec } = fixture
    if (!/^fixture-just-found-[a-z0-9-]+$/.test(metadata.name)
      || names.has(metadata.name) || !spec.displayTitle.startsWith('【测试】')
      || spec.state !== 'PUBLISHED' || spec.entryType !== 'CITATION_ONLY'
      || spec.url || spec.downloadUrl || spec.miniProgramAppId) {
      throw new Error('无效的测试资料标记或链接字段：' + metadata.name)
    }
    names.add(metadata.name)
  }

  if (!args.length) {
    fixtures.forEach(({ spec }) => console.log(spec.displayTitle))
    console.log('共 ' + fixtures.length + ' 条。预览未连接 Halo。')
    return
  }

  const base = new URL(process.env.HALO_URL || 'http://127.0.0.1:18091')
  const token = process.env.HALO_TOKEN
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
  if (!token || (base.protocol !== 'https:' && !(local && base.protocol === 'http:'))
    || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('请配置 HALO_TOKEN 和可信 Halo 原点 HALO_URL。远程必须使用 HTTPS。')
  }
  console.log('目标 Halo：' + base.origin)
  const request = (path, record) => fetch(new URL(path, base), {
    method: record ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: record && JSON.stringify(record),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })

  let created = 0
  for (const fixture of fixtures) {
    const { name } = fixture.metadata
    const path = resources + '/' + name
    let response = await request(path)
    if (response.status === 404) {
      response = await request(resources, fixture)
      if (response.ok) {
        created++
        console.log('已创建：' + name)
        continue
      }
      if (response.status === 409) response = await request(path)
    }
    if (!response.ok) throw new Error(name + ' 返回 HTTP ' + response.status)
    const existing = await response.json()
    if (existing.metadata?.name !== name || existing.spec?.sourceName !== fixture.spec.sourceName
      || existing.spec?.originalTitle !== fixture.spec.originalTitle) {
      throw new Error('同名记录与样本标识不一致：' + name)
    }
    console.log('已存在，保留其当前状态：' + name)
  }
  console.log('新增 ' + created + ' 条，共核对 ' + fixtures.length + ' 条。')
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
