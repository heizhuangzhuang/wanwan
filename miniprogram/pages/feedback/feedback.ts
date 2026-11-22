import { HttpError, wanwanApi } from '../../services/api'

const categories = [
  { name: '希望增加功能', value: 'FEATURE' },
  { name: '使用体验', value: 'USABILITY' },
  { name: '遇到问题', value: 'ISSUE' },
  { name: '其他建议', value: 'OTHER' },
]

function newRequestId() {
  const part = () => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36).padStart(11, '0')
  return `${Date.now().toString(36)}-${part()}-${part()}`
}

Page({
  pending: null as { message: string; category: string; id: string } | null,
  data: { categories, selected: 0, message: '', busy: false, sent: false, error: '' },
  chooseCategory(event: WechatMiniprogram.PickerChange) {
    this.setData({ selected: Number(event.detail.value) })
  },
  changeMessage(event: WechatMiniprogram.Input) {
    this.setData({ message: event.detail.value, error: '' })
  },
  async submit() {
    if (this.data.busy || this.data.sent) return
    const message = this.data.message.trim()
    const category = categories[this.data.selected]?.value
    if (!category || message.length < 3 || message.length > 500) {
      this.setData({ error: '请选择建议类型，并填写 3–500 字。' })
      return
    }
    if (this.pending?.message !== message || this.pending.category !== category) {
      this.pending = { message, category, id: newRequestId() }
    }
    this.setData({ busy: true, error: '' })
    try {
      const receipt = await wanwanApi.submitFeedback(this.pending.id, category, message)
      if (!receipt.accepted) throw new Error('Feedback was not accepted')
      this.pending = null
      this.setData({ sent: true, message: '' })
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 409) this.pending = null
      this.setData({ error: error instanceof HttpError && error.statusCode === 429
        ? '当前提交较多，请稍后重试。'
        : '暂时无法提交，内容已保留，请稍后重试。' })
    } finally {
      this.setData({ busy: false })
    }
  },
  reset() { this.setData({ sent: false, selected: 0, error: '' }) },
})
