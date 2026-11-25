<script setup lang="ts">
import { accessLabel, materialLabel, type ResourceView } from '~/shared/types'

defineProps<{ resource: ResourceView }>()
</script>

<template>
  <article class="card">
    <div class="meta-row card-badges">
      <span class="badge">{{ materialLabel(resource.materialType) }}</span>
      <span class="badge">{{ accessLabel(resource.access) }}</span>
      <span v-if="resource.language === 'OTHER'" class="badge">外文资料</span>
    </div>
    <h3 class="card-title">
      <NuxtLink :to="`/resources/${encodeURIComponent(resource.name)}`">{{ resource.title }}</NuxtLink>
    </h3>
    <p v-if="resource.originalTitle && resource.originalTitle !== resource.title" class="card-orig-title">
      原标题：{{ resource.originalTitle }}
    </p>
    <p class="card-intro">{{ resource.intro }}</p>
    <div class="meta-row">
      <span>来源：<strong>{{ resource.sourceName }}</strong></span>
      <span v-if="resource.author">作者/机构：{{ resource.author }}</span>
      <span>原文日期：{{ resource.publishedDate || '未注明' }}</span>
      <span v-if="resource.lastVerifiedDate">核对日期：{{ resource.lastVerifiedDate }}</span>
    </div>
  </article>
</template>
