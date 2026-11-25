<script setup lang="ts">
import type { PageResult, PostSummary, ResourceView, StageView } from '~/shared/types'

const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()

const stageKey = computed(() => String(route.params.key || '').trim().toUpperCase())
const selectedType = computed(() => String(route.query.type || '').trim().toUpperCase())
const selectedTag = computed(() => String(route.query.tag || '').trim().slice(0, 50))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const tagInput = ref(selectedTag.value)

watch(selectedTag, (v) => { tagInput.value = v })

const { data, error } = await useFetch<{
  stage: StageView
  resources: PageResult<ResourceView> | null
  posts: PageResult<PostSummary> | null
}>(() => `/api/stages/${encodeURIComponent(stageKey.value)}`, {
  query: computed(() => ({
    type: selectedType.value || undefined,
    tag: selectedTag.value || undefined,
    page: page.value,
  })),
})

if (error.value?.statusCode === 404) {
  throw createError({ statusCode: 404, statusMessage: 'Stage Not Found' })
}

const stage = computed(() => data.value?.stage)
const posts = computed(() => data.value?.posts)
const resources = computed(() => data.value?.resources)
const baseRoute = computed(() => `/stages/${encodeURIComponent(stageKey.value)}`)

function onFilterTag() {
  const query: Record<string, string> = {}
  if (selectedType.value) query.type = selectedType.value
  if (tagInput.value.trim()) query.tag = tagInput.value.trim().slice(0, 50)
  router.push({ path: baseRoute.value, query })
}

useHead(() => ({
  title: stage.value ? `${stage.value.label} - ${config.public.siteTitle}` : config.public.siteTitle,
}))
</script>

<template>
  <div v-if="stage">
    <h1>{{ stage.label }}</h1>
    <StageToolsSection :stage-key="stage.key" />
    <p class="notice-bar">以下为手动核对后收录的公开资料。按编辑推荐阅读顺序排列，不构成个体医学建议。</p>

    <section v-if="posts?.items.length" class="stage-guides">
      <h2>这一阶段的原创导读</h2>
      <div class="card-list">
        <GuideCard v-for="guide in posts.items" :key="guide.name" :guide="guide" heading="h3" />
      </div>
      <NuxtLink
        v-if="posts.total > posts.items.length"
        :to="{ path: '/posts', query: { stage: stage.key } }"
      >
        查看本阶段全部导读
      </NuxtLink>
    </section>

    <UnavailableNotice v-if="!resources" />
    <template v-else>
      <h2>这一阶段的资料卡</h2>
      <TypeFilterBar
        :base-route="baseRoute"
        :selected-type="selectedType"
        :extra-query="{ tag: selectedTag || undefined }"
      />
      <form class="search-form" @submit.prevent="onFilterTag">
        <input
          v-model="tagInput"
          class="search-input"
          name="tag"
          maxlength="50"
          placeholder="主题标签"
          aria-label="主题标签"
        />
        <button type="submit" class="btn">筛选</button>
      </form>
      <div v-if="resources.items.length" class="card-list">
        <ResourceCard v-for="item in resources.items" :key="item.name" :resource="item" />
      </div>
      <div v-else class="warn-bar">该筛选条件下暂无已公开资料。</div>
      <PaginationBar
        :base-route="baseRoute"
        :page="resources.page"
        :size="resources.size"
        :total="resources.total"
        :extra-query="{ type: selectedType || undefined, tag: selectedTag || undefined }"
      />
    </template>
  </div>
</template>
