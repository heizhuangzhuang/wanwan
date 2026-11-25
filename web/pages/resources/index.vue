<script setup lang="ts">
import type { PageResult, ResourceView } from '~/shared/types'

const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()

const stageFilter = computed(() => String(route.query.stage || '').trim().toUpperCase())
const selectedType = computed(() => String(route.query.type || '').trim().toUpperCase())
const selectedTag = computed(() => String(route.query.tag || '').trim().slice(0, 50))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const tagInput = ref(selectedTag.value)

watch(selectedTag, (v) => { tagInput.value = v })

const { data } = await useFetch<{
  list: PageResult<ResourceView> | null
  unavailable: boolean
}>('/api/resources', {
  query: computed(() => ({
    stage: stageFilter.value || undefined,
    type: selectedType.value || undefined,
    tag: selectedTag.value || undefined,
    page: page.value,
  })),
})

function onFilterTag() {
  const query: Record<string, string> = {}
  if (stageFilter.value) query.stage = stageFilter.value
  if (selectedType.value) query.type = selectedType.value
  if (tagInput.value.trim()) query.tag = tagInput.value.trim().slice(0, 50)
  router.push({ path: '/resources', query })
}

useHead({ title: `资料库 - ${config.public.siteTitle}` })
</script>

<template>
  <div>
    <h1>公开资料库</h1>
    <StageFilterBar
      base-route="/resources"
      :selected-stage="stageFilter"
      :extra-query="{ type: selectedType || undefined, tag: selectedTag || undefined }"
    />
    <TypeFilterBar
      base-route="/resources"
      :selected-type="selectedType"
      :extra-query="{ stage: stageFilter || undefined, tag: selectedTag || undefined }"
    />
    <form class="search-form" @submit.prevent="onFilterTag">
      <input
        v-model="tagInput"
        class="search-input"
        name="tag"
        maxlength="50"
        placeholder="按主题标签筛选"
        aria-label="按主题标签筛选"
      />
      <button type="submit" class="btn">筛选</button>
    </form>

    <UnavailableNotice v-if="data?.unavailable || !data?.list" />
    <template v-else>
      <div v-if="data.list.items.length" class="card-list">
        <ResourceCard v-for="item in data.list.items" :key="item.name" :resource="item" />
      </div>
      <div v-else class="warn-bar">该筛选条件下暂无已公开资料。</div>
      <PaginationBar
        base-route="/resources"
        :page="data.list.page"
        :size="data.list.size"
        :total="data.list.total"
        :extra-query="{
          stage: stageFilter || undefined,
          type: selectedType || undefined,
          tag: selectedTag || undefined,
        }"
      />
    </template>
  </div>
</template>
