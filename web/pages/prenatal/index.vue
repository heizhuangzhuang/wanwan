<script setup lang="ts">
import {
  PRENATAL_GROUPS,
  listPrenatalGuides,
  searchPrenatalGuides,
} from '~/shared/prenatal'
import type { PrenatalGuide } from '~/shared/types'

const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()

const queryParam = computed(() => String(route.query.q || '').trim().slice(0, 80))
const qInput = ref(queryParam.value)
watch(queryParam, (v) => { qInput.value = v })

const allGuides = listPrenatalGuides()
const matched = computed(() => (queryParam.value ? searchPrenatalGuides(queryParam.value) : allGuides))
const grouped = computed(() => PRENATAL_GROUPS.map(group => ({
  title: group.title,
  items: group.keys
    .map(k => allGuides.find(g => g.key === k))
    .filter((g): g is PrenatalGuide => Boolean(g)),
})))

function onFilter() {
  const q = qInput.value.trim().slice(0, 80)
  router.push({ path: '/prenatal', query: q ? { q } : {} })
}

useHead({ title: `产前检查专项 - ${config.public.siteTitle}` })
</script>

<template>
  <div>
    <section class="tool-lead">
      <h1>产前检查专项</h1>
      <p>按检查类型查找介绍、就诊问题和可核对的出处。</p>
    </section>

    <form class="search-form" role="search" @submit.prevent="onFilter">
      <label class="visually-hidden" for="prenatal-q">搜索检查词</label>
      <input
        id="prenatal-q"
        v-model="qInput"
        class="search-input"
        type="search"
        name="q"
        maxlength="80"
        placeholder="搜索检查词，例如：羊穿、CMA、全外显、无创"
      />
      <button class="btn" type="submit">筛选检查</button>
      <NuxtLink v-if="queryParam" class="btn btn-outline" to="/prenatal">清除</NuxtLink>
    </form>

    <div class="action-bar" style="margin-bottom: 14px">
      <NuxtLink class="btn btn-outline" to="/tools/preparation?stage=PRENATAL">产前就诊沟通清单</NuxtLink>
      <NuxtLink class="btn btn-outline" to="/channels?type=doctor&period=prenatal">找产前诊断与胎儿门诊</NuxtLink>
      <a class="btn btn-outline" :href="`${config.public.siteBasePath}/downloads/clubfoot-ultrasound-checklist.pdf`">
        下载超声复查清单 PDF
      </a>
    </div>

    <template v-if="queryParam">
      <template v-if="matched.length">
        <p class="meta-row">找到 {{ matched.length }} 项匹配「{{ queryParam }}」的检查说明</p>
        <div class="card-list">
          <article v-for="item in matched" :key="item.key" class="card">
            <h2 class="card-title">
              <NuxtLink :to="`/prenatal/${encodeURIComponent(item.key)}`">{{ item.title }}</NuxtLink>
            </h2>
            <p class="card-intro">{{ item.summary }}</p>
          </article>
        </div>
      </template>
      <div v-else class="warn-bar">
        没有匹配「{{ queryParam }}」的检查项目。试试搜索「羊穿」「CMA」「全外显」「无创」或<NuxtLink to="/prenatal">查看全部项目</NuxtLink>。
      </div>
    </template>

    <template v-else>
      <section v-for="group in grouped" :key="group.title" class="prenatal-group">
        <h2>{{ group.title }}</h2>
        <div class="card-list">
          <article v-for="item in group.items" :key="item.key" class="card">
            <h3 class="card-title">
              <NuxtLink :to="`/prenatal/${encodeURIComponent(item.key)}`">{{ item.title }}</NuxtLink>
            </h3>
            <p class="card-intro">{{ item.summary }}</p>
          </article>
        </div>
      </section>
    </template>

    <p class="notice-bar">
      内容供就诊沟通时查阅。具体检查和报告解读以产前诊断或遗传咨询门诊说明为准。
    </p>
  </div>
</template>
