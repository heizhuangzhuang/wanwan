import prenatalData from '../public/guides/prenatal.json' with { type: 'json' }
import type { PrenatalGuide } from './types'

const guides: PrenatalGuide[] = prenatalData as PrenatalGuide[]

export const PRENATAL_ALIASES: Record<string, string[]> = {
  ultrasound: ['超声', 'b超', '四维', '排畸', '大排畸', '结构超声'],
  screening: ['唐筛', '唐氏筛查', '无创', '无创dna', 'nipt', '血清筛查'],
  amniocentesis: ['羊穿', '羊水', '羊膜腔穿刺'],
  chromosome: ['染色体', '核型', '微阵列', '基因芯片', 'cma', 'cnv', '拷贝数变异'],
  exome: ['全外', '全外显', '外显子', 'wes', '基因', '测序'],
  'genetic-counseling': ['遗传咨询', '解读报告', '不确定结果', 'vus', '拿到报告'],
}

export const PRENATAL_GROUPS = [
  { title: '超声与筛查', keys: ['ultrasound', 'screening'] },
  { title: '取样与遗传检测', keys: ['amniocentesis', 'chromosome', 'exome'] },
  { title: '拿到报告后', keys: ['genetic-counseling'] },
]

export const prenatalPaths = ['/prenatal', ...guides.map(guide => `/prenatal/${guide.key}`)]

function normalizeQuery(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function listPrenatalGuides(): PrenatalGuide[] {
  return guides
}

export function getPrenatalGuide(key: string): PrenatalGuide | null {
  return guides.find(item => item.key === key) ?? null
}

export function searchPrenatalGuides(keyword: string): PrenatalGuide[] {
  const normalized = normalizeQuery(keyword)
  if (!normalized) return []
  const terms = normalized.split(' ').filter(Boolean)
  return guides.filter((guide) => {
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
