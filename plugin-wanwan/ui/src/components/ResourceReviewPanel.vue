<script setup lang="ts">
import { computed } from 'vue'
import { VButton } from '@halo-dev/components'
import { previewEntry, similarSources } from '@/api/resource-review'
import {
  ACCESS_OPTIONS,
  LINK_STATUS_OPTIONS,
  MATERIAL_TYPE_OPTIONS,
  type ResourceCard,
  type ResourceCardSpec,
} from '@/types/wanwan'

const props = defineProps<{
  form: ResourceCardSpec
  cards: ResourceCard[]
  editingName?: string
  loading: boolean
  listFailed: boolean
}>()
const confirmed = defineModel<boolean>('confirmed', { required: true })
const emit = defineEmits<{ refresh: [] }>()

const duplicates = computed(() => similarSources(props.form, props.cards, props.editingName))
const entryPreview = computed(() => previewEntry(props.form))

function labelOf<T extends string>(options: { value: T; label: string }[], value: T): string {
  return options.find(option => option.value === value)?.label ?? value
}
</script>

<template>
  <div class="ww-review">
    <article class="ww-preview">
      <div class="ww-review-title">公开资料预览</div>
      <h3>{{ form.displayTitle?.trim() || form.originalTitle || '请填写原标题' }}</h3>
      <p v-if="form.displayTitle && form.displayTitle !== form.originalTitle">原标题：{{ form.originalTitle }}</p>
      <p>{{ form.intro || '请填写本站介绍' }}</p>
      <dl>
        <dt>来源</dt><dd>{{ form.sourceName || '待填写' }}{{ form.author ? ' / ' + form.author : '' }}</dd>
        <dt>材料与访问</dt><dd>{{ labelOf(MATERIAL_TYPE_OPTIONS, form.materialType) }} / {{ labelOf(ACCESS_OPTIONS, form.access) }}</dd>
        <dt>核对日期</dt><dd>{{ form.lastVerifiedDate || '待填写' }}</dd>
        <dt>来源状态</dt><dd>{{ labelOf(LINK_STATUS_OPTIONS, form.linkStatus) }}</dd>
        <dt>Web 操作</dt><dd>{{ entryPreview.web }}</dd>
        <dt>小程序操作</dt><dd>{{ entryPreview.mini }}</dd>
      <dt>公开附件</dt><dd>{{ form.downloadApproved && form.linkStatus === 'OK' ? form.downloadFileName : '关闭' }}</dd>
      </dl>
      <p v-if="form.doi || form.pmid" class="ww-citation">{{ [form.doi && 'DOI ' + form.doi, form.pmid && 'PMID ' + form.pmid].filter(Boolean).join(' / ') }}</p>
      <p v-if="form.url" class="ww-citation">{{ form.url }}</p>
    </article>
    <section class="ww-checks" aria-label="发布核对">
      <div class="ww-review-title">核对来源</div>
      <p v-if="loading" role="status">正在查找重复来源…</p>
      <div v-else-if="listFailed">
        <p>暂时无法完成查重。</p>
        <VButton size="sm" @click="emit('refresh')">重新查重</VButton>
      </div>
      <template v-else-if="duplicates.length">
        <p>以下资料可能使用了同一出处。请确认是否需要合并。</p>
        <ul class="ww-matches">
          <li v-for="match in duplicates" :key="match.card.metadata.name">
            <strong>{{ match.card.spec.displayTitle || match.card.spec.originalTitle }}</strong>
            <span>{{ match.fields.join('、') }} 相同</span>
          </li>
        </ul>
      </template>
      <p v-else>未发现相同的原始 URL、DOI 或 PMID。</p>
      <p v-if="!form.lastVerifiedDate">发布前需填写最后核对日期。</p>
      <label v-if="form.state === 'PUBLISHED'" class="ww-confirm">
        <input v-model="confirmed" type="checkbox" :disabled="loading || listFailed || !form.lastVerifiedDate" />
        <span>我已核对来源、公开字段和入口状态。</span>
      </label>
    </section>
  </div>
</template>

<style scoped>
.ww-review { display: grid; gap: 16px; color: #2b302a; font: 14px/1.6 "PingFang SC", sans-serif; }
.ww-preview, .ww-checks { min-width: 0; background: #fbf7f0; padding: 16px; border: 1px solid #e7ddd2; border-radius: 12px; overflow-wrap: anywhere; }
.ww-checks { background: #e8eee4; border-color: #d2decf; }
.ww-review-title { color: #376052; font-weight: 700; margin-bottom: 8px; }
.ww-preview h3 { font: 700 21px/1.4 "Songti SC", "Noto Serif CJK SC", serif; margin-bottom: 8px; }
.ww-preview p, .ww-checks p, .ww-preview dl { margin-bottom: 8px; }
.ww-preview dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; }
.ww-preview dt { font-weight: 600; }
.ww-citation, .ww-matches span { color: #595f54; font-size: 13px; }
.ww-matches li { padding: 8px 0; border-top: 1px solid #d2decf; }
.ww-matches span { display: block; }
.ww-confirm { display: flex; align-items: flex-start; gap: 8px; padding-top: 8px; }
.ww-confirm input { margin-top: 4px; accent-color: #376052; }
@media (min-width: 640px) {
  .ww-review { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
}
</style>
