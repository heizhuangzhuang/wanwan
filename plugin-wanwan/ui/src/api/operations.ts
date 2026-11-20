import { axiosInstance } from '@halo-dev/api-client'

const BASE = '/apis/console.api.xiaojiaoya.run/v1alpha1'

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
