<script setup lang="ts">
import { getPrenatalGuide } from '~/shared/prenatal'

const route = useRoute()
const config = useRuntimeConfig()
const { status, copy } = useCopyAction()

const key = computed(() => String(route.params.key || '').trim())
const guide = computed(() => getPrenatalGuide(key.value))

if (!guide.value) {
  throw createError({ statusCode: 404, statusMessage: 'Prenatal Guide Not Found' })
}

const questionSection = computed(() =>
  guide.value?.sections.find(item => item.heading.includes('可以问医生')) ?? null,
)

function copyQuestions() {
  if (!guide.value || !questionSection.value) return
  copy(
    `${guide.value.title} · 可以问医生：\n${questionSection.value.body}`,
    '已复制就诊问题，可直接粘贴到备忘录。',
  )
}

useHead(() => ({
  title: guide.value ? `${guide.value.title} - ${config.public.siteTitle}` : config.public.siteTitle,
}))
</script>

<template>
  <div v-if="guide">
    <p><NuxtLink to="/prenatal">← 返回产前检查专项</NuxtLink></p>
    <section class="tool-lead">
      <h1>{{ guide.title }}</h1>
      <p>{{ guide.summary }}</p>
    </section>

    <section v-for="item in guide.sections" :key="item.heading" class="card" style="margin-bottom: 12px">
      <h2 class="card-title">{{ item.heading }}</h2>
      <p>{{ item.body }}</p>
    </section>

    <template v-if="questionSection">
      <div class="action-bar" style="margin: 14px 0">
        <button class="btn" type="button" @click="copyQuestions">复制可以问医生的问题</button>
        <NuxtLink class="btn btn-outline" to="/tools/preparation?stage=PRENATAL">打开产前就诊清单</NuxtLink>
      </div>
      <p v-if="status" class="action-status" role="status" aria-live="polite">{{ status }}</p>
    </template>

    <p class="meta-row">
      出处：
      <a :href="guide.sourceUrl" target="_blank" rel="noopener noreferrer">{{ guide.sourceTitle }}</a>
    </p>
    <p class="notice-bar">
      内容供就诊沟通时查阅。具体检查和报告解读以产前诊断或遗传咨询门诊说明为准。
    </p>
  </div>
</template>
