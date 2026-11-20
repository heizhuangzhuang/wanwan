import { requestFamilyJournal } from './api'

export interface CastEntry {
  id: string
  castDate: string
  care: string
  visitAt: string | null
}

export interface Reminder {
  entryId: string
  visitAt: string
  sendAt: string
  state: 'PENDING' | 'SENT' | 'FAILED' | 'UNCONFIRMED' | 'MISSED'
}

export interface JournalView {
  consented: boolean
  entries: CastEntry[]
  reminder: Reminder | null
}

export interface CastConfig {
  enabled: boolean
  consentVersion: string
  contact: string | null
  templateId: string | null
}

export function castConfig() {
  return requestFamilyJournal<CastConfig>('/cast-journal-config')
}

export async function castCommand(action: string, values: Record<string, unknown> = {}) {
  const code = await new Promise<string>((resolve, reject) => wx.login({
    success: result => result.code ? resolve(result.code) : reject(new Error('微信未提供登录凭证')),
    fail: reject,
  }))
  return requestFamilyJournal<JournalView>('/cast-journal', { ...values, action, code })
}

export function chinaDateTime(value: string | number = Date.now()) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return ''
  return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
}
