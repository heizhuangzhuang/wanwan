<script setup lang="ts">
import type { PageResult, PostSummary, StageView } from '~/shared/types'

const route = useRoute()
const config = useRuntimeConfig()

const stageFilter = computed(() => String(route.query.stage || '').trim().toUpperCase())
const rawKind = computed(() => String(route.query.kind || '').trim().toUpperCase())
const kindFilter = computed(() => (rawKind.value === 'LITERATURE' || rawKind.value === 'GUIDE' ? rawKind.value : ''))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))

const { data, error } = await useFetch<{
  stage: StageView | null
  kind: string
  list: PageResult<PostSummary>
}>('/api/posts', {
  query: computed(() => ({
    stage: stageFilter.value || undefined,
    kind: kindFilter.value || undefined,
    page: page.value,
  })),
})

if (error.value?.statusCode === 404) {
  throw createError({ statusCode: 404, statusMessage: 'Stage Not Found' })
}

const title = computed(() => (data.value?.stage ? `${data.value.stage.label} · 原创导读` : '本站原创导读'))

const kindTabs = [
  { key: '', label: '全部导读' },
  { key: 'LITERATURE', label: '文献译读' },
  { key: 'GUIDE', label: '普通导读' },
]

function kindLink(key: string) {
  const query: Record<string, string> = {}
  if (stageFilter.value) query.stage = stageFilter.value
  if (key) query.kind = key
  return { path: '/posts', query }
}

useHead(() => ({
  title: `${title.value} - ${config.public.siteTitle}`,
}))
</script>

<template>
  <div>
    <h1>{{ title }}</h1>

    <StageFilterBar
      base-route="/posts"
      :selected-stage="stageFilter"
      :extra-query="{ kind: kindFilter || undefined }"
    />

    <div class="filter-bar" aria-label="导读类型筛选">
      <NuxtLink
        v-for="tab in kindTabs"
        :key="tab.key || 'all'"
        :to="kindLink(tab.key)"
        :class="{ active: kindFilter === tab.key }"
      >
        {{ tab.label }}
      </NuxtLink>
    </div>

    <div v-if="data?.list.items.length" class="card-list">
      <GuideCard v-for="guide in data.list.items" :key="guide.name" :guide="guide" heading="h2" />
    </div>
    <div v-else class="warn-bar">
      {{ kindFilter === 'LITERATURE' ? '暂无已发布的文献译读文章。' : '暂无已发布的原创导读。' }}
    </div>

    <PaginationBar
      v-if="data"
      base-route="/posts"
      :page="data.list.page"
      :size="data.list.size"
      :total="data.list.total"
      :extra-query="{ stage: stageFilter || undefined, kind: kindFilter || undefined }"
    />
  </div>
</template>
