<script setup lang="ts">
import { FIXED_STAGES, type PostSummary, type ResourceView, type StageView, type TopicSummary } from '~/shared/types'

const config = useRuntimeConfig()
const router = useRouter()
const keyword = ref('')

const { data } = await useFetch<{
  stages: StageView[]
  topics: TopicSummary[]
  recent: ResourceView[]
  posts: PostSummary[]
  resourcesUnavailable: boolean
  unconfigured: boolean
}>('/api/home')

const stages = computed(() => data.value?.stages?.length ? data.value.stages : FIXED_STAGES)
const topics = computed(() => data.value?.topics ?? [])
const recent = computed(() => data.value?.recent ?? [])
const posts = computed(() => data.value?.posts ?? [])

const tools = [
  { href: '/tools/brace-followup', title: '矫正鞋穿戴记录', caption: '计时、补记、困难观察与复诊摘要。', color: 'green' },
  { href: '/tools/preparation', title: '就诊沟通清单', caption: '按阶段勾选想问医生的问题并一键复制。', color: 'yellow' },
  { href: '/prenatal', title: '产前检查专项', caption: '超声、无创、羊穿、CMA 与全外显。', color: 'linen' },
  { href: '/channels', title: '找医生与家长经验', caption: '查医院官方渠道、产前与小儿骨科搜索词。', color: 'green' },
]

function onSearch() {
  const q = keyword.value.trim()
  if (!q) return
  router.push({ path: '/search', query: { keyword: q } })
}

useHead({ title: config.public.siteTitle })
</script>

<template>
  <div>
    <section class="home-hero" aria-labelledby="home-title">
      <div class="home-hero-copy">
        <h1 id="home-title">足内翻家庭指南</h1>
        <p>从第一次看到报告，到治疗和随访。按当前阶段查资料，记录每一步。</p>
        <form class="search-form home-search" role="search" @submit.prevent="onSearch">
          <label class="visually-hidden" for="home-keyword">搜索资料</label>
          <span class="search-symbol" aria-hidden="true" />
          <input
            id="home-keyword"
            v-model="keyword"
            class="search-input"
            type="search"
            name="keyword"
            maxlength="100"
            placeholder="超声、石膏、支具"
            required
          />
          <button class="btn" type="submit">搜索资料</button>
        </form>
        <div class="quick-search" aria-label="快捷搜索">
          <NuxtLink
            v-for="term in ['超声复查', '石膏', '支具']"
            :key="term"
            :to="{ path: '/search', query: { keyword: term } }"
          >
            {{ term }}
          </NuxtLink>
          <NuxtLink class="home-tool-link" to="/tools/brace-followup">
            记穿戴 <span class="arrow" aria-hidden="true" />
          </NuxtLink>
        </div>
      </div>
      <div class="home-hero-media">
        <img
          :src="`${config.public.siteBasePath}/assets/first-steps.webp`"
          alt=""
          width="960"
          height="640"
          fetchpriority="high"
        />
      </div>
    </section>

    <section class="home-section" aria-labelledby="home-stages">
      <header class="section-heading">
        <h2 id="home-stages">你现在在哪个阶段？</h2>
        <NuxtLink class="text-link" to="/stages">
          全部阶段 <span class="arrow" aria-hidden="true" />
        </NuxtLink>
      </header>
      <StageGrid :stages="stages" />
    </section>

    <section class="home-section" aria-labelledby="home-tools">
      <header class="section-heading">
        <h2 id="home-tools">家庭工具</h2>
        <NuxtLink class="text-link" to="/tools">
          全部工具 <span class="arrow" aria-hidden="true" />
        </NuxtLink>
      </header>
      <div class="quick-tools">
        <NuxtLink
          v-for="tool in tools"
          :key="tool.href"
          class="quick-tool"
          :class="`quick-tool--${tool.color}`"
          :to="tool.href"
        >
          <strong>{{ tool.title }}</strong>
          <span>{{ tool.caption }}</span>
          <span class="arrow" aria-hidden="true" />
        </NuxtLink>
      </div>
    </section>

    <section class="home-section" aria-labelledby="home-resources">
      <header class="section-heading">
        <h2 id="home-resources">近期整理资料</h2>
        <NuxtLink class="text-link" to="/resources">
          查看资料库 <span class="arrow" aria-hidden="true" />
        </NuxtLink>
      </header>
      <p v-if="data?.unconfigured" class="notice-bar">资料库正在准备中。</p>
      <UnavailableNotice v-else-if="data?.resourcesUnavailable" />
      <div v-else-if="recent.length" class="card-list home-grid">
        <ResourceCard v-for="item in recent" :key="item.name" :resource="item" />
      </div>
      <p v-else class="notice-bar">暂未发布资料。</p>
    </section>

    <section v-if="topics.length" class="home-section">
      <header class="section-heading">
        <h2>精选专题</h2>
        <NuxtLink class="text-link" to="/topics">全部专题</NuxtLink>
      </header>
      <div class="card-list home-grid">
        <article v-for="t in topics" :key="t.name" class="card">
          <h3 class="card-title">
            <NuxtLink :to="`/topics/${encodeURIComponent(t.name)}`">{{ t.title }}</NuxtLink>
          </h3>
          <p class="card-intro">{{ t.intro }}</p>
          <div class="meta-row">含 {{ t.resourceCount }} 条资料</div>
        </article>
      </div>
    </section>

    <section v-if="posts.length" class="home-section">
      <header class="section-heading">
        <h2>本站原创导读</h2>
        <NuxtLink class="text-link" to="/posts">全部导读</NuxtLink>
      </header>
      <div class="card-list home-grid">
        <GuideCard v-for="p in posts" :key="p.name" :guide="p" heading="h3" />
      </div>
    </section>
  </div>
</template>
