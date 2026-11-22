import type { WebConfig } from './config.js'
import { escapeHtml, renderLayout } from './html.js'

export interface StageToolTile {
  title: string
  sub: string
  href: string
  tone: 'sage' | 'gold' | 'rose' | 'blue' | 'peach'
}

export interface StageGuide {
  key: string
  label: string
  shortLabel: string
  summary: string
  questions: string[]
  tools: StageToolTile[]
  source: { title: string; url: string }
}

export interface ChannelEntry {
  key: string
  platform: string
  title: string
  description: string
  keyword: string
  sourceLabel?: string
  sourceUrl?: string
}

export const STAGE_ORDER = [
  'JUST_FOUND',
  'PRENATAL',
  'POSTNATAL_TREATMENT',
  'BRACE_DAILY',
  'LONG_TERM',
] as const

export const GENERIC_QUESTIONS = [
  '这次沟通需要带哪些资料？',
  '报告里哪些术语需要请医生解释？',
  '我们回去后应记录哪些信息？',
  '下次安排的时间和地点是什么？',
  '有疑问时应该联系哪个科室？',
]

const STAGE_GUIDES: Record<string, StageGuide> = {
  JUST_FOUND: {
    key: 'JUST_FOUND',
    label: '刚发现',
    shortLabel: '刚发现',
    summary: '第一次看到「疑似足内翻」，可以先把报告原文和想问的问题整理好，带去问产检医生。请医生说明哪只脚有提示，还有哪些部位需要复核。',
    questions: [
      '报告提示哪一侧？这次哪些部位还需要复核？',
      '是否需要约复查？下次看哪个科室、带哪些原始资料？',
      '有没有同时看到其他需要进一步评估的情况？',
    ],
    tools: [
      { title: '问医生清单', sub: '勾选带去产科/超声科', href: '/tools/preparation?stage=JUST_FOUND', tone: 'sage' },
      { title: '超声复查清单', sub: '下载打印一页 PDF', href: '/downloads/clubfoot-ultrasound-checklist.pdf', tone: 'gold' },
      { title: '产前检查专项', sub: '羊穿 / CMA / WES', href: '/prenatal', tone: 'rose' },
      { title: '找产前与胎儿门诊', sub: '查权威医院与搜索词', href: '/channels?type=doctor&period=prenatal', tone: 'blue' },
    ],
    source: {
      title: '北京市垂杨柳医院 · 产前超声检查知多少',
      url: 'https://www.beijing.gov.cn/fuwu/bmfw/jhsyfwzdzx/2024sjrkr/kpzs/202406/t20240611_3709450.html',
    },
  },
  PRENATAL: {
    key: 'PRENATAL',
    label: '产前了解与等待',
    shortLabel: '产前了解',
    summary: '复查前把每次超声、筛查和取样报告按日期放在一起。遇到羊水穿刺、染色体微阵列或全外显等名词，可以先查项目，再向产前诊断或遗传咨询医生核对。',
    questions: [
      '这次提到的是筛查、取样还是实验室检测？它能回答什么？',
      '是否要带以前的报告或父母的资料？谁来解释结果？',
      '如果报告分批出具或结果还不确定，该约哪一个门诊？',
    ],
    tools: [
      { title: '产前检查专项', sub: '羊穿 / CMA / WES 解读', href: '/prenatal', tone: 'rose' },
      { title: '产前问医生清单', sub: '遗传咨询与出生规划', href: '/tools/preparation?stage=PRENATAL', tone: 'sage' },
      { title: '找产前与小儿骨科', sub: '门诊渠道与好大夫', href: '/channels?type=doctor&period=prenatal', tone: 'blue' },
      { title: '超声复查清单', sub: '历次复查核对表', href: '/downloads/clubfoot-ultrasound-checklist.pdf', tone: 'gold' },
    ],
    source: {
      title: '上海交通大学医学院 · 胎儿发育异常诊治中心',
      url: 'https://www.shsmu.edu.cn/info/1073/1046.htm',
    },
  },
  POSTNATAL_TREATMENT: {
    key: 'POSTNATAL_TREATMENT',
    label: '出生后评估与治疗',
    shortLabel: '出生后治疗',
    summary: '出生后可向接诊医院确认小儿骨科的评估安排。进入石膏阶段后，把这次医院交代的事项、下次复诊时间和联系电话记在一起。',
    questions: [
      '第一次骨科评估要带哪些产前、出生后的资料？',
      '打石膏回家后要观察什么？出现哪些情况该立即联系医院？',
      '下次治疗是什么时间？白天和夜间分别联系谁？',
    ],
    tools: [
      { title: '石膏与复诊提醒', sub: '记次数、交代与日历导出', href: '/tools#cast', tone: 'sage' },
      { title: '治疗期问医生清单', sub: '石膏护理与血运观察', href: '/tools/preparation?stage=POSTNATAL_TREATMENT', tone: 'peach' },
      { title: '找小儿骨科门诊', sub: '专业医院与复诊参考', href: '/channels?type=doctor&period=postnatal', tone: 'blue' },
      { title: '科普与家长经验', sub: '真实护理经验参考', href: '/channels?type=social', tone: 'rose' },
    ],
    source: {
      title: '上海市儿童医院 · 骨科',
      url: 'https://www.shchildren.com.cn/contents/449/2780.html',
    },
  },
  BRACE_DAILY: {
    key: 'BRACE_DAILY',
    label: '支具与日常生活',
    shortLabel: '支具日常',
    summary: '试配支具时，请团队现场演示穿戴和检查位置的方法。复诊前记下穿戴时遇到的问题，并向团队确认这趟是否要带鞋和连杆。',
    questions: [
      '能否现场演示穿戴，以及怎样确认脚跟在合适的位置？',
      '鞋或连杆看起来不合适时，应该找谁检查？',
      '这次复查需要带鞋、连杆或穿戴记录吗？',
    ],
    tools: [
      { title: '矫正鞋穿戴大屏', sub: '跨夜计时、趋势与补记', href: '/tools/brace-followup', tone: 'blue' },
      { title: '复诊摘要与观察', sub: '记录磨脚困难并一键复制', href: '/tools/brace-followup#brace-summary-panel', tone: 'sage' },
      { title: '支具期问医生清单', sub: '磨脚红肿与换码沟通', href: '/tools/preparation?stage=BRACE_DAILY', tone: 'gold' },
      { title: '科普与家长经验', sub: '穿鞋技巧与交流参考', href: '/channels?type=social', tone: 'rose' },
    ],
    source: {
      title: 'Alder Hey 儿童医院 · 支具家长手册（英文）',
      url: 'https://www.alderhey.nhs.uk/conditions/patient-information-leaflets/boots-and-bar-ponseti-treatment/',
    },
  },
  LONG_TERM: {
    key: 'LONG_TERM',
    label: '长期随访与预后',
    shortLabel: '长期随访',
    summary: '把每次复诊的交代和下一次安排放在同一处。读随访研究或家长经验时，留意孩子的年龄、治疗背景和随访时间。',
    questions: [
      '下次需要什么时候复诊？需要带哪些以往记录？',
      '平时哪些变化适合记下来，哪些变化需要提前联系门诊？',
      '换医院随访时，哪些治疗和支具记录需要一起带过去？',
    ],
    tools: [
      { title: '生成复诊摘要', sub: '整理穿戴与观察给医生', href: '/tools/brace-followup#brace-summary-panel', tone: 'sage' },
      { title: '穿戴趋势与档案', sub: '多年趋势与备份导出', href: '/tools/brace-followup', tone: 'blue' },
      { title: '随访期问题清单', sub: '步态鞋型与复发信号', href: '/tools/preparation?stage=LONG_TERM', tone: 'peach' },
      { title: '科普与家长经验', sub: '大龄穿鞋与运动参考', href: '/channels?type=social', tone: 'rose' },
    ],
    source: {
      title: 'Cooper 与 Dietz · 成年随访研究题录（英文）',
      url: 'https://pubmed.ncbi.nlm.nih.gov/7593056/',
    },
  },
}

const PRENATAL_CHANNEL: ChannelEntry = {
  key: 'prenatal-clinic',
  platform: '医院官方渠道',
  title: '产前诊断或胎儿医学门诊',
  description: '孕期可先向产检医院确认复查或转诊入口。查本地门诊时可在搜索词前加上所在城市或医院名称。',
  keyword: '产前诊断 胎儿医学 遗传咨询',
  sourceLabel: '上海交通大学医学院 · 胎儿发育异常诊治中心',
  sourceUrl: 'https://www.shsmu.edu.cn/info/1073/1046.htm',
}

const ORTHOPEDICS_CHANNELS: ChannelEntry[] = [
  {
    key: 'haodf',
    platform: '好大夫在线',
    title: '按地区查小儿骨科医生',
    description: '可以查擅长领域和线上咨询入口。到医院官方渠道核对科室、院区和门诊安排。',
    keyword: '先天性马蹄内翻足 小儿骨科',
    sourceLabel: '好大夫在线 · 全国医生目录',
    sourceUrl: 'https://www.haodf.com/citiao/jibing-xiantianxingmatineifanzu/tuijian-doctor.html',
  },
  {
    key: 'hospital-orthopedics',
    platform: '医院官方渠道',
    title: '小儿骨科或儿童足踝门诊',
    description: '查找附近接诊婴幼儿足部先天畸形的科室。上海市儿童医院骨科页面可作为核对接诊范围的示例。',
    keyword: '小儿骨科 马蹄内翻足 门诊',
    sourceLabel: '上海市儿童医院 · 骨科',
    sourceUrl: 'https://www.shchildren.com.cn/contents/449/2780.html',
  },
]

const SOCIAL_CHANNELS: ChannelEntry[] = [
  {
    key: 'xiaohongshu-families',
    platform: '小红书 · 家庭经验',
    title: '看看家长怎么准备就诊和复查',
    description: '可以参考别人如何携带资料、记下换石膏日期，以及安排支具复查。浏览时留意分享对应的年龄和治疗阶段。',
    keyword: '马蹄内翻足 石膏 支具 复查',
  },
  {
    key: 'xiaohongshu-institution',
    platform: '小红书 · 机构科普',
    title: '广西壮族自治区妇幼保健院',
    description: '医院公开介绍里列有小红书账号，适合查找妇幼科普。请在平台搜索并核对机构认证。',
    keyword: '广西妇幼保健院',
    sourceLabel: '中国妇幼保健协会 · 医院账号介绍',
    sourceUrl: 'https://cmcha.org/detail/16781577636753290832.html',
  },
  {
    key: 'douyin-sun',
    platform: '抖音 · 医生科普',
    title: '孙永建 · 南医三院儿童骨科',
    description: '南方医科大学介绍了他在抖音发布的儿童骨科科普。搜索后核对姓名、医院和账号认证。',
    keyword: '南医三院 儿童骨科 孙永建',
    sourceLabel: '南方医科大学 · 孙永建介绍',
    sourceUrl: 'https://www.smu.edu.cn/info/1141/23409.htm',
  },
  {
    key: 'haodf-zhang',
    platform: '好大夫在线 · 医生科普',
    title: '张网林医生的科普号',
    description: '公开文章目录收录儿童石膏固定和小儿骨科相关科普，可以先整理想向接诊医生确认的问题。',
    keyword: '张网林 儿童石膏固定',
    sourceLabel: '好大夫在线 · 作者文章目录',
    sourceUrl: 'https://jiankanghao.haodf.com/97205/wenzhang.html',
  },
]

export function getStageGuide(key: string): StageGuide | null {
  return Object.prototype.hasOwnProperty.call(STAGE_GUIDES, key) ? STAGE_GUIDES[key] : null
}

export function listStageGuides(): StageGuide[] {
  return STAGE_ORDER.map(key => STAGE_GUIDES[key])
}

export function channelsFor(type: string | undefined, period: string | undefined): ChannelEntry[] {
  if (type === 'social') return SOCIAL_CHANNELS
  return period === 'prenatal'
    ? [PRENATAL_CHANNEL, ...ORTHOPEDICS_CHANNELS]
    : [...ORTHOPEDICS_CHANNELS, PRENATAL_CHANNEL]
}

export function renderPrenatalBanner(basePath: string): string {
  return `<a class="prenatal-banner" href="${basePath}/prenatal">
  <div class="prenatal-banner-body">
    <span class="prenatal-pill">孕期必查</span>
    <strong>产前检查专项</strong>
    <span>结构超声、无创 DNA、羊水穿刺、CMA 与全外显子测序一页查清</span>
  </div>
  <span class="arrow" aria-hidden="true"></span>
</a>`
}

export function renderStageToolsSection(stageKey: string, basePath: string): string {
  const guide = getStageGuide(stageKey)
  if (!guide) return ''
  return `<section class="stage-guide-panel" aria-labelledby="stage-tools-title">
  <div class="stage-guide-intro">
    <p>${escapeHtml(guide.summary)}</p>
    <p class="meta-row">参考出处：<a href="${escapeHtml(guide.source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(guide.source.title)}</a></p>
  </div>
  <h2 id="stage-tools-title">本阶段常用工具与准备</h2>
  <div class="stage-tools-grid">
    ${guide.tools.map(tile => `<a class="stage-tool-tile stage-tool--${tile.tone}" href="${basePath}${tile.href}">
      <strong>${escapeHtml(tile.title)}</strong>
      <span>${escapeHtml(tile.sub)}</span>
      <span class="arrow" aria-hidden="true"></span>
    </a>`).join('')}
  </div>
</section>`
}

export function renderPreparation(config: WebConfig, stageKey: string, pageActionsHash: string): string {
  const base = config.siteBasePath
  const guide = stageKey ? getStageGuide(stageKey) : null
  const questions = guide ? guide.questions : GENERIC_QUESTIONS
  const heading = guide ? `${guide.label} · 就诊沟通清单` : '就诊沟通清单'
  const showUltrasound = !guide || stageKey === 'JUST_FOUND' || stageKey === 'PRENATAL'
  const stages = listStageGuides()
  const tabs = [
    `<a href="${base}/tools/preparation"${!guide ? ' class="active" aria-current="true"' : ''}>通用问题</a>`,
    ...stages.map(s => `<a href="${base}/tools/preparation?stage=${encodeURIComponent(s.key)}"${guide?.key === s.key ? ' class="active" aria-current="true"' : ''}>${escapeHtml(s.shortLabel)}</a>`),
  ].join('')

  return renderLayout(config, heading, `
    <p><a href="${base}/tools">← 返回家庭工具</a></p>
    <section class="tool-lead">
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(guide ? guide.summary : '就诊前把最想向医生确认的问题勾出来，复制存进备忘录或直接带去门诊。')}</p>
    </section>
    <nav class="filter-bar" aria-label="按阶段切换问题清单">${tabs}</nav>
    <section class="card">
      <h2 class="card-title">勾选想问医生的问题</h2>
      <div id="prep-list" class="prep-list" data-prep-heading="${escapeHtml(heading)}">
        ${questions.map((q, index) => `<label class="prep-item">
          <input type="checkbox" checked data-prep-question="${escapeHtml(q)}" id="prep-q-${index}" />
          <span>${escapeHtml(q)}</span>
        </label>`).join('')}
      </div>
      <div class="action-bar">
        <button class="btn" type="button" data-prep-copy data-status-id="prep-status">复制选中的问题</button>
        <button class="btn btn-outline" type="button" data-prep-toggle>取消全选</button>
        ${showUltrasound ? `<a class="btn btn-outline" href="${base}/downloads/clubfoot-ultrasound-checklist.pdf">下载超声复查清单 PDF</a>` : ''}
        <a class="btn btn-outline" href="${base}/channels?type=doctor${showUltrasound ? '&period=prenatal' : '&period=postnatal'}">查医院与门诊渠道</a>
      </div>
      <p id="prep-status" class="action-status" role="status" aria-live="polite"></p>
      ${guide ? `<p class="meta-row" style="margin-top:14px">阶段参考出处：<a href="${escapeHtml(guide.source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(guide.source.title)}</a></p>` : ''}
    </section>
    <p class="notice-bar">问题清单仅供就诊沟通准备使用，具体检查与诊疗安排请以接诊医生当面说明为准。</p>
    <script src="${base}/tools/page-actions.js" integrity="${pageActionsHash}" defer></script>`, '/tools/preparation')
}

export function renderChannels(
  config: WebConfig,
  type: string,
  period: string,
  pageActionsHash: string,
): string {
  const base = config.siteBasePath
  const isSocial = type === 'social'
  const normalizedPeriod = period === 'prenatal' ? 'prenatal' : 'postnatal'
  const entries = channelsFor(isSocial ? 'social' : 'doctor', normalizedPeriod)
  const title = isSocial ? '科普与家长经验' : '找医生与门诊'
  const lead = isSocial
    ? '整理公开可核对的机构科普号、医生科普目录和家长经验搜索词。阅读他人经验时请留意孩子年龄与治疗阶段。'
    : '整理医院官方渠道与公开医生目录。复制搜索词后，建议加上所在城市或医院名称，再通过医院官方渠道核对出诊安排。'

  const periodBar = isSocial
    ? ''
    : `<div class="filter-bar" aria-label="按阶段排序">
        <a href="${base}/channels?type=doctor&period=prenatal"${normalizedPeriod === 'prenatal' ? ' class="active" aria-current="true"' : ''}>孕期 / 产前诊断优先</a>
        <a href="${base}/channels?type=doctor&period=postnatal"${normalizedPeriod === 'postnatal' ? ' class="active" aria-current="true"' : ''}>出生后 / 小儿骨科优先</a>
      </div>`

  return renderLayout(config, title, `
    <p><a href="${base}/tools">← 返回家庭工具</a></p>
    <section class="tool-lead">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(lead)}</p>
    </section>
    <nav class="channel-tabs" aria-label="渠道分类">
      <a href="${base}/channels?type=doctor&period=${normalizedPeriod}"${!isSocial ? ' class="active" aria-current="page"' : ''}>找医生与门诊</a>
      <a href="${base}/channels?type=social"${isSocial ? ' class="active" aria-current="page"' : ''}>科普与家长经验</a>
    </nav>
    ${periodBar}
    <div class="card-list">
      ${entries.map((entry, idx) => `<article class="card channel-card">
        <div class="meta-row card-badges"><span class="badge">${escapeHtml(entry.platform)}</span></div>
        <h2 class="card-title">${escapeHtml(entry.title)}</h2>
        <p class="card-intro">${escapeHtml(entry.description)}</p>
        <div class="channel-keyword-box">
          <span class="meta-row">建议搜索词</span>
          <code>${escapeHtml(entry.keyword)}</code>
        </div>
        <div class="action-bar">
          <button class="btn" type="button" data-copy-text="${escapeHtml(entry.keyword)}" data-copy-ok="已复制搜索词，可粘贴到医院官网或对应平台搜索。" data-status-id="channel-status-${idx}">复制搜索词</button>
          ${entry.sourceUrl ? `<a class="btn btn-outline" href="${escapeHtml(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看出处 · ${escapeHtml(entry.sourceLabel ?? '官方页面')}</a>` : ''}
        </div>
        <p id="channel-status-${idx}" class="action-status" role="status" aria-live="polite"></p>
      </article>`).join('')}
    </div>
    <p class="notice-bar">以上渠道供家庭自行核对医院资质、科室与出诊信息。本站不提供挂号代理、商业推荐或个体诊疗意见。</p>
    <script src="${base}/tools/page-actions.js" integrity="${pageActionsHash}" defer></script>`, '/channels')
}
