import { blankWearLog, chartWear, dailyWear, dateKey, dayBoundary, durationText, MAX_BACKUP_BYTES, MINUTE, normalizeWearLog,
  OBSERVATION_SIDES, OBSERVATION_TYPES, parseBackup, parseLocalTime, PERIOD_OPTIONS, periodStart, planOn, recordId, serializeBackup, STATE_LABEL, summarizeWear,
  timeKey, validDay, VISIT_TYPES, withPlan, type PeriodKey, type WearLog, type WearObservation, type WearPlan } from '../../miniprogram/services/brace-ledger'
import { wearWorkbook } from '../../miniprogram/services/brace-xlsx'

function planLabel(plan?: WearPlan) {
  return plan?.type === 'wear' ? durationText(plan.minutes! * MINUTE) :
    plan?.type === 'followup' ? '仅随访' : '未设目标'
}

function followupSummary(log: WearLog, today: string, now = Date.now()) {
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

async function copyToClipboard(content: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(content)
      return true
    } catch { /* fallback below */ }
  }
  try {
    const area = document.createElement('textarea')
    area.value = content
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-9999px'
    area.style.left = '-9999px'
    document.body.append(area)
    area.focus()
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

const byId = <T extends HTMLElement = HTMLElement>(name: string): T => document.getElementById('brace-' + name) as T
const value = (name: string) => byId<HTMLInputElement>(name).value
const text = (name: string, message: string) => {
  const element = byId(name)
  if (element.textContent !== message) element.textContent = message
}
const status = (message: string) => text('status', message)
const click = (name: string, listener: () => void) => byId(name).addEventListener('click', listener)

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('wanwan-brace-ledger', 1)
    request.onupgradeneeded = () => { request.result.createObjectStore('archives') }
    request.onblocked = () => reject(new Error('档案正在其他标签页升级，请关闭其他页面后重试。'))
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function readLog(db: IDBDatabase): Promise<WearLog> {
  return new Promise((resolve, reject) => {
    const request = db.transaction('archives').objectStore('archives').get('active')
    request.onsuccess = () => {
      try { resolve(request.result === undefined ? blankWearLog() : normalizeWearLog(request.result)) }
      catch (error) { reject(error) }
    }
    request.onerror = () => reject(request.error)
  })
}

class ConcurrentEdit extends Error {}

function writeLog(db: IDBDatabase, previous: WearLog, log: WearLog): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('archives', 'readwrite')
    const archive = tx.objectStore('archives')
    const latest = archive.get('active')
    let failure: unknown
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(failure ?? tx.error)
    latest.onsuccess = () => {
      try {
        const current = latest.result === undefined ? blankWearLog() : normalizeWearLog(latest.result)
        const expected = normalizeWearLog(previous)
        if (JSON.stringify(current) !== JSON.stringify(expected)) throw new ConcurrentEdit()
        archive.put(normalizeWearLog(log), 'active')
      } catch (error) { failure = error; tx.abort() }
    }
  })
}

function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const link = document.createElement('a')
  link.download = name
  link.href = url
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function labelAt(timestamp: number) { return dateKey(timestamp) + ' ' + timeKey(timestamp) }

function list(id: string, items: { label: string; actions?: [string, () => void][] }[], empty: string) {
  const rows = (items.length ? items : [{ label: empty }]).map(item => {
    const line = document.createElement('li')
    const description = document.createElement('span')
    description.textContent = item.label
    line.append(description)
    const actions = document.createElement('span')
    actions.className = 'brace-actions'
    for (const [label, handler] of item.actions ?? []) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn btn-outline'
      button.textContent = label
      button.setAttribute('aria-label', `${label}，${item.label}`)
      button.addEventListener('click', handler)
      actions.append(button)
    }
    if (actions.childElementCount) line.append(actions)
    if (!items.length) line.classList.add('brace-empty')
    return line
  })
  byId(id).replaceChildren(...rows)
}

async function run() {
  const db = await openStore()
  let log = await readLog(db)
  let period: PeriodKey = '30'
  let day = dateKey(Date.now())
  let editing = ''
  let busy = false
  const date = byId<HTMLInputElement>('end')
  const editor = byId<HTMLDetailsElement>('session-editor')
  date.max = day
  date.value = day
  byId<HTMLInputElement>('plan-day').value = day
  byId<HTMLInputElement>('visit-day').value = day
  const obsDayInput = document.getElementById('brace-obs-day') as HTMLInputElement | null
  if (obsDayInput) {
    obsDayInput.value = day
    obsDayInput.max = day
  }
  const range = () => ({ start: periodStart(log, period, day), end: day })
  const togglePlanInput = () => { byId('hours-label').hidden = value('plan-type') !== 'wear' }
  byId('plan-type').addEventListener('change', togglePlanInput)

  function buildSummaryText(now: number): string {
    const today = dateKey(now)
    const s = followupSummary(log, today, now)
    const recentObs = (log.observations ?? [])
      .filter(o => o.day >= s.from && o.day <= today)
      .sort((a, b) => b.day.localeCompare(a.day))
    const savedQuestions = (log.questions ?? []).filter(Boolean)
    const lines = [
      `复诊摘要 ${s.from} 至 ${s.today}${s.fromVisit ? '（自上次复诊）' : '（近 30 天）'}`,
      `记录覆盖 ${s.recorded}/${s.total} 天 · 有记录日均值 ${s.average}`,
      `未记录 ${s.unknown} 天 · 低于目标 ${s.below} 天 · 确认未穿 ${s.zero} 天（低于目标及未穿仅统计已结束日期）`,
      `期初目标 ${s.initialPlan}`,
      ...s.plans.map(plan => `阶段变更 ${plan.day} ${plan.label}`),
      `最近一次支具调整 ${s.adjustment}`,
      ...recentObs.map(o => `穿戴观察 ${o.day} · ${o.kind}（${o.side}，${o.contacted ? '已联系团队' : '未记录联系'}）${o.outcome ? '：' + o.outcome : ''}`),
      ...savedQuestions.map((q, idx) => `想问医生 ${idx + 1}：${q}`),
    ]
    return lines.join('\n')
  }

  function renderToday(now: number) {
    const today = dateKey(now)
    date.max = today
    if (obsDayInput) obsDayInput.max = today
    const current = planOn(log, today)
    const [todayWear] = dailyWear(log, today, today, now)
    text('today-total', todayWear.recordedMinutes === null ? '—' : durationText(todayWear.recordedMinutes * MINUTE))
    text('phase', current?.type === 'followup' ? '今天仅随访' :
      current?.minutes ? '今日目标 ' + durationText(current.minutes * MINUTE) : '今日未设目标')
    const progress = byId<HTMLProgressElement>('today-progress')
    progress.hidden = !current?.minutes
    if (current?.minutes) {
      progress.max = current.minutes
      progress.value = Math.min(current.minutes, todayWear.recordedMinutes ?? 0)
    }
    text('timer', log.activeStart === null ? '开始计时' : '结束并保存')
    text('running', log.activeStart === null ? '' : '计时中 · 开始于 ' + labelAt(log.activeStart))
  }

  function render() {
    const { start, end } = range()
    const now = Date.now()
    const today = dateKey(now)
    const days = dailyWear(log, start, end, now)
    const stats = summarizeWear(days)
    renderToday(now)
    text('average', stats.recorded ? durationText(stats.minutes / stats.recorded * MINUTE) : '—')
    text('range', start + ' 至 ' + end)
    text('detail-day', end === today ? end + '（今天）' : end)
    const confirmZero = byId<HTMLButtonElement>('confirm-zero')
    confirmZero.hidden = end >= today
    text('confirm-zero', log.confirmedZero.includes(end) ? '撤回未穿确认' : '确认当天未穿')
    for (const key of ['recorded', 'below', 'missing', 'zero'] as const) text(key, String(stats[key]))
    const chart = byId('chart')
    chart.hidden = stats.recorded === 0
    byId('chart-caption').hidden = chart.hidden
    text('chart-caption', '选择一列查看对应日期和平均时长。')
    byId('chart-empty').hidden = !chart.hidden
    text('chart-empty', '这段时间没有穿戴记录。记下一段穿戴后，趋势会显示在这里。')
    const bars = chart.hidden ? [] : chartWear(days).map(item => {
      const column = document.createElement('div')
      const button = document.createElement('button')
      const track = document.createElement('span')
      const fill = document.createElement('i')
      const label = document.createElement('time')
      column.className = 'brace-column'
      const description = item.start === item.end ? item.start + '，' + item.average :
        item.start + ' 至 ' + item.end + '，' + item.average
      column.setAttribute('role', 'listitem')
      button.type = 'button'
      button.title = description
      button.setAttribute('aria-label', description)
      button.setAttribute('aria-pressed', 'false')
      button.addEventListener('click', () => {
        chart.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false')
        button.setAttribute('aria-pressed', 'true')
        text('chart-caption', description)
      })
      track.className = 'brace-track'
      track.setAttribute('aria-hidden', 'true')
      label.setAttribute('aria-hidden', 'true')
      label.dateTime = item.start
      column.toggleAttribute('data-missing', item.recorded === 0)
      fill.style.height = item.height + '%'
      label.textContent = item.label
      track.append(fill)
      button.append(track, label)
      column.append(button)
      return column
    })
    chart.replaceChildren(...bars)
    list('alerts', days.filter(row => ['unrecorded', 'below', 'zero'].includes(row.state)).slice(-12).reverse()
      .map(row => ({
        label: row.day + ' · ' + STATE_LABEL[row.state],
        actions: [['查看当天', () => {
          selectDay(row.day)
          byId('detail').focus({ preventScroll: true })
          byId('detail').scrollIntoView({ block: 'start' })
        }]],
      })), '所选期间暂无待核对记录。')
    list('plans', log.plans.slice().reverse().map(plan => ({
      label: plan.day + ' · ' + (plan.type === 'wear' ? durationText(plan.minutes! * MINUTE) :
        plan.type === 'followup' ? '仅随访' : '未设目标'),
      actions: [['删除', () => {
        if (window.confirm(`删除 ${plan.day} 生效的阶段计划？`)) {
          void commit({ ...log, plans: log.plans.filter(item => item.day !== plan.day) }, '已删除计划。')
        }
      }]],
    })), '暂无阶段计划。')
    list('visits', log.visits.slice().sort((a, b) => b.day.localeCompare(a.day))
      .map(row => ({ label: row.day + ' · ' + row.kind + (row.note ? ' · ' + row.note : ''), actions: [['删除', () => {
        if (window.confirm('删除这条随访记录？')) void commit({ ...log, visits: log.visits.filter(item => item.id !== row.id) }, '已删除。')
      }]] })), '暂无随访记录。')
    list('observations', (log.observations ?? []).slice().sort((a, b) => b.day.localeCompare(a.day))
      .map(row => ({
        label: `${row.day} · ${row.kind}（${row.side}）· ${row.contacted ? '已联系团队' : '待确认联系'}${row.outcome ? ' · ' + row.outcome : ''}`,
        actions: [['删除', () => {
          if (window.confirm('删除这条穿戴困难记录？')) {
            void commit({ ...log, observations: (log.observations ?? []).filter(item => item.id !== row.id) }, '已删除穿戴观察。')
          }
        }]],
      })), '暂无穿戴困难记录。')
    const qForm = document.getElementById('brace-questions-form')
    if (qForm && !qForm.contains(document.activeElement)) {
      for (let i = 0; i < 3; i++) {
        const input = document.getElementById('brace-q-' + i) as HTMLInputElement | null
        if (input) input.value = log.questions?.[i] ?? ''
      }
    }
    text('summary-preview', buildSummaryText(now))
    const cancelTimerBtn = document.getElementById('brace-cancel-timer')
    if (cancelTimerBtn) cancelTimerBtn.hidden = log.activeStart === null
    list('sessions', log.sessions.filter(row => row.start < dayBoundary(end, 1) && row.end > dayBoundary(end))
      .sort((a, b) => b.start - a.start).map(row => ({
        label: labelAt(row.start) + ' 至 ' + labelAt(row.end),
        actions: [['编辑', () => {
          editing = row.id
          byId<HTMLInputElement>('start-time').value = labelAt(row.start).replace(' ', 'T')
          byId<HTMLInputElement>('end-time').value = labelAt(row.end).replace(' ', 'T')
          byId('cancel-edit').hidden = false
          editor.open = true
          byId('start-time').focus()
        }], ['删除', () => {
          if (window.confirm('删除这段穿戴记录？')) void commit({ ...log, sessions: log.sessions.filter(item => item.id !== row.id) }, '已删除。')
        }]],
      })), '所选日暂无完成的时段。')
    for (const button of byId('periods').querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.period === period))
    }
  }

  function selectDay(nextDay: string) {
    day = nextDay
    date.value = day
    render()
  }

  async function commit(next: WearLog, message: string): Promise<boolean> {
    if (busy) return false
    busy = true
    try {
      const normalized = normalizeWearLog(next)
      await writeLog(db, log, normalized)
      log = normalized
      render()
      status(message)
      return true
    } catch (error) {
      if (error instanceof ConcurrentEdit) {
        log = await readLog(db)
        render()
        status('档案已在其他标签页更新。已读取最新版，请重试当前操作。')
      } else status('无法保存档案，请检查浏览器存储空间。')
      return false
    }
    finally { busy = false }
  }

  for (const item of PERIOD_OPTIONS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = item.label
    button.dataset.period = item.key
    button.addEventListener('click', () => { period = item.key; render() })
    byId('periods').append(button)
  }
  date.addEventListener('change', () => {
    if (!validDay(date.value) || date.value > dateKey(Date.now())) { date.value = day; return }
    selectDay(date.value)
  })
  click('timer', () => {
    const now = Date.now()
    const active = log.activeStart
    if (active === null) void commit({ ...log, activeStart: now }, '已开始计时。')
    else if (now > active) void commit({ ...log, activeStart: null, sessions: [...log.sessions,
      { id: recordId(), start: active, end: now }] }, '已保存穿戴时段。')
    else status('请核对设备时间，或点击「取消计时」清除异常状态。')
  })
  document.getElementById('brace-cancel-timer')?.addEventListener('click', () => {
    if (log.activeStart !== null && window.confirm('放弃当前正在计时的时段？')) {
      void commit({ ...log, activeStart: null }, '已取消本次计时。')
    }
  })
  function resetEditor() {
    editing = ''
    byId<HTMLFormElement>('session-form').reset()
    byId('cancel-edit').hidden = true
  }
  click('add-session', () => {
    resetEditor()
    editor.open = true
    editor.scrollIntoView({ block: 'nearest' })
    byId('start-time').focus()
  })
  click('cancel-edit', () => {
    resetEditor()
    editor.querySelector('summary')?.focus()
    editor.open = false
  })
  byId('session-form').addEventListener('submit', event => {
    event.preventDefault()
    const readTime = (id: string) => { const raw = value(id); return parseLocalTime(raw.slice(0, 10), raw.slice(11)) }
    const start = readTime('start-time')
    const end = readTime('end-time')
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > Date.now()) {
      status('请填写有效的起止时间，结束时间不能在将来。'); return
    }
    const sessions = [...log.sessions.filter(item => item.id !== editing), { id: editing || recordId(), start, end }]
    const confirmedZero = log.confirmedZero.filter(d => start >= dayBoundary(d, 1) || end <= dayBoundary(d))
    void commit({ ...log, sessions, confirmedZero }, '已保存穿戴时段。').then(saved => {
      if (!saved) return
      resetEditor()
      const savedDay = dateKey(end)
      if (savedDay !== day) selectDay(savedDay)
      byId('detail').focus({ preventScroll: true })
      editor.open = false
    })
  })
  byId('plan-form').addEventListener('submit', event => {
    event.preventDefault()
    const type = value('plan-type') as WearPlan['type']
    const start = value('plan-day')
    const hours = Number(value('plan-hours'))
    const minutes = type === 'wear' ? Math.round(hours * 60) : null
    if (!validDay(start) || !['wear', 'followup', 'unset'].includes(type)
      || (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || hours > 24))) {
      status('请填写有效生效日期和目标时长。'); return
    }
    void commit(withPlan(log, { day: start, type, minutes }), '已保存阶段计划。')
  })
  byId('visit-form').addEventListener('submit', event => {
    event.preventDefault()
    const visitDay = value('visit-day')
    const kind = VISIT_TYPES.find(type => type === value('visit-kind'))
    if (!validDay(visitDay) || !kind) { status('请选择日期和记录类型。'); return }
    void commit({ ...log, visits: [...log.visits, { id: recordId(), day: visitDay, kind, note: value('visit-note').trim() }] },
      '已保存随访记录。').then(saved => { if (saved) byId<HTMLInputElement>('visit-note').value = '' })
  })
  click('confirm-zero', () => {
    if (day >= dateKey(Date.now())) { status('请选择已经结束的日期。'); return }
    const existing = log.confirmedZero.includes(day)
    if (!existing && dailyWear(log, day, day)[0].recordedMinutes !== null) { status('当天已有穿戴时段，请先核对明细。'); return }
    if (!window.confirm(existing ? '撤回此日的未穿确认？' : '确认所选日期未穿？')) return
    const confirmedZero = existing ? log.confirmedZero.filter(item => item !== day) : [...log.confirmedZero, day]
    void commit({ ...log, confirmedZero }, existing ? '已撤回确认。' : '已确认未穿。')
  })
  click('excel', () => {
    const { start, end } = range()
    try {
      const bytes = wearWorkbook(log, start, end).buffer as ArrayBuffer
      download(bytes, '矫正鞋随访-' + end + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      status('已导出 Excel 统计表。')
    } catch { status('生成 Excel 失败，请尝试缩小统计区间。') }
  })
  click('backup', () => {
    download(serializeBackup(log), '矫正鞋档案备份.json', 'application/json;charset=utf-8')
    status('已导出 JSON 备份文件。')
  })
  byId<HTMLInputElement>('restore').addEventListener('change', async event => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('备份文件超出大小限制')
      const restore = parseBackup(await file.text())
      const localNote = log.sessions.length ? `当前浏览器已有 ${log.sessions.length} 段记录将被替换。` : ''
      if (window.confirm(`用备份的 ${restore.sessions.length} 段穿戴记录替换当前档案？${localNote}`)) {
        await commit(restore, '备份已恢复。')
        resetEditor()
      }
    } catch (err) {
      status(err instanceof Error && err.message ? `恢复失败：${err.message}` : '请选择本工具导出的有效 JSON 备份。')
    }
  })
  document.querySelectorAll<HTMLButtonElement>('.brace-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const hours = btn.dataset.presetHours
      if (!hours) return
      byId<HTMLSelectElement>('plan-type').value = 'wear'
      togglePlanInput()
      byId<HTMLInputElement>('plan-hours').value = hours
      status(`已填入每日 ${hours} 小时，确认生效日期后点击「保存计划」。`)
    })
  })
  byId('obs-form').addEventListener('submit', event => {
    event.preventDefault()
    const obsDay = value('obs-day')
    const kind = OBSERVATION_TYPES.find(item => item === value('obs-kind'))
    const side = OBSERVATION_SIDES.find(item => item === value('obs-side'))
    if (!validDay(obsDay) || obsDay > dateKey(Date.now()) || !kind || !side) {
      status('请选择不晚于今天的日期及困难类型。')
      return
    }
    const contacted = byId<HTMLInputElement>('obs-contacted').checked
    const outcome = value('obs-outcome').trim().slice(0, 200)
    const row: WearObservation = { id: recordId(), day: obsDay, kind, side, contacted, outcome }
    void commit({ ...log, observations: [...(log.observations ?? []), row] }, '已保存穿戴观察记录。').then(saved => {
      if (saved) {
        byId<HTMLInputElement>('obs-outcome').value = ''
        byId<HTMLInputElement>('obs-contacted').checked = false
      }
    })
  })
  byId('questions-form').addEventListener('submit', event => {
    event.preventDefault()
    const questions = [0, 1, 2]
      .map(i => value('q-' + i).trim().slice(0, 100))
      .filter(Boolean)
    void commit({ ...log, questions }, '已保存复诊问题，并同步到下方复诊摘要。')
  })
  click('copy-summary', () => {
    const summaryText = buildSummaryText(Date.now())
    void copyToClipboard(summaryText).then(ok => {
      status(ok ? '已复制复诊摘要，可直接粘贴发给医生或家人。' : '复制失败，请长按上方摘要框手动复制。')
    })
  })
  render()
  byId<HTMLButtonElement>('timer').disabled = false
  byId<HTMLButtonElement>('add-session').disabled = false
  setInterval(() => {
    if (busy) return
    const now = Date.now()
    if (log.activeStart !== null || date.max !== dateKey(now)) renderToday(now)
  }, 15_000)
}

void run().catch(() => status('无法读取本浏览器的档案。请使用支持本地存储的浏览器。'))
