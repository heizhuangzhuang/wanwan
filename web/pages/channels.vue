<script setup lang="ts">
import { channelsFor } from '~/shared/guides'

const route = useRoute()
const config = useRuntimeConfig()
const { status, copy } = useCopyAction()

const channelType = computed(() => {
  const raw = String(route.query.type || 'doctor').trim().toLowerCase()
  return raw === 'social' ? 'social' : 'doctor'
})
const channelPeriod = computed(() => {
  const raw = String(route.query.period || 'postnatal').trim().toLowerCase()
  return raw === 'prenatal' ? 'prenatal' : 'postnatal'
})
const items = computed(() => channelsFor(channelType.value, channelPeriod.value))

useHead({ title: `找医生与家长经验 - ${config.public.siteTitle}` })
</script>

<template>
  <div>
    <section class="tool-lead">
      <h1>找医生与家长经验</h1>
      <p>整理医院官方渠道、产前诊断、小儿骨科与机构科普搜索词，一键复制去核对。</p>
    </section>

    <div class="filter-bar" aria-label="渠道分类">
      <NuxtLink
        :to="{ path: '/channels', query: { type: 'doctor', period: channelPeriod } }"
        :class="{ active: channelType === 'doctor' }"
      >
        找医生与门诊
      </NuxtLink>
      <NuxtLink
        :to="{ path: '/channels', query: { type: 'social' } }"
        :class="{ active: channelType === 'social' }"
      >
        科普与家长经验
      </NuxtLink>
    </div>

    <div v-if="channelType === 'doctor'" class="filter-bar" aria-label="就诊阶段">
      <NuxtLink
        :to="{ path: '/channels', query: { type: 'doctor', period: 'prenatal' } }"
        :class="{ active: channelPeriod === 'prenatal' }"
      >
        孕期 / 产前诊断
      </NuxtLink>
      <NuxtLink
        :to="{ path: '/channels', query: { type: 'doctor', period: 'postnatal' } }"
        :class="{ active: channelPeriod === 'postnatal' }"
      >
        出生后 / 小儿骨科
      </NuxtLink>
    </div>

    <p v-if="status" class="action-status" role="status" aria-live="polite">{{ status }}</p>

    <div class="card-list">
      <article v-for="entry in items" :key="entry.key" class="card">
        <div class="meta-row" style="margin-bottom: 6px">
          <span class="badge">{{ entry.platform }}</span>
        </div>
        <h2 class="card-title">{{ entry.title }}</h2>
        <p class="card-intro">{{ entry.description }}</p>
        <p class="meta-row">搜索词：<code>{{ entry.keyword }}</code></p>
        <div class="action-bar" style="margin-top: 10px">
          <button
            class="btn btn-outline"
            type="button"
            @click="copy(entry.keyword, `已复制搜索词「${entry.keyword}」`)"
          >
            复制搜索词
          </button>
          <a
            v-if="entry.sourceUrl"
            class="btn btn-outline"
            :href="entry.sourceUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ entry.sourceLabel || '查看公开页面' }} ↗
          </a>
        </div>
      </article>
    </div>

    <p class="notice-bar">
      本站不做医生排行或商业推荐。请通过医院官方公众号、小程序或正规挂号平台核对出诊信息。
    </p>
  </div>
</template>
