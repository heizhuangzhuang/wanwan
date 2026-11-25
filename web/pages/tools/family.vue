<script setup lang="ts">
import { beijingTime, bracedToday, familyId, familyWear, projectTimer } from '../../../miniprogram/services/family-wire'
import type { FamilyBrace, FamilyCastEntry, FamilySession, PendingTimer, TimerCommand } from '../../../miniprogram/services/family-wire'
import { parseBackup, serializeBackup } from '../../../miniprogram/services/brace-ledger'

useHead({ title: '我的家庭记录 · 小脚丫步步指南', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
const route = useRoute()
const tab = ref(route.query.tool === 'cast' ? 'cast' : 'brace')
const base = useRuntimeConfig().public.siteBasePath
const user = ref<FamilySession>()
const pair = ref<{ code: string; expiresAt: string; image: string | null }>()
const busy = ref(false)
const message = ref('')
const brace = ref<FamilyBrace>()
const cast = ref<{ revision: number | null; journal: { entries: FamilyCastEntry[]; consented: boolean;
  reminder: { state: string } | null } }>()
const pending = ref<PendingTimer>()
const now = ref(Date.now())
const importFile = ref<{ data: string; preview: string }>()
const draft = ref<FamilyCastEntry>()
const draftRevision = ref<number | null>(null)
const visitInput = ref('')
const manual = reactive({ id: '', start: '', end: '' })
const manualRevision = ref<string | null>(null)
const selectedTimer = computed(() => {
  const log = familyWear(brace.value?.archive ?? null)
  try { return projectTimer(log, pending.value?.commands ?? []) }
  catch { return log }
})
const castDraftKey = () => `xiaojiaoya-cast-draft:${user.value?.account}`
const storageKey = () => `xiaojiaoya-timer-queue:${user.value?.account}`
let poll: ReturnType<typeof setInterval> | undefined
let tick: ReturnType<typeof setInterval> | undefined

function api<T>(action: string, body: Record<string, unknown> = {}) {
  const headers = user.value ? { 'X-Xiaojiaoya-Account': user.value.account } : undefined
  return $fetch<T>(`${base}/api/family/${action}`, { method: 'POST', body, headers })
}

function failure(error: unknown) {
  const status = (error as { statusCode?: number }).statusCode
  if (status === 401 || status === 412) {
    hidePrivate()
    return '请重新确认登录账号。已落在本机的待同步记录会保留。'
  }
  if (status === 409) return '另一台设备已修改这份档案。请核对云端和本机记录。'
  if (status === 413) return '备份超过当前导入上限，请保留原文件。'
  if (status === 403) return '当前环境的家庭登录暂未开放。'
  return '暂时无法连接，请稍后重试。'
}

async function run(task: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try { await task() }
  catch (error) { message.value = failure(error) }
  finally { busy.value = false }
}

function hidePrivate() {
  user.value = undefined
  brace.value = undefined
  cast.value = undefined
  draft.value = undefined
  pending.value = undefined
  importFile.value = undefined
  visitInput.value = ''
  resetManual()
}

function remember(queue?: PendingTimer) {
  if (queue?.commands.length) localStorage.setItem(storageKey(), JSON.stringify(queue))
  else localStorage.removeItem(storageKey())
  pending.value = queue?.commands.length ? queue : undefined
}

async function connected(session: FamilySession) {
  user.value = session
  const stored = localStorage.getItem(storageKey())
  pending.value = stored ? JSON.parse(stored) : undefined
  await load()
}

async function beginPair() {
  await run(async () => {
    pair.value = await api('pair')
    if (poll) clearInterval(poll)
    poll = setInterval(checkPair, 2500)
  })
}

function cancelPair() {
  if (poll) clearInterval(poll)
  pair.value = undefined
}

function abortLogin() {
  if (busy.value) return
  cancelPair()
  void api('cancel').catch(() => undefined)
}

async function checkPair() {
  if (!pair.value || busy.value) return
  if (Date.parse(pair.value.expiresAt) <= Date.now()) {
    cancelPair()
    message.value = '配对码已过期，请重新生成。'
    return
  }
  await run(async () => {
    const result = await api<FamilySession & { pending?: boolean }>('exchange')
    if (result.pending) return
    cancelPair()
    await connected(result)
  })
}

async function load() {
  if (!user.value) return
  if (tab.value === 'cast') {
    cast.value = await api('cast', { command: { action: 'read' } })
    if (!cast.value?.journal.consented) {
      draft.value = undefined
      localStorage.removeItem(castDraftKey())
    } else if (!draft.value) {
      const stored = localStorage.getItem(castDraftKey())
      if (stored) {
        const { entry, revision } = JSON.parse(stored)
        editCast(entry)
        draftRevision.value = revision
        message.value = '已恢复这台设备上尚未同步的石膏记录。核对后可重试保存。'
      }
    }
  } else {
    brace.value = await api('brace', { action: 'read' })
    if (pending.value) await syncTimer()
  }
}

function openTab(value: string) {
  if (busy.value) return
  tab.value = value
  if (user.value) void run(load)
}

async function signOut() {
  if (pending.value && !window.confirm('本机还有待同步计时。退出后，只有同一微信重新登录才能继续同步。')) return
  await run(async () => { await api('logout'); hidePrivate() })
}

async function braceCommand(action: string, data: Record<string, unknown> = {}, revision = brace.value?.revision) {
  brace.value = await api('brace', { action, revision, consentVersion: brace.value?.consentVersion,
    operationId: familyId(), ...data })
}

async function syncTimer() {
  while (pending.value?.commands.length) {
    const { revision, commands } = pending.value
    const result = await api<FamilyBrace>('brace', { ...commands[0], revision })
    remember({ revision: result.revision, commands: commands.slice(1) })
    brace.value = result
  }
}

function toggleTimer() {
  if (busy.value || !brace.value?.consented) return
  now.value = Date.now()
  const wear = selectedTimer.value
  const action = wear.activeStart === null ? 'start' : 'stop'
  const command: TimerCommand = { action, timerId: action === 'start' ? familyId() : wear.activeId!,
    operationId: familyId(), at: Date.now() }
  try {
    projectTimer(wear, [command])
    remember({ revision: pending.value?.commands.length ? pending.value.revision : brace.value.revision,
      commands: [...pending.value?.commands ?? [], command] })
  } catch {
    message.value = '未能在本机保存计时，请核对时间和本机空间后重试。'
    return
  }
  void run(syncTimer)
}

function resetManual() {
  manual.id = ''
  manual.start = ''
  manual.end = ''
}
function editSession(row: { id: string; start: number; end: number }) {
  manual.id = row.id
  manual.start = beijingTime(row.start).replace(' ', 'T')
  manual.end = beijingTime(row.end).replace(' ', 'T')
  manualRevision.value = brace.value?.revision ?? null
}
function saveSession() {
  if (pending.value) return
  const at = Date.parse(manual.start + ':00+08:00')
  const end = Date.parse(manual.end + ':00+08:00')
  if (!Number.isFinite(at) || !Number.isFinite(end) || end <= at) {
    message.value = '请确认结束时间晚于开始时间。'
    return
  }
  void run(async () => {
    await braceCommand('record', { at, end, timerId: manual.id || familyId() },
      manual.id ? manualRevision.value : brace.value?.revision)
    resetManual()
  })
}

function discardPending() {
  if (!window.confirm('放弃仅保存在这台设备的待同步计时？')) return
  try { remember(); void run(load) }
  catch { message.value = '无法清理本机待同步计时。' }
}

async function previewImport(event: Event) {
  importFile.value = undefined
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('too large')
    const log = parseBackup(await file.text())
    importFile.value = { data: serializeBackup(log),
      preview: `${log.sessions.length} 段佩戴、${log.plans.length} 条计划、${log.visits.length} 条随访${log.activeStart !== null ? '，含进行中的计时' : ''}` }
  } catch { message.value = '这份备份无法导入，请保留原文件并检查格式和大小。' }
}

function download(name: string, data: string) {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function editCast(entry?: FamilyCastEntry) {
  draft.value = entry ? { ...entry } : { id: familyId(), castDate: beijingTime(Date.now()).slice(0, 10),
    care: '', side: null, sequence: null, visitAt: null }
  visitInput.value = entry?.visitAt ? beijingTime(entry.visitAt).replace(' ', 'T') : ''
  draftRevision.value = cast.value?.revision ?? null
}

async function castCommand(action: string, fields: Record<string, unknown> = {}, revision = cast.value?.revision) {
  cast.value = await api('cast', { revision, command: { action, ...fields } })
}

function saveCast() {
  if (!draft.value) return
  const visit = visitInput.value ? new Date(visitInput.value + ':00+08:00') : null
  if (visit && !Number.isFinite(visit.getTime())) { message.value = '请核对复诊时间。'; return }
  const visitAt = visit?.toISOString() ?? null
  const entry = { ...draft.value, visitAt, sequence: draft.value.sequence || null }
  void run(async () => {
    try { localStorage.setItem(castDraftKey(), JSON.stringify({ entry, revision: draftRevision.value })) }
    catch { message.value = '本机未能保存草稿。请保留页面并重试。'; return }
    await castCommand('save', { entry }, draftRevision.value)
    localStorage.removeItem(castDraftKey())
    draft.value = undefined
    message.value = '已同步。复诊改期后可在小程序重新订阅提醒。'
  })
}

function cancelDraft() {
  draft.value = undefined
  visitInput.value = ''
  localStorage.removeItem(castDraftKey())
}

function clearBrace() {
  if (window.confirm('撤回授权并清除佩戴档案？')) void run(() => braceCommand('clear'))
}
function clearCast() {
  if (window.confirm('撤回授权并清除石膏记录？')) void run(async () => { await castCommand('clear'); cancelDraft() })
}
function deleteCast(entryId: string) {
  if (window.confirm('删除这一条石膏记录？')) void run(() => castCommand('delete', { entryId }))
}

onMounted(() => {
  tick = setInterval(() => { now.value = Date.now() }, 15000)
  void api<FamilySession>('me').then(connected).catch(() => undefined)
  window.addEventListener('online', refresh)
})
function refresh() { if (user.value) void run(load) }
onBeforeUnmount(() => {
  cancelPair()
  if (tick) clearInterval(tick)
  if (import.meta.client) window.removeEventListener('online', refresh)
})
</script>

<template>
  <main class="family-records">
    <NuxtLink class="text-link" to="/tools">返回家庭工具</NuxtLink>
    <h1>我的家庭记录</h1>
    <div class="action-bar">
      <button class="btn btn-outline" :aria-pressed="tab === 'brace'" :disabled="busy" @click="openTab('brace')">矫正鞋计时</button>
      <button class="btn btn-outline" :aria-pressed="tab === 'cast'" :disabled="busy" @click="openTab('cast')">石膏记录</button>
    </div>
    <p v-if="message" role="status">{{ message }}</p>
    <section v-if="!user" class="card">
      <h2>用微信登录</h2>
      <p>登录后可以在电脑和小程序查看同一份记录。</p>
      <button v-if="!pair" class="btn" :disabled="busy" @click="beginPair">生成登录码</button>
      <template v-else>
        <img v-if="pair.image" :src="pair.image" width="180" height="180" alt="用微信扫一扫，打开小程序确认网页登录">
        <p>也可以在小程序打开「家庭记录」，输入 <strong>{{ pair.code }}</strong> 后核对并确认。</p>
        <button class="btn btn-outline" @click="abortLogin" :disabled="busy">取消</button>
      </template>
    </section>
    <template v-else>
      <div class="action-bar">
        <button class="btn btn-outline" :disabled="busy" @click="refresh">刷新记录</button>
        <button class="btn btn-outline" :disabled="busy" @click="signOut">退出这台电脑</button>
      </div>
      <section v-if="tab === 'brace' && brace" class="card">
        <h2>矫正鞋计时</h2>
        <template v-if="!brace.consented">
          <p>由监护人确认保存。佩戴时段会保存到云端，可以在本页撤回并清除。</p>
          <button class="btn" :disabled="busy" @click="run(() => braceCommand('consent'))">同意保存</button>
        </template>
        <template v-else>
          <p>今天累计 {{ bracedToday(selectedTimer, now) }} 分钟（北京时间）</p>
          <p v-if="selectedTimer.activeStart !== null">计时中 · {{ beijingTime(selectedTimer.activeStart) }} 开始</p>
          <p v-if="pending" role="status">有 {{ pending.commands.length }} 项操作仅保存在这台设备，等待同步。</p>
          <div class="action-bar">
            <button class="btn" :disabled="busy" @click="toggleTimer">{{ selectedTimer.activeStart === null ? '开始计时' : '结束并保存' }}</button>
            <button v-if="pending" class="btn btn-outline" :disabled="busy" @click="discardPending">放弃本机待同步计时</button>
          </div>
          <form class="family-form" @submit.prevent="saveSession">
            <h3>{{ manual.id ? '修改佩戴时段' : '补记佩戴时段' }}</h3>
            <label>开始（北京时间） <input v-model="manual.start" type="datetime-local" required></label>
            <label>结束（北京时间） <input v-model="manual.end" type="datetime-local" required></label>
            <button class="btn" :disabled="busy || Boolean(pending)">保存时段</button>
            <button v-if="manual.id" type="button" class="btn btn-outline" @click="resetManual">取消修改</button>
          </form>
          <ul>
            <li v-for="row in [...selectedTimer.sessions].reverse()" :key="row.id">
              {{ beijingTime(row.start) }} 至 {{ beijingTime(row.end) }}
              <button type="button" :disabled="busy || Boolean(pending)" @click="editSession(row)">修改</button>
              <button type="button" :disabled="busy || Boolean(pending)" @click="run(() => braceCommand('delete', { timerId: row.id }))">删除</button>
            </li>
          </ul>
          <label>选择旧记录备份 <input type="file" accept=".json,application/json" @change="previewImport"></label>
          <p v-if="importFile">
            {{ importFile.preview }}
            <button type="button" :disabled="busy || Boolean(pending)" @click="run(async () => { if (importFile) { await braceCommand('import', { archive: importFile.data }); importFile = undefined } })">确认导入我的档案</button>
          </p>
          <div class="action-bar">
            <button v-if="brace.archive" class="btn btn-outline" @click="download('小脚丫佩戴备份.json', brace.archive)">导出云端备份</button>
            <button class="btn btn-outline" :disabled="busy || Boolean(pending)" @click="clearBrace">撤回并清除</button>
          </div>
        </template>
      </section>
      <section v-if="tab === 'cast' && cast" class="card">
        <h2>石膏记录</h2>
        <template v-if="!cast.journal.consented">
          <p>由监护人确认保存换石膏日期、注意事项和复诊时间。微信提醒在小程序单独订阅。</p>
          <button class="btn" :disabled="busy" @click="run(() => castCommand('consent', { consentVersion: 'cast-v1' }))">同意保存</button>
        </template>
        <template v-else>
          <button class="btn" :disabled="busy" @click="editCast()">记一次石膏</button>
          <form v-if="draft" class="family-form" @submit.prevent="saveCast">
            <label>石膏日期 <input v-model="draft.castDate" type="date" required></label>
            <label>侧别 <select v-model="draft.side"><option :value="null">未记录</option><option>左侧</option><option>右侧</option><option>双侧</option></select></label>
            <label>第几次 <input v-model.number="draft.sequence" type="number" min="1" max="100"></label>
            <label>注意事项 <textarea v-model="draft.care" maxlength="300" /></label>
            <label>复诊时间（北京时间） <input v-model="visitInput" type="datetime-local"></label>
            <button class="btn" :disabled="busy">保存</button>
            <button type="button" class="btn btn-outline" @click="cancelDraft" :disabled="busy">取消</button>
          </form>
          <ul>
            <li v-for="entry in cast.journal.entries" :key="entry.id">
              <strong>{{ entry.castDate }} {{ entry.side }}</strong> {{ entry.visitAt ? '复诊 ' + beijingTime(entry.visitAt) : '' }}
              <p v-if="entry.care">{{ entry.care }}</p>
              <button :disabled="busy" @click="editCast(entry)">修改</button>
              <button :disabled="busy" @click="deleteCast(entry.id)">删除</button>
            </li>
          </ul>
          <div class="action-bar">
            <button class="btn btn-outline" @click="download('小脚丫石膏记录.json', JSON.stringify(cast.journal.entries, null, 2))">导出石膏记录</button>
            <button class="btn btn-outline" :disabled="busy" @click="clearCast">撤回并清除</button>
          </div>
        </template>
      </section>
    </template>
  </main>
</template>
<style scoped>
.family-records { max-width: 720px; margin-inline: auto; }
.family-records .card { margin-block: 1rem; }
.family-form { display: grid; gap: .85rem; margin-block: 1rem; }
.family-form label { display: grid; gap: .3rem; }
.family-form :is(input, textarea, select) { padding: .55rem; font: inherit; }
.family-records li { margin-block: .75rem; }
</style>
