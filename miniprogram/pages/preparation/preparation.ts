import { familyGuide } from '../../services/family-guide'
import { decodeOption } from '../../services/reading'

const prompts = [
  '这次沟通需要带哪些资料？',
  '报告里哪些术语需要请医生解释？',
  '我们回去后应记录哪些信息？',
  '下次安排的时间和地点是什么？',
  '有疑问时应该联系哪个科室？',
]

Page({
  data: { prompts, selected: [] as string[], showUltrasoundChecklist: true },
  onLoad(options: Record<string, string | undefined>) {
    const stage = decodeOption(options.stage)
    const guide = familyGuide(stage)
    this.setData({
      prompts: guide?.questions ?? prompts,
      selected: [],
      showUltrasoundChecklist: !guide || stage === 'JUST_FOUND' || stage === 'PRENATAL',
    })
  },
  onChange(event: { detail: { value: string[] } }) {
    this.setData({ selected: event.detail.value })
  },
  copyQuestions() {
    const selected = this.data.prompts.filter((_, index) => this.data.selected.includes(String(index)))
    if (!selected.length) return
    wx.setClipboardData({
      data: selected.map(question => `• ${question}`).join('\n'),
      success: () => wx.showToast({ title: '已复制问题', icon: 'none' }),
      fail: () => wx.showToast({ title: '未能复制，请重试', icon: 'none' }),
    })
  },
})
