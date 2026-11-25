<script setup lang="ts">
import { GENERIC_QUESTIONS, getStageGuide, listStageGuides } from '~/shared/guides'

const route = useRoute()
const config = useRuntimeConfig()
const { status, copy } = useCopyAction()

const stages = listStageGuides()
const selectedStageKey = computed(() => String(route.query.stage || '').trim().toUpperCase())
const activeGuide = computed(() => (selectedStageKey.value ? getStageGuide(selectedStageKey.value) : null))

const allQuestions = computed(() => {
  const stageQs = activeGuide.value ? activeGuide.value.questions : []
  return [...stageQs, ...GENERIC_QUESTIONS]
})

const checked = ref<string[]>([])
const customNote = ref('')

watch(allQuestions, (qs) => {
  checked.value = qs.slice(0, Math.min(3, qs.length))
}, { immediate: true })

function toggleQuestion(q: string) {
  const idx = checked.value.indexOf(q)
  if (idx >= 0) checked.value.splice(idx, 1)
  else checked.value.push(q)
}

function copySelected() {
  const list = [...checked.value]
  if (customNote.value.trim()) list.push(customNote.value.trim())
  if (!list.length) {
    status.value = '请先勾选至少一条想问医生的问题。'
    return
  }
  const heading = activeGuide.value ? `${activeGuide.value.label} · 就诊沟通清单` : '就诊沟通清单'
  const text = `${heading}：\n${list.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
  copy(text, `已复制 ${list.length} 条就诊问题，可直接粘贴到备忘录或微信。`)
}

useHead({ title: `就诊沟通清单 - ${config.public.siteTitle}` })
</script>

<template>
  <div>
    <p><NuxtLink to="/tools">← 返回家庭工具</NuxtLink></p>
    <section class="tool-lead">
      <h1>就诊沟通清单</h1>
      <p>按当前阶段勾选最想问医生的问题，一键复制带去门诊，避免紧张时漏问。</p>
    </section>

    <nav class="filter-bar" aria-label="选择阶段问题">
      <NuxtLink
        to="/tools/preparation"
        :class="{ active: !activeGuide }"
      >
        通用问题
      </NuxtLink>
      <NuxtLink
        v-for="s in stages"
        :key="s.key"
        :to="{ path: '/tools/preparation', query: { stage: s.key } }"
        :class="{ active: activeGuide?.key === s.key }"
      >
        {{ s.shortLabel }}
      </NuxtLink>
    </nav>

    <section class="card">
      <h2 class="card-title">{{ activeGuide ? `${activeGuide.label} · 建议沟通问题` : '通用就诊沟通问题' }}</h2>
      <p v-if="activeGuide" class="card-intro">{{ activeGuide.summary }}</p>

      <ul class="prep-checklist" style="list-style: none; padding: 0; margin: 14px 0">
        <li v-for="q in allQuestions" :key="q" style="margin-bottom: 10px">
          <label style="display: flex; gap: 10px; align-items: flex-start; cursor: pointer">
            <input
              type="checkbox"
              :checked="checked.includes(q)"
              style="margin-top: 4px"
              @change="toggleQuestion(q)"
            />
            <span>{{ q }}</span>
          </label>
        </li>
      </ul>

      <label for="custom-q" style="display: block; margin-top: 12px; font-weight: 600">补充自己的问题（可选）</label>
      <input
        id="custom-q"
        v-model="customNote"
        class="search-input"
        maxlength="120"
        style="width: 100%; box-sizing: border-box; margin-top: 6px"
        placeholder="例如：宝宝脚跟发红需要调松鞋带吗？"
      />

      <div class="action-bar" style="margin-top: 16px">
        <button class="btn" type="button" @click="copySelected">
          复制已选问题（{{ checked.length + (customNote.trim() ? 1 : 0) }} 条）
        </button>
        <a
          class="btn btn-outline"
          :href="`${config.public.siteBasePath}/downloads/clubfoot-ultrasound-checklist.pdf`"
        >
          下载超声复查清单 PDF
        </a>
      </div>
      <p v-if="status" class="action-status" role="status" aria-live="polite">{{ status }}</p>
    </section>
  </div>
</template>
