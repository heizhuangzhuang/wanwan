<script setup lang="ts">
import { FIXED_STAGES, type StageView } from '~/shared/types'

const config = useRuntimeConfig()
const { data } = await useFetch<StageView[]>('/api/stages')
const stages = computed(() => data.value?.length ? data.value : FIXED_STAGES)

useHead({ title: `按阶段浏览 - ${config.public.siteTitle}` })
</script>

<template>
  <div>
    <h1>按阶段浏览</h1>
    <p class="notice-bar">阶段只是阅读资料的组织方式，不代表对任何家庭规定检查或治疗路线。</p>
    <StageGrid :stages="stages" />
  </div>
</template>
