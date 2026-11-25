<script setup lang="ts">
const props = defineProps<{
  baseRoute: string
  page: number
  size: number
  total: number
  extraQuery?: Record<string, string | undefined>
}>()

const hasNext = computed(() => props.page * props.size < props.total)
const show = computed(() => props.page > 1 || hasNext.value)

function pageLink(targetPage: number) {
  const query: Record<string, string> = {}
  if (props.extraQuery) {
    for (const [k, v] of Object.entries(props.extraQuery)) {
      if (v) query[k] = v
    }
  }
  query.page = String(targetPage)
  return { path: props.baseRoute, query }
}
</script>

<template>
  <nav v-if="show" aria-label="分页" class="pagination">
    <NuxtLink v-if="page > 1" :to="pageLink(page - 1)">上一页</NuxtLink>
    <span v-else />
    <span>第 {{ page }} 页</span>
    <NuxtLink v-if="hasNext" :to="pageLink(page + 1)">下一页</NuxtLink>
    <span v-else />
  </nav>
</template>
