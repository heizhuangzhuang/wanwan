<script setup lang="ts">
import { getStageGuide } from '~/shared/guides'

const props = defineProps<{ stageKey: string }>()
const config = useRuntimeConfig()
const { status, copy } = useCopyAction()

const guide = computed(() => getStageGuide(props.stageKey))
const showPrenatalBanner = computed(() => props.stageKey === 'JUST_FOUND' || props.stageKey === 'PRENATAL')

function copyQuestions() {
  if (!guide.value) return
  const text = `${guide.value.label} · 问医生清单：\n${guide.value.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
  copy(text, '已复制本阶段沟通问题，可直接粘贴到备忘录或微信。')
}

function isDownload(href: string) {
  return href.startsWith('/downloads/')
}
</script>

<template>
  <div v-if="guide">
    <NuxtLink v-if="showPrenatalBanner" class="prenatal-banner" to="/prenatal">
      <div class="prenatal-banner-body">
        <span class="prenatal-pill">孕期必查</span>
        <strong>产前检查专项</strong>
        <span>结构超声、无创 DNA、羊水穿刺、CMA 与全外显子测序一页查清</span>
      </div>
      <span class="arrow" aria-hidden="true" />
    </NuxtLink>

    <section class="card stage-focus-card" aria-labelledby="stage-focus-heading">
      <div class="stage-focus-head">
        <span class="badge">阶段重点</span>
        <h2 id="stage-focus-heading">{{ guide.label }} · 现在最先做什么</h2>
      </div>
      <p class="stage-focus-goal">{{ guide.focus.goal }}</p>
      <div class="stage-focus-tags">
        <span v-for="tag in guide.focus.tags" :key="tag" class="stage-focus-tag">{{ tag }}</span>
      </div>
      <ol class="stage-focus-list">
        <li v-for="(item, idx) in guide.focus.items" :key="item.title">
          <span class="stage-focus-num">{{ idx + 1 }}</span>
          <div>
            <strong>{{ item.title }}</strong>
            <p>{{ item.detail }}</p>
          </div>
        </li>
      </ol>
      <p class="stage-focus-reminder">{{ guide.focus.reminder }}</p>
      <p class="meta-row" style="margin-top: 8px">
        参考出处：
        <a :href="guide.source.url" target="_blank" rel="noopener noreferrer">{{ guide.source.title }}</a>
      </p>
    </section>

    <section class="stage-tools-section" aria-labelledby="stage-tools-heading">
      <h2 id="stage-tools-heading">这一阶段常用工具</h2>
      <div class="stage-tools-grid">
        <template v-for="tile in guide.tools" :key="tile.title">
          <a
            v-if="isDownload(tile.href)"
            class="stage-tool-tile"
            :class="`stage-tool-tile--${tile.tone}`"
            :href="`${config.public.siteBasePath}${tile.href}`"
          >
            <strong>{{ tile.title }}</strong>
            <span>{{ tile.sub }}</span>
          </a>
          <NuxtLink
            v-else
            class="stage-tool-tile"
            :class="`stage-tool-tile--${tile.tone}`"
            :to="tile.href"
          >
            <strong>{{ tile.title }}</strong>
            <span>{{ tile.sub }}</span>
          </NuxtLink>
        </template>
      </div>
    </section>

    <section class="card stage-questions-card" aria-labelledby="stage-questions-heading">
      <h2 id="stage-questions-heading">就诊前可以先问医生</h2>
      <ol class="stage-question-list">
        <li v-for="q in guide.questions" :key="q">{{ q }}</li>
      </ol>
      <div class="action-bar">
        <button class="btn" type="button" @click="copyQuestions">复制本阶段问题</button>
        <NuxtLink class="btn btn-outline" :to="`/tools/preparation?stage=${encodeURIComponent(guide.key)}`">
          打开完整勾选清单
        </NuxtLink>
      </div>
      <p v-if="status" class="action-status" role="status" aria-live="polite">{{ status }}</p>
    </section>
  </div>
</template>
