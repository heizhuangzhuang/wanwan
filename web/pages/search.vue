<script setup lang="ts">
import {
  FIXED_STAGES,
  MATERIAL_TYPES,
  type PrenatalGuide,
  type SearchResult,
  type StageView,
} from '~/shared/types'

const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()

const keywordParam = computed(() => String(route.query.keyword || '').trim())
const stageParam = computed(() => String(route.query.stage || '').trim().toUpperCase())
const typeParam = computed(() => String(route.query.type || '').trim().toUpperCase())
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const submittedEmpty = computed(() =>
  !keywordParam.value && ('keyword' in route.query || Boolean(stageParam.value) || Boolean(typeParam.value)),
)

const keywordInput = ref(keywordParam.value)
const stageInput = ref(stageParam.value)
const typeInput = ref(typeParam.value)

watch([keywordParam, stageParam, typeParam], ([k, s, t]) => {
  keywordInput.value = k
  stageInput.value = s
  typeInput.value = t
})

const { data } = await useFetch<{
  keyword: string
  tooLong: boolean
  unavailable: boolean
  stages: StageView[]
  prenatalMatches: PrenatalGuide[]
  results: SearchResult | null
}>('/api/search', {
  query: computed(() => ({
    keyword: keywordParam.value || undefined,
    stage: stageParam.value || undefined,
    type: typeParam.value || undefined,
    page: page.value,
  })),
})

const stages = computed(() => data.value?.stages?.length ? data.value.stages : FIXED_STAGES)
const guideItems = computed(() => data.value?.results?.guideItems ?? [])
const prenatalMatches = computed(() => data.value?.prenatalMatches ?? [])
const hasAnyResults = computed(() => Boolean(
  data.value?.results?.items.length || guideItems.value.length || prenatalMatches.value.length,
))

function onSubmit() {
  const query: Record<string, string> = { keyword: keywordInput.value.trim() }
  if (stageInput.value) query.stage = stageInput.value
  if (typeInput.value) query.type = typeInput.value
  router.push({ path: '/search', query })
}

useHead({
  title: `站内搜索 - ${config.public.siteTitle}`,
  meta: [{ name: 'robots', content: 'noindex, follow' }],
})
</script>

<template>
  <div>
    <h1>站内搜索</h1>
    <p class="meta-row">搜索公开资料卡的题录、来源和标签，也可搜索本站原创导读的标题和摘要。</p>

    <form class="card search-panel" role="search" @submit.prevent="onSubmit">
      <label for="keyword">关键词</label>
      <input
        id="keyword"
        v-model="keywordInput"
        class="search-input"
        type="search"
        name="keyword"
        maxlength="100"
        placeholder="例如：超声复查、石膏、支具"
      />
      <div class="search-options">
        <label>
          阶段
          <select v-model="stageInput" class="search-input" name="stage">
            <option value="">全部阶段</option>
            <option v-for="s in stages" :key="s.key" :value="s.key">{{ s.label }}</option>
          </select>
        </label>
        <label>
          资料类型
          <select v-model="typeInput" class="search-input" name="type">
            <option v-for="t in MATERIAL_TYPES" :key="t.key || 'all'" :value="t.key">{{ t.label }}</option>
          </select>
        </label>
        <button class="btn" type="submit">搜索</button>
      </div>
    </form>

    <div v-if="data?.tooLong" class="warn-bar">关键词超过 100 个字符限制，请缩短后重试。</div>
    <div v-else-if="submittedEmpty" class="notice-bar">
      请输入关键词后再搜索，或直接前往<NuxtLink to="/resources">资料库</NuxtLink>按类型和阶段浏览。
    </div>
    <template v-else-if="data?.unavailable">
      <UnavailableNotice />
      <template v-if="prenatalMatches.length">
        <h2>产前检查专项</h2>
        <p class="meta-row">共 {{ prenatalMatches.length }} 项（本地离线可用）</p>
        <div class="card-list">
          <article v-for="item in prenatalMatches" :key="item.key" class="card">
            <h3 class="card-title">
              <NuxtLink :to="`/prenatal/${encodeURIComponent(item.key)}`">{{ item.title }}</NuxtLink>
            </h3>
            <p class="card-intro">{{ item.summary }}</p>
          </article>
        </div>
      </template>
    </template>
    <template v-else-if="data?.results">
      <template v-if="data.results.items.length">
        <h2>公开资料卡</h2>
        <p class="meta-row">共 {{ data.results.total }} 条</p>
        <div class="card-list">
          <ResourceCard v-for="item in data.results.items" :key="item.name" :resource="item" />
        </div>
      </template>

      <template v-if="guideItems.length">
        <h2>本站原创导读</h2>
        <p class="meta-row">共 {{ data.results.guideTotal ?? guideItems.length }} 篇</p>
        <div class="card-list">
          <GuideCard v-for="guide in guideItems" :key="guide.name" :guide="guide" heading="h3" />
        </div>
      </template>

      <template v-if="prenatalMatches.length">
        <h2>产前检查专项</h2>
        <p class="meta-row">共 {{ prenatalMatches.length }} 项（本地离线可用）</p>
        <div class="card-list">
          <article v-for="item in prenatalMatches" :key="item.key" class="card">
            <h3 class="card-title">
              <NuxtLink :to="`/prenatal/${encodeURIComponent(item.key)}`">{{ item.title }}</NuxtLink>
            </h3>
            <p class="card-intro">{{ item.summary }}</p>
          </article>
        </div>
      </template>

      <div v-if="!hasAnyResults" class="warn-bar">
        本页没有匹配「{{ keywordParam }}」的已公开内容。可以更换关键词，或<NuxtLink to="/stages">按阶段浏览</NuxtLink>。
      </div>

      <PaginationBar
        base-route="/search"
        :page="data.results.page"
        :size="data.results.size"
        :total="Math.max(data.results.total, data.results.guideTotal ?? 0)"
        :extra-query="{
          keyword: keywordParam || undefined,
          stage: stageParam || undefined,
          type: typeParam || undefined,
        }"
      />
    </template>
  </div>
</template>
