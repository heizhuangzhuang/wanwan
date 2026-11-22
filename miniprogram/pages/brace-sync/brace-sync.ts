import { HttpError, requestFamilyJournal } from '../../services/api'
import { journalLogin, journalTimeout } from '../../services/cast-journal'
import { parseBackup, serializeBackup } from '../../services/brace-ledger'
import { readWearLog, saveWearLog } from '../../services/brace-wear'

interface CloudArchive {
  revision: string | null
  consentVersion: string
  consented: boolean
  updatedAt: string | null
  archive: string | null
}

const REVISION = 'wanwan-wear-cloud-revision'
const LOCAL_COPY = 'brace-before-cloud-restore.json'
const archiveFile = () => wx.env.USER_DATA_PATH + '/' + LOCAL_COPY

async function cloudArchive(action: string, values: Record<string, unknown> = {}): Promise<CloudArchive> {
  const code = await journalTimeout(journalLogin())
  return journalTimeout(requestFamilyJournal<CloudArchive>('/brace-archive', { action, code, ...values }))
}

function confirm(title: string, content: string, confirmText: string) {
  return new Promise<boolean>(resolve => wx.showModal({
    title, content, confirmText, success: result => resolve(result.confirm), fail: () => resolve(false),
  }))
}

Page({
  remote: null as CloudArchive | null,
  data: { busy: false, service: '', consented: false, hasCloud: false, cloudSaved: '',
    localSummary: '', cloudSummary: '',
    message: '', conflict: false, recovery: false },
  onShow() {
    try {
      wx.getFileSystemManager().accessSync(archiveFile())
      this.setData({ recovery: true })
    } catch { this.setData({ recovery: false }) }
    void this.refresh()
  },
  showRemote(remote: CloudArchive) {
    this.remote = remote
    let localSummary = ''
    let cloudSummary = ''
    try {
      const local = readWearLog()
      localSummary = `本机：${local.sessions.length} 段穿戴 · ${local.plans.length} 条计划 · ${local.visits.length} 条随访`
    } catch { /* ignore */ }
    if (remote.archive) {
      try {
        const parsed = parseBackup(remote.archive)
        cloudSummary = `云端：${parsed.sessions.length} 段穿戴 · ${parsed.plans.length} 条计划 · ${parsed.visits.length} 条随访`
      } catch { /* ignore */ }
    }
    this.setData({ service: 'ready', consented: remote.consented, hasCloud: Boolean(remote.archive),
      localSummary, cloudSummary,
      cloudSaved: remote.updatedAt ? new Date(remote.updatedAt).toLocaleString('zh-CN') : '' })
  },
  async refresh() {
    await this.run(async () => { this.showRemote(await cloudArchive('read')) })
  },
  async run(operation: () => Promise<void>) {
    if (this.data.busy) return
    this.setData({ busy: true, message: '' })
    try { await operation() }
    catch (error) {
      const code = error instanceof HttpError ? error.statusCode : 0
      if (code === 409) {
        this.setData({ conflict: true, message: '云端档案已变更。请重新读取并核对两边的版本。' })
      } else if ([302, 404, 503].includes(code)) {
        this.setData({ service: 'unavailable', message: '云端同步暂不可用。可继续本机记录并导出 JSON 备份。' })
      } else {
        this.setData({ message: code === 413 ? '档案超过当前云端大小限制，请先导出完整 JSON 备份。'
          : '操作未完成，请检查网络或本机存储后重试。' })
      }
    } finally { this.setData({ busy: false }) }
  },
  async consent() {
    if (!this.remote || this.data.busy) return
    await this.run(async () => {
      if (!await confirm('开启档案同步？', '仅监护人可授权。上传后，穿戴时段、计划、随访、复诊问题和困难记录会加密保存。同一微信账号可在另一台设备恢复。', '同意')) return
      const state = await cloudArchive('consent', { revision: this.remote!.revision, consentVersion: this.remote!.consentVersion })
      this.showRemote(state)
      this.setData({ message: '同步已开通。可上传本机档案。' })
    })
  },
  upload() { return this.saveCloud(false) },
  replaceCloud() { return this.saveCloud(true) },
  async saveCloud(replace: boolean) {
    await this.run(async () => {
      const remote = await cloudArchive('read')
      this.showRemote(remote)
      if (!remote.consented) { this.setData({ message: '请先授权云端存储。' }); return }
      const archive = serializeBackup(readWearLog())
      if (archive === remote.archive) {
        wx.setStorageSync(REVISION, remote.revision)
        this.setData({ conflict: false, message: '本机和云端档案内容相同。' })
        return
      }
      if (remote.archive && wx.getStorageSync(REVISION) !== remote.revision) {
        if (!replace) {
          this.setData({ conflict: true, message: '云端有来自另一台设备的版本。请核对后再决定使用哪个版本。' })
          return
        }
        if (!await confirm('用本机档案替换云端？', '两台设备的计时和记录会按你选择的完整档案保存。可以先在另一台设备导出备份。', '替换')) return
      }
      const saved = await cloudArchive('save', { revision: remote.revision, archive })
      wx.setStorageSync(REVISION, saved.revision)
      this.showRemote(saved)
      this.setData({ conflict: false, message: '已上传本机档案。' })
    })
  },
  async restore() {
    await this.run(async () => {
      const remote = await cloudArchive('read')
      this.showRemote(remote)
      if (!remote.archive) { this.setData({ message: '云端还没有可恢复的档案。' }); return }
      const log = parseBackup(remote.archive)
      const local = serializeBackup(readWearLog())
      if (local !== remote.archive) {
        if (!await confirm('恢复云端档案？', `云端包含 ${log.sessions.length} 段穿戴记录。当前本机版本会另存为恢复前的备份。`, '恢复')) return
        wx.getFileSystemManager().writeFileSync(archiveFile(), local, 'utf8')
        this.setData({ recovery: true })
        saveWearLog(log)
      }
      wx.setStorageSync(REVISION, remote.revision)
      this.setData({ conflict: false, message: '本机已接续云端档案。' })
    })
  },
  downloadRecovery() {
    wx.shareFileMessage?.({
      fileName: '矫正鞋恢复前备份.json', filePath: archiveFile(),
      fail: () => this.setData({ message: '备份分享未完成。' }),
    })
  },
  async withdraw() {
    if (!this.remote?.consented) return
    await this.run(async () => {
      if (!await confirm('撤回同步授权？', '云端穿戴档案将清除。你仍可在这台设备查看已有记录。', '撤回')) return
      const remote = await cloudArchive('clear', { revision: this.remote!.revision })
      wx.setStorageSync(REVISION, '')
      this.showRemote(remote)
      this.setData({ conflict: false, message: '同步授权已撤回，云端档案已清除。' })
    })
  },
})
