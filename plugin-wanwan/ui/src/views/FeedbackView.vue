<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Dialog, VButton, VPageHeader } from '@halo-dev/components'
import { deleteFeedback, getFeedback, saveFeedbackStatus, type FeedbackEntry, type FeedbackStatus } from '@/api/operations'

const statuses = { NEW: '待查看', REVIEWED: '已查看', PLANNED: '已纳入计划', DONE: '已完成' }
const categories = { FEATURE: '希望增加功能', USABILITY: '使用体验', ISSUE: '遇到问题', OTHER: '其他建议' }
const channels: Record<string, string> = { web: 'Web', 'wechat-miniprogram': '微信小程序' }
const format = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' })
const rows = ref<FeedbackEntry[]>([])
const selected = ref<FeedbackStatus | ''>('')
const page = ref(1)
const hasNext = ref(false)
const loading = ref(false)
const saving = ref('')
const error = ref('')

async function load(target = page.value) {
  if (loading.value || saving.value) return
  loading.value = true
  error.value = ''
  try {
    const result = await getFeedback(target, selected.value)
    rows.value = result.items
    page.value = target
    hasNext.value = page.value * result.size < result.total
  } catch {
    error.value = '暂时无法读取建议，请刷新重试。'
  } finally {
    loading.value = false
  }
}

async function update(entry: FeedbackEntry, event: Event) {
  const input = event.target as HTMLSelectElement
  const next = input.value as FeedbackStatus
  if (loading.value || saving.value || next === entry.status) return
  saving.value = entry.name
  error.value = ''
  let reload = false
  try {
    const saved = await saveFeedbackStatus(entry.name, next)
    rows.value = rows.value.map(row => row.name === saved.name ? saved : row)
    reload = !!selected.value
  } catch {
    input.value = entry.status
    error.value = '处理状态保存失败，请重试。'
  } finally {
    saving.value = ''
  }
  if (reload) await load(1)
}

function removeEntry(entry: FeedbackEntry) {
  Dialog.warning({
    title: '删除功能建议',
    description: '确定删除这条建议记录？删除后无法恢复。',
    confirmType: 'danger',
    onConfirm: async () => {
      saving.value = entry.name
      error.value = ''
      try {
        await deleteFeedback(entry.name)
        rows.value = rows.value.filter(row => row.name !== entry.name)
      } catch {
        error.value = '删除建议失败，请重试。'
      } finally {
        saving.value = ''
      }
    },
  })
}

onMounted(() => void load())
</script>

<template>
  <VPageHeader title="功能建议">
    <template #actions>
      <VButton type="secondary" :loading="loading" :disabled="!!saving" @click="load()">刷新</VButton>
    </template>
  </VPageHeader>
  <section class="feedback-list" aria-label="功能建议列表">
    <div class="feedback-toolbar">
      <label>处理状态
        <select v-model="selected" :disabled="loading || !!saving" @change="load(1)">
          <option value="">全部状态</option>
          <option v-for="(label, key) in statuses" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
    </div>
    <p v-if="error" role="alert" class="feedback-error">{{ error }}</p>
    <p v-else-if="loading" role="status">正在读取建议…</p>
    <p v-else-if="!rows.length">没有符合条件的建议。</p>
    <article v-for="row in rows" :key="row.name" class="feedback-row">
      <div>
        <h2>{{ categories[row.category] }}</h2>
        <p class="feedback-meta">{{ channels[row.channel] || '其他渠道' }} · {{ format.format(new Date(row.createdAt)) }}</p>
        <p class="feedback-text">{{ row.message }}</p>
      </div>
      <div class="feedback-actions">
        <label class="feedback-status">处理状态
          <select :value="row.status" :disabled="loading || !!saving" @change="update(row, $event)">
            <option v-for="(label, key) in statuses" :key="key" :value="key">{{ label }}</option>
          </select>
        </label>
        <VButton size="sm" type="danger" :disabled="loading || !!saving" @click="removeEntry(row)">删除</VButton>
      </div>
    </article>
    <nav v-if="page > 1 || hasNext" class="feedback-toolbar" aria-label="建议分页">
      <VButton type="secondary" :disabled="page <= 1 || loading || !!saving" @click="load(page - 1)">上一页</VButton>
      <span>第 {{ page }} 页</span>
      <VButton type="secondary" :disabled="!hasNext || loading || !!saving" @click="load(page + 1)">下一页</VButton>
    </nav>
  </section>
</template>

<style scoped>
.feedback-list { background: white; margin: 16px; padding: 16px 22px; border-radius: 8px; }
.feedback-toolbar { display: flex; align-items: center; gap: 12px; margin: 8px 0 14px; }
.feedback-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid #e2e8e4; }
.feedback-row > div { min-width: 0; }
.feedback-row h2 { font-weight: 650; color: #21392e; }
.feedback-meta { color: #56625a; font-size: 13px; margin: 4px 0 8px; }
.feedback-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.feedback-list select { margin-left: 6px; padding: 5px 28px 5px 8px; border: 1px solid #aab7ae; border-radius: 5px; background-image: none; }
.feedback-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.feedback-status { flex-shrink: 0; }
.feedback-error { color: #9b2c22; }
@media (max-width: 540px) {
  .feedback-row { flex-direction: column; gap: 8px; }
}
</style>
