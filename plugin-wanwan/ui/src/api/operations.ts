import { axiosInstance } from '@halo-dev/api-client'

const BASE = '/apis/console.api.xiaojiaoya.run/v1alpha1'

export type FeedbackStatus = 'NEW' | 'REVIEWED' | 'PLANNED' | 'DONE'
export type FeedbackCategory = 'FEATURE' | 'USABILITY' | 'ISSUE' | 'OTHER'

export interface FeedbackEntry {
  name: string
  category: FeedbackCategory
  message: string
  channel: string
  status: FeedbackStatus
  createdAt: string
}

export async function getFeedback(page: number, status: FeedbackStatus | '') {
  const { data } = await axiosInstance.get<{ total: number; size: number; items: FeedbackEntry[] }>(
    `${BASE}/feedback`, { params: { page, status: status || undefined } },
  )
  return data
}

export async function saveFeedbackStatus(name: string, status: FeedbackStatus) {
  const { data } = await axiosInstance.put<FeedbackEntry>(
    `${BASE}/feedback/${encodeURIComponent(name)}`, { status },
  )
  return data
}

export async function deleteFeedback(name: string) {
  await axiosInstance.delete(`${BASE}/feedback/${encodeURIComponent(name)}`)
}

export type ProbeState =
  | 'OK'
  | 'REDIRECT'
  | 'HTTP_ERROR'
  | 'UNEXPECTED_RESPONSE'
  | 'TIMEOUT'
  | 'UNREACHABLE'
  | 'NOT_CONFIGURED'

export interface Probe {
  state: ProbeState
  httpStatus: number | null
  durationMs: number | null
}

export type Channel = 'trial' | 'formal'
export type Outcome = 'PASS' | 'FAIL'

export interface MiniProgramCheck {
  channel: Channel
  state: 'UNVERIFIED' | 'RECENT' | 'STALE' | 'UNAVAILABLE'
  version: string | null
  outcome: Outcome | null
  checkedAt: string | null
}

export interface OpsOverview {
  probes: {
    checkedAt: string
    webProcess: Probe
    webPosts: Probe
    haloStages: Probe
    haloPosts: Probe
  }
  miniProgramChecks: MiniProgramCheck[]
  contentReport?: {
    publicCards: number
    pendingReview: number
    withdrawn: number
    linksToCheck: number
    searchIndexSize?: number
    publishedGuides?: number
    uncategorizedGuides?: number
    missingStageCategories?: string[]
    unreadFeedback?: number
  } | null
}

export async function getOpsOverview() {
  const { data } = await axiosInstance.get<OpsOverview>(`${BASE}/ops-overview`)
  return data
}

export async function saveMiniProgramCheck(channel: Channel, version: string, outcome: Outcome) {
  const { data } = await axiosInstance.put<MiniProgramCheck>(`${BASE}/ops-miniprogram-checks/${channel}`, {
    version,
    outcome,
  })
  return data
}
