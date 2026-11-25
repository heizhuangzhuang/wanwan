import type { IAppOption } from '../app'
import { HttpError } from './api'
import { journalLogin } from './cast-journal'
import type { FamilySession } from './family-wire'

const prefix = '/apis/family.xiaojiaoya.run/v1alpha1'
const storage = 'xiaojiaoya-family-session-v1'
let session: (FamilySession & { token: string }) | undefined
let signingIn: Promise<FamilySession> | undefined

function current() {
  if (!session) session = (wx.getStorageSync(storage) as typeof session) || undefined
  return session
}

export function familyRequest<T>(action: string, data?: Record<string, unknown>): Promise<T> {
  const { globalData } = getApp<IAppOption>()
  if (globalData.demoMode) return Promise.reject(new HttpError(503))
  return new Promise((resolve, reject) => {
    const options = {
      method: data ? 'POST' : 'GET',
      data,
      timeout: 10000,
      header: { 'Content-Type': 'application/json', 'X-Xiaojiaoya-Session': current()?.token || '',
        'X-Xiaojiaoya-Account': current()?.account || '' },
      success(result: { statusCode: number; data: unknown }) {
        if (result.statusCode === 401) {
          session = undefined
          wx.removeStorageSync(storage)
        }
        if (result.statusCode >= 200 && result.statusCode < 300 && typeof result.data === 'object' && result.data) {
          resolve(result.data as T)
        } else {
          reject(new HttpError(result.statusCode))
        }
      },
      fail: reject,
    }
    if (globalData.useCloudContainer && globalData.cloudEnv && wx.cloud) {
      wx.cloud.callContainer({ ...options, config: { env: globalData.cloudEnv }, path: prefix + '/' + action,
        header: { ...options.header, 'X-WX-SERVICE': globalData.cloudService } })
      return
    }
    const base = globalData.apiBase.replace(/\/apis\/api\.xiaojiaoya\.run\/v1alpha1\/?$/, prefix)
    if (!base.endsWith(prefix)) { reject(new HttpError(503)); return }
    wx.request({ ...options, url: base + '/' + action })
  })
}

export async function familySignIn(): Promise<FamilySession> {
  if (signingIn) return signingIn
  signingIn = (async () => {
    if (current()) {
      try { return await familyRequest<FamilySession>('me', {}) }
      catch (error) { if (!(error instanceof HttpError) || error.statusCode !== 401) throw error }
    }
    const code = await journalLogin()
    session = await familyRequest<FamilySession & { token: string }>('login', { code })
    wx.setStorageSync(storage, session)
    return session
  })()
  try { return await signingIn }
  finally { signingIn = undefined }
}

export async function familySignOut() {
  if (current()) await familyRequest('logout', {})
  session = undefined
  wx.removeStorageSync(storage)
}
