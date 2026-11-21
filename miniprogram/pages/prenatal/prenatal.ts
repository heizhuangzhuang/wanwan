import { filterPrenatalDirectory } from '../../services/prenatal-directory'
import { prenatalGuides } from '../../services/prenatal-guides'

const route = 'pages/prenatal/prenatal'
const pagePath = '/' + route
const questionHeading = '可以问医生'

function copyText(data: string, title: string) {
  wx.setClipboardData({
    data,
    success: () => wx.showToast({ title, icon: 'none' }),
    fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }),
  })
}

Page({
  data: {
    query: '',
    groups: filterPrenatalDirectory(''),
    selected: null as typeof prenatalGuides[number] | null,
    category: '',
    missing: false,
  },
  onLoad(options: Record<string, string | undefined>) {
    const selected = prenatalGuides.find(guide => guide.key === options.key) || null
    const category = filterPrenatalDirectory('').find(group => group.items.some(item => item.key === selected?.key))?.title || ''
    this.setData({ selected, category, missing: Boolean(options.key && !selected) })
    if (options.key) wx.setNavigationBarTitle({ title: '检查导读' })
  },
  search(event: WechatMiniprogram.Input) {
    const query = event.detail.value
    this.setData({ query, groups: filterPrenatalDirectory(query) })
  },
  clearSearch() {
    this.setData({ query: '', groups: filterPrenatalDirectory('') })
  },
  openDirectory() {
    const pages = getCurrentPages()
    if (pages[pages.length - 2]?.route === route) wx.navigateBack()
    else wx.redirectTo({ url: pagePath })
  },
  copySource() {
    const guide = this.data.selected
    if (guide) copyText(guide.sourceUrl, '已复制来源链接')
  },
  copyQuestions() {
    const questions = this.data.selected?.sections.find(section => section.heading === questionHeading)?.body
    if (questions) copyText(questions, '已复制就诊问题')
  },
  onShareAppMessage() {
    const guide = this.data.selected
    return { title: guide?.title || '产前检查专项', path: guide ? `${pagePath}?key=${guide.key}` : pagePath }
  },
})
