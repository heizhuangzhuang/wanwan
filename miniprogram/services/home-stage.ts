import { dateKey, planOn, type WearLog } from './brace-ledger'

// Keep the existing storage key so previously selected stages remain available.
const PREFERENCE = 'wanwan-home-stage'
export const phases = ['按阶段查找', '刚发现', '产前准备', '石膏治疗', '支具穿戴', '长期随访']

export function saveHomePhase(phase: number): boolean {
  if (!Number.isInteger(phase) || !phases[phase]) return false
  wx.setStorageSync(PREFERENCE, phase)
  return true
}

export function homePhase(log: WearLog, now = Date.now()): number {
  const stored = wx.getStorageSync(PREFERENCE)
  if (typeof stored === 'number' && Number.isInteger(stored) && phases[stored]) return stored
  const plan = planOn(log, dateKey(now))
  return log.activeStart !== null ? 4
    : plan?.type === 'followup' ? 5
    : plan?.type === 'wear' || log.sessions.length ? 4 : 0
}
