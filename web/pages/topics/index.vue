<script setup lang="ts">
import type { PageResult, TopicSummary } from '~/shared/types'

const route = useRoute()
const config = useRuntimeConfig()
const page = computed(() => Math.max(1, Number(route.query.page) || 1))

const { data } = await useFetch<PageResult<TopicSummary>>('/api/topics', {
  query: computed(() => ({ page: page.value })),
})

useHead({ title: `精选专题 - ${config.public.siteTitle}` })
</script>

<template>
  <div>
    <h1>精选专题</h1>
    <div v-if="data?.items.length" class="card-list">
      <article v-for="t in data.items" :key="t.name" class="card">
        <h2 class="card-title">
          <NuxtLink :to="`/topics/${encodeURIComponent(t.name)}`">{{ t.title }}</NuxtLink>
        </h2>
        <p class="card-intro">{{ t.intro }}</p>
        <div class="meta-row">含 {{ t.resourceCount }} 条资料</div>
      </article>
    </div>
    <div v-else class="warn-bar">暂无已发布专题。</div>
    <PaginationBar
      v-if="data"
      base-route="/topics"
      :page="data.page"
      :size="data.size"
      :total="data.total"
    />
  </div>
</template>
