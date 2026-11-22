import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { WebConfig } from './config.js'
import { escapeHtml, renderLayout } from './html.js'

interface PrenatalGuide {
  key: string
  title: string
  summary: string
  sections: { heading: string; body: string }[]
  sourceTitle: string
  sourceUrl: string
}

const guides: PrenatalGuide[] = JSON.parse(
  readFileSync(new URL('../public/guides/prenatal.json', import.meta.url), 'utf8'),
)
export const appointmentScript = readFileSync(new URL('../public/tools/appointment.js', import.meta.url))
export const appointmentHash = 'sha256-' + createHash('sha256').update(appointmentScript).digest('base64')
export const pageActionsScript = readFileSync(new URL('../public/tools/page-actions.js', import.meta.url))
export const pageActionsHash = 'sha256-' + createHash('sha256').update(pageActionsScript).digest('base64')
export const prenatalPaths = ['/prenatal', ...guides.map(guide => '/prenatal/' + guide.key)]

const PRENATAL_ALIASES: Record<string, string[]> = {
  ultrasound: ['超声', 'b超', '四维', '排畸', '大排畸', '结构超声'],
  screening: ['唐筛', '唐氏筛查', '无创', '无创dna', 'nipt', '血清筛查'],
  amniocentesis: ['羊穿', '羊水', '羊膜腔穿刺'],
  chromosome: ['染色体', '核型', '微阵列', '基因芯片', 'cma', 'cnv', '拷贝数变异'],
  exome: ['全外', '全外显', '外显子', 'wes', '基因', '测序'],
  'genetic-counseling': ['遗传咨询', '解读报告', '不确定结果', 'vus', '拿到报告'],
}

const PRENATAL_GROUPS = [
  { title: '超声与筛查', keys: ['ultrasound', 'screening'] },
  { title: '取样与遗传检测', keys: ['amniocentesis', 'chromosome', 'exome'] },
  { title: '拿到报告后', keys: ['genetic-counseling'] },
]

function normalizeQuery(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function searchPrenatalGuides(keyword: string): PrenatalGuide[] {
  const normalized = normalizeQuery(keyword)
  if (!normalized) return []
  const terms = normalized.split(' ').filter(Boolean)
  return guides.filter(guide => {
    const aliases = PRENATAL_ALIASES[guide.key] ?? []
    const haystack = normalizeQuery([
      '产前',
      guide.title,
      guide.summary,
      guide.sourceTitle,
      ...aliases,
      ...guide.sections.flatMap(s => [s.heading, s.body]),
    ].join(' '))
    return terms.every(term =>
      haystack.includes(term) || aliases.some(alias => alias.includes(term) || term.includes(alias)),
    )
  })
}

export function renderTools(config: WebConfig) {
  const base = config.siteBasePath
  const miniProgram = config.castMiniprogramUrl
    ? `<a class="btn btn-outline" href="${escapeHtml(config.castMiniprogramUrl)}" rel="noopener noreferrer">在微信打开石膏记录</a>`
    : '<p class="meta-row">打开微信小程序，在家庭工具中选择「石膏记录与复诊提醒」。</p>'
  return renderLayout(config, '家庭工具', `
    <section class="tool-lead"><h1>家庭工具</h1><p>记录治疗、准备就诊，回看每个阶段。</p></section>
    <div class="tools-grid">
      <article class="card tool-feature"><h2 class="card-title">矫正鞋穿戴记录</h2>
        <p>计时或补记穿戴时段，记录穿戴困难与复诊问题，一键生成复诊摘要，也可导出 Excel 和互通备份。</p>
        <a class="btn" href="${base}/tools/brace-followup">打开支具随访大屏 <span class="arrow" aria-hidden="true"></span></a></article>
      <article class="card"><h2 class="card-title">就诊沟通清单</h2>
        <p>按当前阶段勾选最想问医生的问题，一键复制带去产检、超声或小儿骨科门诊。</p>
        <a class="btn btn-outline" href="${base}/tools/preparation">整理就诊问题</a></article>
      <article class="card"><h2 class="card-title">找医生与门诊 / 家长经验</h2>
        <p>整理医院官方渠道、产前诊断、小儿骨科与机构科普搜索词，一键复制去核对。</p>
        <div class="action-bar">
          <a class="btn btn-outline" href="${base}/channels?type=doctor">找医生与门诊</a>
          <a class="btn btn-outline" href="${base}/channels?type=social">科普与家长经验</a>
        </div></article>
      <article class="card" id="cast"><h2 class="card-title">石膏记录与微信提醒</h2>
        <p>在微信小程序记录每次打石膏的日期、医院交代事项和下次治疗时间。同一微信账户可换机恢复。</p>
        ${miniProgram}</article>
      <article class="card"><h2 class="card-title">生成复诊日历文件</h2>
        <p>输入医院给出的时间，下载后导入手机或电脑日历。时间仅在当前浏览器处理。</p>
        <form class="tools-calendar">
          <label for="appointment-time">复诊时间（北京时间）</label>
          <input type="datetime-local" id="appointment-time" class="search-input" required />
          <button class="btn" type="submit">下载日历文件</button>
          <span id="appointment-status" role="status"></span>
        </form>
        <script src="${base}/tools/appointment.js" integrity="${appointmentHash}" defer></script></article>
      <article class="card"><h2 class="card-title">足内翻超声复查清单</h2>
        <p>一页空白 PDF，可打印后带去和医生沟通。</p>
        <a class="btn btn-outline" href="${base}/downloads/clubfoot-ultrasound-checklist.pdf">下载清单</a></article>
      <article class="card"><h2 class="card-title">产前检查专项</h2>
        <p>查阅结构超声、无创 DNA、羊水穿刺、CMA 和全外显子测序，并一键复制要向医生确认的问题。</p>
        <a class="btn btn-outline" href="${base}/prenatal">查看专项</a></article>
    </div>`, '/tools')
}

export function renderPrenatal(config: WebConfig, key?: string, query = '') {
  const base = config.siteBasePath
  const notice = '<p class="notice-bar">内容供就诊沟通时查阅。具体检查和报告解读以产前诊断或遗传咨询门诊说明为准。</p>'
  if (key) {
    const guide = guides.find(item => item.key === key)
    if (!guide) return null
    const questionSection = guide.sections.find(item => item.heading.includes('可以问医生'))
    const copyBlock = questionSection
      ? `<div class="action-bar" style="margin:14px 0">
          <button class="btn" type="button" data-copy-text="${escapeHtml(`${guide.title} · 可以问医生：\n${questionSection.body}`)}" data-copy-ok="已复制就诊问题，可直接粘贴到备忘录。" data-status-id="prenatal-copy-status">复制可以问医生的问题</button>
          <a class="btn btn-outline" href="${base}/tools/preparation?stage=PRENATAL">打开产前就诊清单</a>
        </div>
        <p id="prenatal-copy-status" class="action-status" role="status" aria-live="polite"></p>`
      : ''
    return renderLayout(config, guide.title, `
      <p><a href="${base}/prenatal">← 返回产前检查专项</a></p>
      <section class="tool-lead"><h1>${escapeHtml(guide.title)}</h1><p>${escapeHtml(guide.summary)}</p></section>
      ${guide.sections.map(item => `<section class="card" style="margin-bottom:12px"><h2 class="card-title">${escapeHtml(item.heading)}</h2>
        <p>${escapeHtml(item.body)}</p></section>`).join('')}
      ${copyBlock}
      <p class="meta-row">出处：<a href="${escapeHtml(guide.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(guide.sourceTitle)}</a></p>
      ${notice}
      <script src="${base}/tools/page-actions.js" integrity="${pageActionsHash}" defer></script>`, '/prenatal/' + key)
  }
  const q = query.trim().slice(0, 80)
  const matched = q ? searchPrenatalGuides(q) : guides
  const listHtml = q
    ? matched.length
      ? `<p class="meta-row">找到 ${matched.length} 项匹配「${escapeHtml(q)}」的检查说明</p>
        <div class="card-list">${matched.map(item => `<article class="card">
          <h2 class="card-title"><a href="${base}/prenatal/${item.key}">${escapeHtml(item.title)}</a></h2>
          <p class="card-intro">${escapeHtml(item.summary)}</p></article>`).join('')}</div>`
      : `<div class="warn-bar">没有匹配「${escapeHtml(q)}」的检查项目。试试搜索「羊穿」「CMA」「全外显」「无创」或<a href="${base}/prenatal">查看全部项目</a>。</div>`
    : PRENATAL_GROUPS.map(group => {
        const items = group.keys.map(k => guides.find(g => g.key === k)).filter((g): g is PrenatalGuide => Boolean(g))
        return `<section class="prenatal-group">
          <h2>${escapeHtml(group.title)}</h2>
          <div class="card-list">${items.map(item => `<article class="card">
            <h3 class="card-title"><a href="${base}/prenatal/${item.key}">${escapeHtml(item.title)}</a></h3>
            <p class="card-intro">${escapeHtml(item.summary)}</p></article>`).join('')}</div>
        </section>`
      }).join('')

  return renderLayout(config, '产前检查专项', `
    <section class="tool-lead"><h1>产前检查专项</h1><p>按检查类型查找介绍、就诊问题和可核对的出处。</p></section>
    <form class="search-form" action="${base}/prenatal" method="get" role="search">
      <label class="visually-hidden" for="prenatal-q">搜索检查词</label>
      <input id="prenatal-q" class="search-input" type="search" name="q" maxlength="80" value="${escapeHtml(q)}" placeholder="搜索检查词，例如：羊穿、CMA、全外显、无创" />
      <button class="btn" type="submit">筛选检查</button>
      ${q ? `<a class="btn btn-outline" href="${base}/prenatal">清除</a>` : ''}
    </form>
    <div class="action-bar" style="margin-bottom:14px">
      <a class="btn btn-outline" href="${base}/tools/preparation?stage=PRENATAL">产前就诊沟通清单</a>
      <a class="btn btn-outline" href="${base}/channels?type=doctor&period=prenatal">找产前诊断与胎儿门诊</a>
      <a class="btn btn-outline" href="${base}/downloads/clubfoot-ultrasound-checklist.pdf">下载超声复查清单 PDF</a>
    </div>
    ${listHtml}${notice}`, '/prenatal')
}
