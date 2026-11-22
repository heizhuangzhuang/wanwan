import { blankWearLog, chartWear, dailyWear, dateKey, dayBoundary, durationText, MAX_BACKUP_BYTES, MINUTE, normalizeWearLog,
  parseBackup, parseLocalTime, PERIOD_OPTIONS, periodStart, planOn, recordId, serializeBackup, STATE_LABEL, summarizeWear,
  timeKey, validDay, VISIT_TYPES, withPlan, type PeriodKey, type WearLog, type WearPlan } from '../../miniprogram/services/brace-ledger'
import { wearWorkbook } from '../../miniprogram/services/brace-xlsx'

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
        if (JSON.stringify(current) !== JSON.stringify(previous)) throw new ConcurrentEdit()
        archive.put(log, 'active')
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
  const range = () => ({ start: periodStart(log, period, day), end: day })
  const togglePlanInput = () => { byId('hours-label').hidden = value('plan-type') !== 'wear' }
  byId('plan-type').addEventListener('change', togglePlanInput)

  function renderToday(now: number) {
    const today = dateKey(now)
    date.max = today
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
    })), '暂无阶段计划。')
    list('visits', log.visits.filter(row => row.day >= start && row.day <= end).sort((a, b) => b.day.localeCompare(a.day))
      .map(row => ({ label: row.day + ' · ' + row.kind + (row.note ? ' · ' + row.note : ''), actions: [['删除', () => {
        if (window.confirm('删除这条随访记录？')) void commit({ ...log, visits: log.visits.filter(item => item.id !== row.id) }, '已删除。')
      }]] })), '所选期间暂无随访记录。')
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
      await writeLog(db, log, next)
      log = next
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
    else status('请核对设备时间。')
  })
  function resetEditor() {
    editing = ''
    byId<HTMLFormElement>('session-form').reset()
    byId('cancel-edit').hidden = true
  }
  click('add-session', () => {
    editor.open = true
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
    void commit({ ...log, sessions }, '已保存穿戴时段。').then(saved => {
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
    void commit({ ...log, visits: [...log.visits, { id: recordId(), kind, day: visitDay, note: value('visit-note').trim() }] },
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
    } catch { status('生成 Excel 失败，请尝试缩小统计区间。') }
  })
  click('backup', () => download(serializeBackup(log), '矫正鞋档案备份.json', 'application/json;charset=utf-8'))
  byId<HTMLInputElement>('restore').addEventListener('change', async event => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('备份超出限制')
      const restore = parseBackup(await file.text())
      if (window.confirm(`用备份的 ${restore.sessions.length} 段记录替换当前浏览器的档案？`)) {
        await commit(restore, '备份已恢复。')
        resetEditor()
      }
    } catch { status('请选择本工具导出的有效 JSON 备份。') }
  })
  render()
  byId<HTMLButtonElement>('timer').disabled = false
  byId<HTMLButtonElement>('add-session').disabled = false
  setInterval(() => { if (log.activeStart !== null && !busy) renderToday(Date.now()) }, 15_000)
}

void run().catch(() => status('无法读取本浏览器的档案。请使用支持本地存储的浏览器。'))
