<script setup lang="ts">
import { listStageGuides } from '~/shared/guides'

const props = defineProps<{
  baseRoute: string
  selectedStage: string
  extraQuery?: Record<string, string | undefined>
}>()

const items = [
  { key: '', label: '全部阶段' },
  ...listStageGuides().map(s => ({ key: s.key, label: s.shortLabel })),
]

function linkTo(key: string) {
  const query: Record<string, string> = {}
  if (props.extraQuery) {
    for (const [k, v] of Object.entries(props.extraQuery)) {
      if (v) query[k] = v
    }
  }
  if (key) query.stage = key
  return { path: props.baseRoute, query }
}
</script>

<template>
  <nav class="filter-bar stage-filter-bar" aria-label="按阶段筛选">
    <NuxtLink
      v-for="item in items"
      :key="item.key || 'all'"
      :to="linkTo(item.key)"
      :class="{ active: selectedStage === item.key }"
      :aria-current="selectedStage === item.key ? 'true' : undefined"
    >
      {{ item.label }}
    </NuxtLink>
  </nav>
</template>
