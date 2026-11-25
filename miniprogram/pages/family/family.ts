import { HttpError } from '../../services/api'
import { familyRequest, familySignIn, familySignOut } from '../../services/family-access'
import { beijingTime, bracedToday, familyId, familyWear, projectTimer,
  type FamilySession, type FamilyBrace, type PendingTimer, type TimerCommand } from '../../services/family-wire'
import { readWearLog } from '../../services/brace-wear'
import { serializeBackup } from '../../services/brace-ledger'

const ownsCode = /^[A-Fa-f0-9]{12}$/
const queueKey = (account: string) => 'xiaojiaoya-timer-queue:' + account

Page({
  brace: undefined as FamilyBrace | undefined,
  queue: undefined as PendingTimer | undefined,
  data: {
    mode: 'brace', code: '', busy: false, message: '', account: '', consented: false,
    active: false, started: '', minutes: 0, pending: 0,
    rows: [] as { id: string; label: string }[],
    startDay: '', startTime: '', endDay: '', endTime: '', editing: '', editingRevision: null as string | null,
    preview: '', importArchive: '', approved: false,
  },
  onLoad(query: Record<string, string | undefined>) {
    const code = query.scene || ''
    if (query.mode === 'pair' || ownsCode.test(code)) this.setData({ mode: 'pair', code })
  },
  onShow() { if (this.data.mode === 'brace' && this.data.account) return this.refresh() },
  changeCode(event: WechatMiniprogram.Input) {
    this.setData({ code: String(event.detail.value).trim().toUpperCase() })
  },
  async run(task: () => Promise<void>) {
    if (this.data.busy) return
    this.setData({ busy: true, message: '' })
    try { await task() }
    catch (error) {
      const code = error instanceof HttpError ? error.statusCode : 0
      if (code === 401 || code === 412) this.reset()
      this.setData({ message: code === 401 || code === 412 ? '请重新确认微信登录。'
        : code === 409 ? '云端已有变更或配对已使用，请核对后重试。'
          : code === 404 ? '登录码已过期或云端入口暂未开放。'
            : '暂时无法完成，请检查网络后重试。' })
    } finally { this.setData({ busy: false }) }
  },
  reset() {
    this.brace = undefined
    this.queue = undefined
    this.setData({ account: '', consented: false, rows: [], active: false, started: '', minutes: 0, pending: 0,
      preview: '', importArchive: '', editing: '', editingRevision: null, startDay: '', startTime: '', endDay: '', endTime: '', approved: false })
  },
  async connect() {
    const session: FamilySession = await familySignIn()
    if (this.data.account && this.data.account !== session.account) this.reset()
    this.setData({ account: session.account })
    this.queue = (wx.getStorageSync(queueKey(session.account)) as PendingTimer | undefined) || undefined
  },
  signIn() { return this.run(async () => { await this.connect(); if (this.data.mode === 'brace') await this.loadBrace() }) },
  approve() {
    if (!ownsCode.test(this.data.code)) {
      this.setData({ message: '请输入网页上显示的 12 位登录码。' })
      return
    }
    return this.run(async () => {
      if (!this.data.account) await this.connect()
      await familyRequest('approve', { code: this.data.code })
      this.setData({ code: '', approved: true, message: '已确认。请返回发起登录的网页。' })
    })
  },
  async loadBrace() {
    this.brace = await familyRequest('brace', { action: 'read' })
    this.render()
    if (this.queue && this.brace?.consented) await this.sync()
  },
  refresh() { return this.run(() => this.loadBrace()) },
  remember(queue?: PendingTimer) {
    const key = queueKey(this.data.account)
    if (queue?.commands.length) wx.setStorageSync(key, queue)
    else wx.removeStorageSync(key)
    this.queue = queue?.commands.length ? queue : undefined
  },
  displayWear() {
    const current = familyWear(this.brace?.archive ?? null)
    try { return projectTimer(current, this.queue?.commands ?? []) }
    catch { return current }
  },
  render() {
    const log = this.displayWear()
    this.setData({ consented: !!this.brace?.consented, active: log.activeStart !== null,
      started: log.activeStart === null ? '' : beijingTime(log.activeStart), minutes: bracedToday(log),
      pending: this.queue?.commands.length || 0,
      rows: log.sessions.slice(-30).reverse().map(row => ({ id: row.id,
        label: beijingTime(row.start) + ' 至 ' + beijingTime(row.end) })),
    })
  },
  async send(action: string, fields: Record<string, unknown> = {}, revision?: string | null) {
    this.brace = await familyRequest('brace', { action, operationId: familyId(), revision: revision === undefined ? this.brace?.revision : revision,
      consentVersion: this.brace?.consentVersion, ...fields })
    this.render()
  },
  consent() {
    return this.run(async () => {
      await this.send('consent')
      this.render()
    })
  },
  toggle() {
    if (this.data.busy || !this.data.consented || !this.brace) return
    const wear = this.displayWear()
    const action = wear.activeStart === null ? 'start' : 'stop'
    const command: TimerCommand = { action, timerId: action === 'start' ? familyId() : wear.activeId!,
      operationId: familyId(), at: Date.now() }
    try {
      projectTimer(wear, [command])
      this.remember({ revision: this.queue ? this.queue.revision : this.brace.revision,
        commands: [...this.queue?.commands ?? [], command] })
      this.render()
    } catch {
      this.setData({ message: '计时未能写入本机，请核对系统时间和存储空间。' })
      return
    }
    return this.run(() => this.sync())
  },
  async sync() {
    while (this.queue?.commands.length) {
      const { revision, commands } = this.queue
      const result: FamilyBrace = await familyRequest('brace', { ...commands[0], revision })
      this.remember({ revision: result.revision, commands: commands.slice(1) })
      this.brace = result
      this.render()
    }
    this.setData({ message: '计时已同步。' })
  },
  changeTime(event: WechatMiniprogram.TouchEvent & WechatMiniprogram.Input) {
    const field = event.currentTarget.dataset.field
    if (typeof field === 'string' && ['startDay', 'startTime', 'endDay', 'endTime'].includes(field)) {
      this.setData({ [field]: event.detail.value })
    }
  },
  edit(event: WechatMiniprogram.TouchEvent) {
    const row = this.displayWear().sessions.find(item => item.id === event.currentTarget.dataset.id)
    if (!row) return
    const start = beijingTime(row.start)
    const end = beijingTime(row.end)
    this.setData({ editing: row.id, editingRevision: this.brace?.revision ?? null,
      startDay: start.slice(0, 10), startTime: start.slice(11), endDay: end.slice(0, 10), endTime: end.slice(11) })
  },
  saveTime() {
    const { startDay, startTime, endDay, endTime, editing, editingRevision } = this.data
    const at = Date.parse(startDay + 'T' + startTime + ':00+08:00')
    const end = Date.parse(endDay + 'T' + endTime + ':00+08:00')
    if (!Number.isFinite(at) || !Number.isFinite(end) || end <= at) {
      this.setData({ message: '请填写完整的时间，结束应晚于开始。' })
      return
    }
    if (this.queue) return
    return this.run(async () => {
      await this.send('record', { timerId: editing || familyId(), at, end },
        editing ? editingRevision : this.brace?.revision)
      this.setData({ editing: '', editingRevision: null, startDay: '', startTime: '', endDay: '', endTime: '', message: '已同步。' })
    })
  },
  remove(event: WechatMiniprogram.TouchEvent) {
    if (this.queue) return
    const timerId = event.currentTarget.dataset.id
    wx.showModal({ title: '删除这段佩戴记录？', content: '删除后，两端都会更新。', success: ({ confirm }) => {
      if (confirm) void this.run(() => this.send('delete', { timerId }))
    } })
  },
  previewLocal() {
    try {
      const log = readWearLog()
      this.setData({ importArchive: serializeBackup(log), preview:
        `${log.sessions.length} 段佩戴、${log.plans.length} 条计划、${log.visits.length} 条随访${log.activeStart !== null ? '，含进行中计时' : ''}` })
    } catch {
      this.setData({ message: '读取旧记录失败。请保留旧记录并从本机工具导出。' })
    }
  },
  importLocal() {
    if (!this.data.importArchive || this.queue) return
    return this.run(async () => {
      await this.send('import', { archive: this.data.importArchive })
      this.setData({ importArchive: '', preview: '', message: '已导入并同步，原记录保留在本机。' })
    })
  },
  discard() {
    wx.showModal({ title: '放弃待同步计时？', content: '这些操作仍只保存在本机。', success: ({ confirm }) => {
      if (confirm) void this.run(async () => { this.remember(); await this.loadBrace() })
    } })
  },
  clear() {
    if (this.queue) return
    wx.showModal({ title: '撤回并清除云档？', content: '已同步的佩戴记录将清除。', success: ({ confirm }) => {
      if (confirm) void this.run(() => this.send('clear'))
    } })
  },
  logout() {
    const signOut = () => this.run(async () => { await familySignOut(); this.reset() })
    if (!this.queue) return signOut()
    wx.showModal({ title: '本机还有待同步计时', content: '同一微信重新登录后可继续同步。', success: ({ confirm }) => {
      if (confirm) void signOut()
    } })
  },
})
