<script setup lang="ts">
import { MATERIAL_TYPES } from '~/shared/types'

const props = defineProps<{
  baseRoute: string
  selectedType: string
  extraQuery?: Record<string, string | undefined>
}>()

function linkTo(key: string) {
  const query: Record<string, string> = {}
  if (props.extraQuery) {
    for (const [k, v] of Object.entries(props.extraQuery)) {
      if (v) query[k] = v
    }
  }
  if (key) query.type = key
  return { path: props.baseRoute, query }
}
</script>

<template>
  <div class="filter-bar">
    <NuxtLink
      v-for="t in MATERIAL_TYPES"
      :key="t.key || 'all'"
      :to="linkTo(t.key)"
      :class="{ active: selectedType === t.key }"
      :aria-current="selectedType === t.key ? 'true' : undefined"
    >
      {{ t.label }}
    </NuxtLink>
  </div>
</template>
