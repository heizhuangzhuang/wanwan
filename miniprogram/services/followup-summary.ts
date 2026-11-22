import { dailyWear, dateKey, dayBoundary, durationText, MINUTE, planOn, summarizeWear, type WearLog } from './brace-ledger'
import type { CastEntry } from './cast-journal'

export function planLabel(plan?: WearLog['plans'][number]) {
  return plan?.type === 'wear' ? durationText(plan.minutes! * MINUTE) :
    plan?.type === 'followup' ? '仅随访' : '未设目标'
}

export function followupSummary(log: WearLog, today: string, now = Date.now()) {
  const lastVisit = log.visits.filter(row => row.kind === '复诊' && row.day <= today)
    .sort((a, b) => b.day.localeCompare(a.day))[0]
  const from = lastVisit?.day ?? dateKey(dayBoundary(today, -29))
  const days = dailyWear(log, from, today, now)
  const stats = summarizeWear(days)
  const plans = log.plans.filter(plan => plan.day > from && plan.day <= today)
    .map(plan => ({ day: plan.day, label: planLabel(plan) }))
  const initialPlan = planLabel(planOn(log, from))
  const adjustment = log.visits.filter(row => ['调整支具', '更换矫正鞋'].includes(row.kind) && row.day <= today)
    .sort((a, b) => b.day.localeCompare(a.day))[0]
  return {
    from, today, fromVisit: Boolean(lastVisit), ...stats, total: days.length, unknown: days.length - stats.recorded,
    average: stats.recorded ? durationText(Math.round(stats.minutes / stats.recorded) * MINUTE) : '暂无记录',
    initialPlan, plans, adjustment: adjustment ? `${adjustment.day} ${adjustment.kind}${adjustment.note ? ' · ' + adjustment.note : ''}` : '暂无记录',
  }
}

export function treatmentTimeline(log: WearLog, cast: CastEntry[]) {
  return [
    ...log.visits.map(row => ({ id: 'visit-' + row.id, day: row.day, title: row.kind, note: row.note })),
    ...log.plans.map(row => ({ id: 'plan-' + row.day, day: row.day, title: '穿戴计划生效', note: planLabel(row) })),
    ...cast.map(row => ({ id: 'cast-' + row.id, day: row.castDate,
      title: row.sequence ? `第 ${row.sequence} 次石膏` : '石膏记录',
      note: [row.side, row.care].filter(Boolean).join(' · ') })),
    ...(log.observations ?? []).map(row => ({ id: 'difficulty-' + row.id, day: row.day,
      title: row.kind, note: [row.side, row.contacted ? '已联系治疗团队' : '联系情况待确认', row.outcome].filter(Boolean).join(' · ') })),
  ].sort((a, b) => b.day.localeCompare(a.day) || a.id.localeCompare(b.id))
}
