import { HttpError } from '../../services/api'
import { familyRequest, familySignIn } from '../../services/family-access'
import { castCommand, castConfig, chinaDateTime, type CastConfig, type CastEntry, type JournalView } from '../../services/cast-journal'

const LABELS = {
  PENDING: '等待发送', SENT: '微信已受理', FAILED: '发送失败',
  UNCONFIRMED: '发送结果未确认', MISSED: '已错过发送时段',
}

const SIDES = ['未记录', '左侧', '右侧', '双侧']

const today = () => chinaDateTime().slice(0, 10)

function blank() {
  return { id: '', castDate: today(), care: '', visitDate: '', visitTime: '', side: 0, sequence: '' }
}

Page({
  addOnReady: false,
  revision: null as number | null,
  editingRevision: null as number | null,
  account: '',
  data: {
    config: null as CastConfig | null, consented: false, entries: [] as (CastEntry & { visitText: string; upcoming: boolean })[],
    reminder: null as (NonNullable<JournalView['reminder']> & { sendText: string; label: string }) | null,
    sides: SIDES, today: today(), form: blank(), editing: false, busy: false, error: '', status: '', family: false, signedIn: false,
  },
  onLoad(query: Record<string, string | undefined>) { this.addOnReady = query.add === '1' },
  onShow() {
    if (this.data.editing) return
    return this.refresh()
  },
  async refresh() {
    if (this.data.busy) return
    this.setData({ busy: true, error: '' })
    try {
      const config = await castConfig().catch(error => {
        if (error instanceof HttpError && [302, 404].includes(error.statusCode)) return null
        throw error
      })
      this.setData({ config })
      if (config?.enabled) {
        this.setData({ family: Boolean(config.familyEnabled) })
        if (!config.familyEnabled || this.data.signedIn) this.showJournal(await this.requestCast('read'))
      }
    } catch {
      this.setData({ error: '暂时无法连接石膏记录服务，请稍后重试。' })
    } finally {
      this.setData({ busy: false })
    }
  },
  async signIn() {
    if (this.data.busy) return
    this.setData({ busy: true, error: '' })
    try {
      this.account = (await familySignIn()).account
      this.showJournal(await this.requestCast('read'))
      this.setData({ signedIn: true })
      const pending = wx.getStorageSync('xiaojiaoya-cast-draft:' + this.account) as
        { form: ReturnType<typeof blank>; revision: number | null } | undefined
      if (!this.data.consented) wx.removeStorageSync('xiaojiaoya-cast-draft:' + this.account)
      else if (pending) {
        this.editingRevision = pending.revision
        this.setData({ editing: true, form: pending.form, status: '已恢复本机待同步记录，核对后可重试保存。' })
      }
    } catch {
      this.setData({ error: '微信登录暂未完成，请稍后重试。' })
    } finally { this.setData({ busy: false }) }
  },
  async requestCast(action: string, values: Record<string, unknown> = {}) {
    if (!this.data.family) return castCommand(action, values)
    const response = await familyRequest<{ journal: JournalView; revision: number | null }>('cast', {
      command: { ...values, action }, revision: action === 'save' ? this.editingRevision : this.revision,
    })
    this.revision = response.revision
    return response.journal
  },
  showJournal(journal: JournalView) {
    const { reminder } = journal
    const now = Date.now()
    this.setData({
      consented: journal.consented,
      entries: journal.entries.map(item => ({ ...item, visitText: item.visitAt ? chinaDateTime(item.visitAt).replace('T', ' ') : '',
        upcoming: Boolean(item.visitAt && Date.parse(item.visitAt) > now + 120000) })),
      reminder: reminder ? { ...reminder, sendText: chinaDateTime(reminder.sendAt).replace('T', ' '), label: LABELS[reminder.state] } : null,
    })
    if (this.addOnReady && journal.consented) { this.addOnReady = false; this.add() }
  },
  async apply(action: string, values: Record<string, unknown>, message: string) {
    if (this.data.busy) return false
    this.setData({ busy: true, status: '', error: '' })
    try {
      this.showJournal(await this.requestCast(action, values))
      this.setData({ status: message })
      return true
    } catch (e) {
      const status = e instanceof HttpError ? e.statusCode : 0
      if ([401, 412].includes(status) && this.data.family) {
        this.setData({ signedIn: false, entries: [], consented: false, reminder: null, form: blank(), editing: false })
      }
      const error = status === 409 ? '云端记录已变更。请保留当前填写内容，核对另一端记录后再编辑。'
        : status === 422 && action === 'schedule' ? '当前只能为未来两分钟至 90 天内的下次治疗设置提醒。'
        : status === 422 && action === 'save' ? '最多可保存 100 条记录，请先清理不再需要的记录。'
        : '操作未完成。请核对日期、授权和网络后重试。'
      this.setData({ status: error })
      return false
    } finally {
      this.setData({ busy: false })
    }
  },
  consent() {
    const config = this.data.config
    if (config?.enabled) return this.apply('consent', { consentVersion: config.consentVersion }, '已同意云端保存。')
  },
  add() {
    this.editingRevision = this.revision
    this.setData({ editing: true, status: '', form: { ...blank(), id: 'cast-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) } })
  },
  edit(e: WechatMiniprogram.TouchEvent) {
    const entry = this.data.entries.find(item => item.id === e.currentTarget.dataset.id)
    if (!entry) return
    this.editingRevision = this.revision
    const visit = entry.visitAt ? chinaDateTime(entry.visitAt) : ''
    this.setData({ editing: true, status: '', form: { id: entry.id, castDate: entry.castDate,
      care: entry.care, visitDate: visit.slice(0, 10), visitTime: visit.slice(11),
      side: Math.max(0, SIDES.indexOf(entry.side ?? '')), sequence: entry.sequence ? String(entry.sequence) : '' } })
  },
  change(e: WechatMiniprogram.TouchEvent & WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field
    if (field === 'side') this.setData({ form: { ...this.data.form, side: Number(e.detail.value) } })
    if (field === 'sequence' || field === 'castDate' || field === 'care' || field === 'visitDate' || field === 'visitTime') {
      this.setData({ form: { ...this.data.form, [field]: e.detail.value } })
    }
  },
  clearVisit() { this.setData({ form: { ...this.data.form, visitDate: '', visitTime: '' } }) },
  closeForm() {
    if (this.account) wx.removeStorageSync('xiaojiaoya-cast-draft:' + this.account)
    this.setData({ form: blank(), editing: false })
  },
  async save() {
    const { id, castDate, care, visitDate, visitTime, sequence, side } = this.data.form
    if (!castDate || Boolean(visitDate) !== Boolean(visitTime)) {
      wx.showToast({ title: '请填写石膏日期及完整的复诊时间', icon: 'none' })
      return
    }
    const visit = visitDate ? new Date(visitDate + 'T' + visitTime + ':00+08:00') : null
    if (visit && !Number.isFinite(visit.getTime())) {
      wx.showToast({ title: '请选择有效的复诊时间', icon: 'none' })
      return
    }
    if (sequence && !/^[1-9][0-9]?$|^100$/.test(sequence)) {
      wx.showToast({ title: '请填写 1 至 100 的石膏次数', icon: 'none' })
      return
    }
    const entry = { id, castDate, care: care.trim(), visitAt: visit?.toISOString() ?? null,
      side: side ? SIDES[side] : null, sequence: sequence ? Number(sequence) : null }
    if (this.data.family && this.account) {
      try {
        wx.setStorageSync('xiaojiaoya-cast-draft:' + this.account,
          { form: this.data.form, revision: this.editingRevision })
      } catch {
        this.setData({ status: '本机未能保存草稿，请保留当前页面后重试。' })
        return
      }
    }
    if (await this.apply('save', { entry }, '记录已保存。修改复诊时间后可重新授权提醒。')) this.closeForm()
  },
  remove(e: WechatMiniprogram.TouchEvent) {
    const entryId = e.currentTarget.dataset.id
    wx.showModal({ title: '删除这一条记录？', content: '和这条记录关联的待发提醒也会取消。', confirmText: '删除',
      success: ({ confirm }) => { if (confirm) void this.apply('delete', { entryId }, '记录已删除。') } })
  },
  clearAll() {
    wx.showModal({ title: '撤回云端保存授权？', content: '当前云端记录和待发提醒将清除。此操作无法撤销。', confirmText: '清除',
      success: ({ confirm }) => {
        if (confirm) void this.apply('clear', {}, '已撤回并清除云端记录。').then(done => { if (done) this.closeForm() })
      } })
  },
  async schedule(e: WechatMiniprogram.TouchEvent) {
    const entryId = e.currentTarget.dataset.id
    const templateId = this.data.config?.templateId
    if (this.data.busy || !templateId || !wx.requestSubscribeMessage) return
    this.setData({ busy: true, status: '' })
    const accepted = await new Promise<boolean>(resolve => wx.requestSubscribeMessage?.({
      tmplIds: [templateId],
      success: result => resolve(['accept', 'acceptWithAudio'].includes(result[templateId])),
      fail: () => resolve(false),
    }))
    this.setData({ busy: false })
    if (!accepted) {
      this.setData({ status: '本次未授权，记录仍已保存。' })
      return
    }
    return this.apply('schedule', { entryId, templateId }, '复诊提醒已安排。')
  },
  cancelReminder() { return this.apply('cancel', {}, '已取消待发提醒。') },
})
