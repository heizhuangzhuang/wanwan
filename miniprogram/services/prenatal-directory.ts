import { prenatalGuides } from './prenatal-guides'

const categories = [
  {
    key: 'screening', title: '超声与筛查', icon: 'scan-line', tone: 'peach', items: [
      { key: 'ultrasound', caption: '超声所见与复查沟通', aliases: '排畸 大排畸 B超 四维 结构超声' },
      { key: 'screening', caption: '唐筛、NIPT 与筛查范围', aliases: '唐筛 唐氏筛查 无创DNA NIPT' },
    ],
  },
  {
    key: 'diagnostic', title: '取样与遗传检测', icon: 'test-tube-diagonal', tone: 'sage', items: [
      { key: 'amniocentesis', caption: '取样、送检与等报告', aliases: '羊穿 羊水 羊膜腔穿刺' },
      { key: 'chromosome', caption: '核型、基因芯片和 CMA', aliases: '染色体 核型 基因芯片 CMA CNV 拷贝数变异' },
      { key: 'exome', caption: '检测范围、父母样本与复核', aliases: '全外显 外显子 WES' },
    ],
  },
  {
    key: 'follow-up', title: '拿到报告后', icon: 'messages-square', tone: 'blue', items: [
      { key: 'genetic-counseling', label: '遗传咨询', caption: '带哪些材料、到哪里咨询', aliases: '遗传咨询 解读报告 不确定结果 VUS' },
    ],
  },
]

const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

const directory = categories.map(group => ({
  ...group,
  items: group.items.flatMap(entry => {
    const guide = prenatalGuides.find(item => item.key === entry.key)
    return guide ? [{
      key: entry.key,
      title: 'label' in entry ? entry.label : guide.title,
      caption: entry.caption,
      searchText: normalize(['产前', guide.title, entry.aliases, entry.caption, group.title, guide.sourceTitle].join(' ')),
    }] : []
  }),
}))

export function filterPrenatalDirectory(query: string) {
  const terms = normalize(query).split(' ').filter(Boolean)
  return directory.map(({ items, ...group }) => ({
    ...group,
    items: items.filter(entry => terms.every(term => entry.searchText.includes(term)))
      .map(({ key, title, caption }) => ({ key, title, caption })),
  })).filter(group => group.items.length > 0)
}
