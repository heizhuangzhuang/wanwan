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
export const prenatalPaths = ['/prenatal', ...guides.map(guide => '/prenatal/' + guide.key)]

export function renderTools(config: WebConfig) {
  const base = config.siteBasePath
  const miniProgram = config.castMiniprogramUrl
    ? `<a class="btn" href="${escapeHtml(config.castMiniprogramUrl)}" rel="noopener noreferrer">在微信打开石膏记录</a>`
    : '<p class="meta-row">在微信打开本小程序后，进入「家庭工具 → 石膏记录与复诊提醒」。</p>'
  return renderLayout(config, '家庭工具', `
    <section class="tool-lead"><h1>家庭工具</h1><p>整理就诊问题、保存复诊时间，和家人一起回顾每个阶段。</p></section>
    <div class="card-list">
      <article class="card"><h2 class="card-title">石膏记录与微信提醒</h2>
        <p>在微信小程序记录每次打石膏的日期、医院交代事项和下次治疗时间。同一微信账户可换机恢复。</p>
        ${miniProgram}</article>
      <article class="card"><h2 class="card-title">生成复诊日历文件</h2>
        <p>输入医院给出的时间，下载后导入手机或电脑日历。时间仅在当前浏览器处理。</p>
        <form class="tools-calendar">
          <label for="appointment-time">复诊时间（北京时间）</label>
          <input type="datetime-local" id="appointment-time" required />
          <button class="btn" type="submit">下载日历文件</button>
          <span id="appointment-status" role="status"></span>
        </form>
        <script src="${base}/tools/appointment.js" integrity="${appointmentHash}" defer></script></article>
      <article class="card"><h2 class="card-title">足内翻超声复查清单</h2>
        <p>一页空白 PDF，可打印后带去和医生沟通。</p>
        <a class="btn" href="${base}/downloads/clubfoot-ultrasound-checklist.pdf">下载清单</a></article>
      <article class="card"><h2 class="card-title">产前检查专项</h2>
        <p>查阅结构超声、羊水穿刺和全外显子测序，并整理要向医生确认的问题。</p>
        <a class="btn" href="${base}/prenatal">查看专项</a></article>
    </div>`)
}

export function renderPrenatal(config: WebConfig, key?: string) {
  const base = config.siteBasePath
  const notice = '<p class="notice-bar">内容供就诊沟通时查阅。具体检查和报告解读以产前诊断或遗传咨询门诊说明为准。</p>'
  if (key) {
    const guide = guides.find(item => item.key === key)
    if (!guide) return null
    return renderLayout(config, guide.title, `
      <p><a href="${base}/prenatal">← 返回产前检查专项</a></p>
      <section class="tool-lead"><h1>${escapeHtml(guide.title)}</h1><p>${escapeHtml(guide.summary)}</p></section>
      ${guide.sections.map(item => `<section class="card"><h2 class="card-title">${escapeHtml(item.heading)}</h2>
        <p>${escapeHtml(item.body)}</p></section>`).join('')}
      <p>出处 <a href="${escapeHtml(guide.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(guide.sourceTitle)}</a></p>
      ${notice}`)
  }
  return renderLayout(config, '产前检查专项', `
    <section class="tool-lead"><h1>产前检查专项</h1><p>按检查类型查找介绍、就诊问题和可核对的出处。</p></section>
    <div class="card-list">${guides.map(item => `<article class="card">
      <h2 class="card-title"><a href="${base}/prenatal/${item.key}">${escapeHtml(item.title)}</a></h2>
      <p>${escapeHtml(item.summary)}</p></article>`).join('')}</div>${notice}`)
}
