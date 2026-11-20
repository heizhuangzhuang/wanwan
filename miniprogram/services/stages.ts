import type { StageView } from './api'

export const fixedStages: StageView[] = [
  { key: 'JUST_FOUND', label: '刚发现', order: 0 },
  { key: 'PRENATAL', label: '产前了解与等待', order: 1 },
  { key: 'POSTNATAL_TREATMENT', label: '出生后评估与治疗', order: 2 },
  { key: 'BRACE_DAILY', label: '支具与日常生活', order: 3 },
  { key: 'LONG_TERM', label: '长期随访与预后', order: 4 },
]

const introductions: Record<string, string> = {
  JUST_FOUND: '超声提示疑似足内翻，先准备怎么问医生。',
  PRENATAL: '超声复查、遗传咨询与检查项目。',
  POSTNATAL_TREATMENT: '小儿骨科评估、石膏记录与复诊。',
  BRACE_DAILY: '支具试配、日常照护与复查准备。',
  LONG_TERM: '整理历次记录，了解长期随访。',
}

export function stageIntro(key: string): string {
  return introductions[key] || '查看这个主题下已经公开的资料与出处。'
}
