<script setup lang="ts">
import { accessLabel, materialLabel, safeHttpUrl, type ResourceView } from '~/shared/types'

const route = useRoute()
const config = useRuntimeConfig()
const { status, copy } = useCopyAction()

const name = computed(() => String(route.params.name || '').trim())
const { data, error } = await useFetch<{
  resource: ResourceView
  related: ResourceView[]
}>(() => `/api/resources/${encodeURIComponent(name.value)}`)

if (error.value?.statusCode === 404) {
  throw createError({ statusCode: 404, statusMessage: 'Resource Not Found' })
}

const r = computed(() => data.value?.resource)
const related = computed(() => data.value?.related ?? [])
const citationUrl = computed(() => safeHttpUrl(r.value?.citationUrl))
const originUrl = computed(() => {
  if (!r.value) return null
  return r.value.entry.type === 'WEB' || r.value.entry.type === 'MP_ARTICLE'
    ? safeHttpUrl(r.value.entry.url)
    : null
})
const downloadUrl = computed(() => {
  if (!r.value || r.value.linkStatus !== 'OK') return null
  const url = safeHttpUrl(r.value.attachment?.url)
  return url?.startsWith('https://') ? url : null
})

function copyCitation() {
  if (!r.value) return
  const text = [
    r.value.title,
    `来源：${r.value.sourceName}`,
    r.value.author ? `作者/机构：${r.value.author}` : '',
    citationUrl.value ? `链接：${citationUrl.value}` : '',
    r.value.doi ? `DOI：${r.value.doi}` : '',
    r.value.pmid ? `PMID：${r.value.pmid}` : '',
  ].filter(Boolean).join('\n')
  copy(text, '已复制原文出处信息，可粘贴查阅或发给家人。')
}

useHead(() => ({
  title: r.value ? `${r.value.title} - ${config.public.siteTitle}` : config.public.siteTitle,
}))
</script>

<template>
  <div v-if="r">
    <p><NuxtLink to="/resources">← 返回资料库</NuxtLink></p>
    <article class="card">
      <div class="meta-row" style="margin-bottom: 8px">
        <span class="badge">{{ materialLabel(r.materialType) }}</span>
        <span class="badge">{{ accessLabel(r.access) }}</span>
        <span v-if="r.language === 'OTHER'" class="badge">外文资料</span>
      </div>
      <h1>{{ r.title }}</h1>
      <p v-if="r.originalTitle && r.originalTitle !== r.title" class="card-orig-title">
        原标题：{{ r.originalTitle }}
      </p>

      <div v-if="r.linkStatus === 'SOURCE_RETRACTED'" class="warn-bar">
        该资料原文已被原站撤回或下线，已暂停正常推荐；仅保留题录核查记录。
      </div>
      <div v-else-if="r.linkStatus === 'NEEDS_RECHECK'" class="warn-bar">
        原文目前不可访问，稍后复核。以下保留原始出处信息供核对。
      </div>

      <p>{{ r.intro }}</p>
      <p v-if="r.storyContext" class="notice-bar">背景说明：{{ r.storyContext }}</p>

      <div class="meta-row">
        <span>来源：<strong>{{ r.sourceName }}</strong></span>
        <span v-if="r.author">作者/机构：{{ r.author }}</span>
        <span>原文日期：{{ r.publishedDate || '未注明' }}</span>
        <span v-if="r.lastVerifiedDate">最近核对：{{ r.lastVerifiedDate }}</span>
        <span v-if="r.doi">DOI：{{ r.doi }}</span>
        <span v-if="r.pmid">PMID：{{ r.pmid }}</span>
      </div>

      <p v-if="downloadUrl && r.attachment" class="meta-row" style="margin-top: 10px">
        <a :href="downloadUrl" target="_blank" rel="noopener noreferrer">
          下载附件 · {{ r.attachment.fileName }}
        </a>
      </p>

      <div class="action-bar" style="margin-top: 14px">
        <a
          v-if="r.linkStatus === 'OK' && originUrl"
          class="btn"
          :href="originUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          前往原站阅读（{{ r.sourceName }}）
        </a>
        <button class="btn btn-outline" type="button" @click="copyCitation">
          复制原文出处
        </button>
      </div>
      <p v-if="status" class="action-status" role="status" aria-live="polite">{{ status }}</p>

      <p v-if="citationUrl" class="meta-row" style="margin-top: 10px; word-break: break-all">
        <span>原始出处链接：{{ citationUrl }}</span>
      </p>

      <p class="meta-row" style="margin-top: 14px">
        <span>本页仅提供公开资料导航与出处信息，不提供医疗诊断或个体建议。</span>
        <NuxtLink :to="{ path: '/feedback', query: { resource: r.name } }">反馈勘误或失效</NuxtLink>
      </p>
    </article>

    <template v-if="related.length">
      <h2>还可以了解</h2>
      <div class="card-list">
        <ResourceCard v-for="item in related" :key="item.name" :resource="item" />
      </div>
    </template>
  </div>
</template>
