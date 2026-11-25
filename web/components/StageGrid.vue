<script setup lang="ts">
import { STAGE_CAPTIONS, type StageView } from '~/shared/types'

defineProps<{ stages: StageView[] }>()
</script>

<template>
  <ol class="stage-grid">
    <li v-for="s in stages" :key="s.key">
      <NuxtLink class="stage-card" :to="`/stages/${encodeURIComponent(s.key)}`">
        <span class="stage-order" aria-hidden="true">{{ String(s.order + 1).padStart(2, '0') }}</span>
        <strong class="stage-name">{{ s.label }}</strong>
        <span v-if="STAGE_CAPTIONS[s.key]" class="stage-caption">{{ STAGE_CAPTIONS[s.key] }}</span>
        <span class="arrow" aria-hidden="true" />
      </NuxtLink>
    </li>
  </ol>
</template>
