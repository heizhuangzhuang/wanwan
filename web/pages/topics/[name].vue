<script setup lang="ts">
import type { TopicView } from '~/shared/types'

const route = useRoute()
const config = useRuntimeConfig()
const name = computed(() => String(route.params.name || '').trim())

const { data: topic, error } = await useFetch<TopicView>(() => `/api/topics/${encodeURIComponent(name.value)}`)

if (error.value?.statusCode === 404) {
  throw createError({ statusCode: 404, statusMessage: 'Topic Not Found' })
}

useHead(() => ({
  title: topic.value ? `${topic.value.title} - ${config.public.siteTitle}` : config.public.siteTitle,
}))
</script>

<template>
  <div v-if="topic">
    <p><NuxtLink to="/topics">← 返回专题列表</NuxtLink></p>
    <h1>{{ topic.title }}</h1>
    <div class="notice-bar">{{ topic.intro }}</div>
    <div v-if="topic.resources.length" class="card-list">
      <ResourceCard v-for="item in topic.resources" :key="item.name" :resource="item" />
    </div>
    <div v-else class="warn-bar">该专题下暂无可公开资料。</div>
  </div>
</template>
