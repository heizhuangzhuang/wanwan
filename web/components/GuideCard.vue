<script setup lang="ts">
import {
  cleanExcerpt,
  formatCitationSummary,
  isLiteratureArticle,
  type PostSummary,
} from '~/shared/types'

const props = withDefaults(defineProps<{
  guide: PostSummary
  heading?: 'h2' | 'h3'
}>(), {
  heading: 'h2',
})

const lit = computed(() => isLiteratureArticle(props.guide))
const excerpt = computed(() => cleanExcerpt(props.guide.title, props.guide.excerpt))
const citationLine = computed(() => (lit.value ? formatCitationSummary(props.guide.citation) : ''))
const to = computed(() => `/posts/${encodeURIComponent(props.guide.name)}`)
</script>

<template>
  <article class="card" :class="{ 'card-literature': lit }">
    <div v-if="lit" class="meta-row" style="margin-bottom: 6px">
      <span class="badge badge-literature">文献译读</span>
      <span v-if="guide.citation?.evidenceType" class="badge badge-literature-sub">
        {{ guide.citation.evidenceType }}
      </span>
    </div>

    <component :is="heading" class="card-title">
      <NuxtLink :to="to">{{ guide.title }}</NuxtLink>
    </component>

    <div v-if="guide.coverUrl" class="guide-body-row">
      <div class="guide-body-copy">
        <p v-if="excerpt" class="card-intro guide-excerpt">{{ excerpt }}</p>
        <div v-if="citationLine" class="lit-meta-line">{{ citationLine }}</div>
      </div>
      <NuxtLink class="guide-thumb-wrap" :to="to" aria-hidden="true" tabindex="-1">
        <img class="guide-thumb" :src="guide.coverUrl" alt="" loading="lazy" decoding="async" />
      </NuxtLink>
    </div>

    <template v-else>
      <p v-if="excerpt" class="card-intro">{{ excerpt }}</p>
      <div v-if="citationLine" class="lit-meta-line">{{ citationLine }}</div>
    </template>

    <div v-if="guide.author" class="meta-row" style="margin-top: 8px">
      {{ guide.author }}
    </div>
  </article>
</template>
