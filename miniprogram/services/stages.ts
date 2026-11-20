const introductions: Record<string, string> = {
  JUST_FOUND: '先了解常见术语，找到可信的入门出处。',
  PRENATAL: '按自己的节奏了解产前资料，整理想问的问题。',
  POSTNATAL_TREATMENT: '查找出生后评估与治疗流程的公开资料。',
  BRACE_DAILY: '浏览支具、复查和日常照护的资料出处。',
  LONG_TERM: '了解不同研究和家庭经历所记录的随访时间。',
}

export function stageIntro(key: string): string {
  return introductions[key] || '查看这个主题下已经公开的资料与出处。'
}
