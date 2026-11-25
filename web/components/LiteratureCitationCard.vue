<script setup lang="ts">
import { isLiteratureArticle, safeHttpUrl, type PreparedPostView } from '~/shared/types'

const props = defineProps<{ post: PreparedPostView }>()
const { status, copy } = useCopyAction()

const lit = computed(() => isLiteratureArticle(props.post))
const c = computed(() => props.post.citation)
const pubInfo = computed(() => [c.value?.journal, c.value?.publishedYear].filter(Boolean).join(' · '))
const safeOrigin = computed(() => safeHttpUrl(c.value?.sourceUrl))

const hasRows = computed(() => Boolean(
  c.value?.originalTitle || pubInfo.value || c.value?.evidenceType || c.value?.doi || c.value?.verifiedDate,
))

function copyCitation() {
  const lines = [
    props.post.title,
    c.value?.originalTitle ? `原文：${c.value.originalTitle}` : '',
    pubInfo.value ? `出处：${pubInfo.value}` : '',
    c.value?.doi ? `DOI：${c.value.doi}` : '',
    safeOrigin.value || '',
  ].filter(Boolean).join('\n')
  copy(lines, '已复制文献出处信息。')
}
</script>

<template>
  <section v-if="lit" class="lit-citation-card" aria-label="文献出处与证据说明">
    <div class="lit-citation-head">
      <span class="badge badge-literature">文献译读</span>
      <span v-if="c?.evidenceType" class="badge badge-literature-sub">{{ c.evidenceType }}</span>
      <strong>文献出处与证据说明</strong>
    </div>
    <dl v-if="hasRows" class="lit-citation-rows">
      <div v-if="c?.originalTitle">
        <dt>原文题目</dt>
        <dd>{{ c.originalTitle }}</dd>
      </div>
      <div v-if="pubInfo">
        <dt>期刊/年份</dt>
        <dd>{{ pubInfo }}</dd>
      </div>
      <div v-if="c?.evidenceType">
        <dt>文献类型</dt>
        <dd>{{ c.evidenceType }}</dd>
      </div>
      <div v-if="c?.doi">
        <dt>DOI / 编号</dt>
        <dd>{{ c.doi }}</dd>
      </div>
      <div v-if="c?.verifiedDate">
        <dt>核对日期</dt>
        <dd>{{ c.verifiedDate }}</dd>
      </div>
    </dl>
    <div v-if="safeOrigin || hasRows" class="lit-citation-actions">
      <a
        v-if="safeOrigin"
        class="btn"
        :href="safeOrigin"
        target="_blank"
        rel="noopener noreferrer"
      >
        查看论文原文 ↗
      </a>
      <button
        v-if="hasRows"
        class="btn btn-outline"
        type="button"
        @click="copyCitation"
      >
        复制文献出处
      </button>
    </div>
    <p v-if="status" class="action-status" role="status" aria-live="polite">{{ status }}</p>
    <p class="lit-citation-foot">
      本篇基于公开学术文献翻译整理，帮助你理解研究背景与常见术语，不替代主治医生的个体评估。
    </p>
  </section>
</template>
