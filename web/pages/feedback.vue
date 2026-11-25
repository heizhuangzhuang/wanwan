<script setup lang="ts">
import { FEEDBACK_CATEGORIES } from '~/shared/types'

const route = useRoute()
const config = useRuntimeConfig()

const resource = computed(() => String(route.query.resource || '').trim().slice(0, 120))
const category = ref<string>('FEATURE')
const message = ref(resource.value ? `关于资料「${resource.value}」的反馈：` : '')
const requestId = ref('')
const submitting = ref(false)
const sent = ref(route.query.sent === '1')
const errorMsg = ref('')

function makeUuid() {
  if (import.meta.client && crypto?.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`
}

onMounted(() => {
  requestId.value = makeUuid()
})

async function onSubmit() {
  errorMsg.value = ''
  const trimmed = message.value.trim()
  if (trimmed.length < 3 || trimmed.length > 500) {
    errorMsg.value = '请选择建议类型，并填写 3–500 字的建议。'
    return
  }
  submitting.value = true
  try {
    await $fetch('/api/feedback', {
      method: 'POST',
      body: {
        requestId: requestId.value || makeUuid(),
        category: category.value,
        message: trimmed,
      },
    })
    sent.value = true
  } catch (err: unknown) {
    const e = err as { statusCode?: number; statusMessage?: string; data?: { statusMessage?: string } }
    if (e?.statusCode === 409) {
      requestId.value = makeUuid()
    }
    errorMsg.value = e?.data?.statusMessage || e?.statusMessage || '暂时无法提交，内容已保留，请稍后重试。'
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  sent.value = false
  errorMsg.value = ''
  message.value = ''
  requestId.value = makeUuid()
}

useHead({ title: `功能建议 - ${config.public.siteTitle}` })
</script>

<template>
  <section style="max-width: 620px">
    <h1>功能建议</h1>
    <p>告诉我们你想增加的功能，或遇到的使用问题。建议由运营人员查看。</p>

    <div v-if="sent" class="card" role="status">
      <h2>已收到你的建议</h2>
      <p>谢谢你告诉我们哪些地方可以做得更好。</p>
      <button class="btn" type="button" @click="resetForm">再提一条</button>
    </div>

    <form v-else class="card" @submit.prevent="onSubmit">
      <p v-if="errorMsg" role="alert" class="warn-bar">{{ errorMsg }}</p>
      <p v-if="resource" class="notice-bar">正在反馈资料编号：<code>{{ resource }}</code></p>

      <label for="category">建议类型</label>
      <select
        id="category"
        v-model="category"
        name="category"
        class="search-input"
        style="display: block; width: 100%; margin: 6px 0 18px"
      >
        <option v-for="item in FEEDBACK_CATEGORIES" :key="item.key" :value="item.key">
          {{ item.label }}
        </option>
      </select>

      <label for="suggestion">你希望改进什么？</label>
      <textarea
        id="suggestion"
        v-model="message"
        name="message"
        required
        minlength="3"
        maxlength="500"
        rows="5"
        aria-describedby="suggestion-hint"
        class="search-input"
        style="display: block; box-sizing: border-box; width: 100%; margin-top: 6px; min-height: 128px; font: inherit"
        placeholder="例如，希望穿戴记录可以按月下载。"
      />
      <p id="suggestion-hint" class="meta-row">3–500 字。请勿填写姓名、联系方式、病历或检查报告。</p>
      <button type="submit" class="btn" :disabled="submitting">
        {{ submitting ? '提交中...' : '提交建议' }}
      </button>
    </form>
  </section>
</template>
