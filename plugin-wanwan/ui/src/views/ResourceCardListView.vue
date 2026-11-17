<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  Dialog,
  Toast,
  VButton,
  VCard,
  VEmpty,
  VLoading,
  VModal,
  VPageHeader,
  VSpace,
  VTag,
} from '@halo-dev/components'
import RiBookReadLine from '~icons/ri/book-read-line'
import {
  createResourceCard,
  deleteResourceCard,
  listResourceCards,
  updateResourceCard,
} from '@/api/wanwan'
import {
  ACCESS_OPTIONS,
  ENTRY_TYPE_OPTIONS,
  LINK_STATUS_OPTIONS,
  MATERIAL_TYPE_OPTIONS,
  PUBLISH_STATE_OPTIONS,
  STAGE_OPTIONS,
  type PublishState,
  type ResourceCard,
  type ResourceCardSpec,
  type StageKey,
} from '@/types/wanwan'

const loading = ref(false)
const items = ref<ResourceCard[]>([])
const filterState = ref<PublishState | ''>('')
const filterStage = ref<StageKey | ''>('')
const keyword = ref('')

const modalVisible = ref(false)
const saving = ref(false)
const editing = ref<ResourceCard | null>(null)
const tagsInput = ref('')

function emptySpec(): ResourceCardSpec {
  return {
    originalTitle: '',
    displayTitle: '',
    intro: '',
    url: '',
    sourceName: '',
    author: '',
    publishedDate: '',
    lastVerifiedDate: new Date().toISOString().slice(0, 10),
    stages: ['JUST_FOUND'],
    materialType: 'INSTITUTION',
    tags: [],
    language: 'ZH',
    access: 'OPEN',
    doi: '',
    pmid: '',
    storyContext: '',
    entryType: 'WEB',
    miniProgramAppId: '',
    miniProgramPath: '',
    linkStatus: 'OK',
    state: 'DRAFT',
    priority: 1000,
  }
}

const form = reactive<ResourceCardSpec>(emptySpec())

const filteredItems = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return items.value
    .filter((c) => {
      if (filterState.value && c.spec.state !== filterState.value) return false
      if (filterStage.value && !c.spec.stages?.includes(filterStage.value)) return false
      if (kw) {
        const hay = `${c.spec.originalTitle} ${c.spec.displayTitle ?? ''} ${c.spec.sourceName}`
        if (!hay.toLowerCase().includes(kw)) return false
      }
      return true
    })
    .sort((a, b) => (a.spec.priority ?? 1000) - (b.spec.priority ?? 1000))
})

async function load() {
  loading.value = true
  try {
    const res = await listResourceCards(1, 200)
    items.value = res.items ?? []
  } catch {
    Toast.error('加载资料卡失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  Object.assign(form, emptySpec())
  tagsInput.value = ''
  modalVisible.value = true
}

function openEdit(card: ResourceCard) {
  editing.value = card
  Object.assign(form, emptySpec(), JSON.parse(JSON.stringify(card.spec)))
  tagsInput.value = (card.spec.tags ?? []).join(', ')
  modalVisible.value = true
}

function toggleStage(stage: StageKey) {
  const idx = form.stages.indexOf(stage)
  if (idx >= 0) {
    form.stages.splice(idx, 1)
  } else {
    form.stages.push(stage)
  }
}

async function save() {
  if (!form.originalTitle.trim() || !form.intro.trim() || !form.sourceName.trim()) {
    Toast.warning('请填写原标题、自写介绍和来源站名')
    return
  }
  if (!/^https?:\/\//i.test(form.url.trim())) {
    Toast.warning('原始 URL 必须以 http:// 或 https:// 开头')
    return
  }
  if (!form.stages.length) {
    Toast.warning('请至少选择一个适用阶段')
    return
  }
  const spec: ResourceCardSpec = {
    ...form,
    originalTitle: form.originalTitle.trim(),
    displayTitle: form.displayTitle?.trim() || undefined,
    intro: form.intro.trim(),
    url: form.url.trim(),
    sourceName: form.sourceName.trim(),
    author: form.author?.trim() || undefined,
    publishedDate: form.publishedDate?.trim() || undefined,
    lastVerifiedDate: form.lastVerifiedDate?.trim() || undefined,
    doi: form.doi?.trim() || undefined,
    pmid: form.pmid?.trim() || undefined,
    storyContext: form.storyContext?.trim() || undefined,
    miniProgramAppId: form.miniProgramAppId?.trim() || undefined,
    miniProgramPath: form.miniProgramPath?.trim() || undefined,
    tags: tagsInput.value
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean),
    priority: Number(form.priority) || 1000,
  }
  saving.value = true
  try {
    if (editing.value) {
      await updateResourceCard({ ...editing.value, spec })
      Toast.success('资料卡已更新')
    } else {
      await createResourceCard({
        apiVersion: 'wanwan.run/v1alpha1',
        kind: 'ResourceCard',
        metadata: { name: '', generateName: 'card-' },
        spec,
      })
      Toast.success('资料卡已创建')
    }
    modalVisible.value = false
    await load()
  } catch {
    Toast.error('保存资料卡失败')
  } finally {
    saving.value = false
  }
}

async function setState(card: ResourceCard, next: PublishState) {
  try {
    await updateResourceCard({
      ...card,
      spec: { ...card.spec, state: next },
    })
    Toast.success(next === 'PUBLISHED' ? '已发布' : '已撤回')
    await load()
  } catch {
    Toast.error('更新状态失败')
  }
}

function handleDelete(card: ResourceCard) {
  Dialog.warning({
    title: '删除资料卡',
    description: `确定删除「${card.spec.displayTitle || card.spec.originalTitle}」？`,
    confirmType: 'danger',
    onConfirm: async () => {
      await deleteResourceCard(card.metadata.name)
      Toast.success('已删除')
      await load()
    },
  })
}

function labelOf<T extends string>(options: { value: T; label: string }[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? value
}

function stateTheme(state: PublishState): 'primary' | 'default' | 'danger' | 'secondary' {
  switch (state) {
    case 'PUBLISHED':
      return 'primary'
    case 'PENDING_REVIEW':
      return 'secondary'
    case 'WITHDRAWN':
      return 'danger'
    default:
      return 'default'
  }
}

onMounted(load)
</script>

<template>
  <VPageHeader title="弯弯资料卡">
    <template #icon>
      <RiBookReadLine class="mr-2 self-center" />
    </template>
    <template #actions>
      <VButton type="secondary" @click="openCreate">新建资料卡</VButton>
    </template>
  </VPageHeader>

  <div class="m-4">
    <VCard :body-class="['!p-0']">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div class="flex flex-wrap items-center gap-2">
            <input
              v-model="keyword"
              type="text"
              placeholder="筛选标题或来源..."
              class="ww-input ww-input--sm"
            />
            <select v-model="filterStage" class="ww-input ww-input--sm">
              <option value="">全部阶段</option>
              <option v-for="s in STAGE_OPTIONS" :key="s.value" :value="s.value">
                {{ s.label }}
              </option>
            </select>
            <select v-model="filterState" class="ww-input ww-input--sm">
              <option value="">全部状态</option>
              <option v-for="s in PUBLISH_STATE_OPTIONS" :key="s.value" :value="s.value">
                {{ s.label }}
              </option>
            </select>
          </div>
          <span class="text-xs text-gray-500">共 {{ filteredItems.length }} 条</span>
        </div>
      </template>

      <VLoading v-if="loading" />
      <VEmpty
        v-else-if="!filteredItems.length"
        message="暂无资料卡"
        title="点击右上角「新建资料卡」开始手动录入"
      >
        <template #actions>
          <VButton type="secondary" @click="openCreate">新建资料卡</VButton>
        </template>
      </VEmpty>

      <ul v-else class="divide-y divide-gray-100">
        <li
          v-for="card in filteredItems"
          :key="card.metadata.name"
          class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <VTag :theme="stateTheme(card.spec.state)">
                {{ labelOf(PUBLISH_STATE_OPTIONS, card.spec.state) }}
              </VTag>
              <VTag>{{ labelOf(MATERIAL_TYPE_OPTIONS, card.spec.materialType) }}</VTag>
              <span class="truncate font-medium text-gray-900">
                {{ card.spec.displayTitle || card.spec.originalTitle }}
              </span>
            </div>
            <p class="line-clamp-2 text-xs text-gray-600">{{ card.spec.intro }}</p>
            <div class="flex flex-wrap gap-3 text-xs text-gray-500">
              <span>来源：{{ card.spec.sourceName }}</span>
              <span>核对：{{ card.spec.lastVerifiedDate || '未记录' }}</span>
              <span>链接：{{ labelOf(LINK_STATUS_OPTIONS, card.spec.linkStatus) }}</span>
              <span>入口：{{ labelOf(ENTRY_TYPE_OPTIONS, card.spec.entryType) }}</span>
              <span>排序：{{ card.spec.priority }}</span>
            </div>
          </div>

          <VSpace class="shrink-0">
            <VButton size="sm" @click="openEdit(card)">编辑</VButton>
            <VButton
              v-if="card.spec.state !== 'PUBLISHED'"
              size="sm"
              type="secondary"
              @click="setState(card, 'PUBLISHED')"
            >
              发布
            </VButton>
            <VButton v-else size="sm" type="danger" @click="setState(card, 'WITHDRAWN')">
              撤回
            </VButton>
            <VButton size="sm" type="danger" @click="handleDelete(card)">删除</VButton>
          </VSpace>
        </li>
      </ul>
    </VCard>
  </div>

  <VModal
    :visible="modalVisible"
    :width="760"
    :title="editing ? '编辑资料卡' : '新建资料卡'"
    @close="modalVisible = false"
  >
    <div class="space-y-3 text-sm">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="ww-field">
          <span>原标题 *</span>
          <input v-model="form.originalTitle" class="ww-input" placeholder="原文标题" />
        </label>
        <label class="ww-field">
          <span>中文辅助标题（可选）</span>
          <input v-model="form.displayTitle" class="ww-input" placeholder="本站拟写标题" />
        </label>
      </div>

      <label class="ww-field">
        <span>自写简短介绍 *（1~3 句，不复制原文摘要）</span>
        <textarea v-model="form.intro" rows="3" class="ww-input" />
      </label>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="ww-field">
          <span>原始 URL *（http/https）</span>
          <input v-model="form.url" class="ww-input" placeholder="https://..." />
        </label>
        <label class="ww-field">
          <span>来源站名 *</span>
          <input v-model="form.sourceName" class="ww-input" placeholder="机构/期刊/作者站" />
        </label>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label class="ww-field">
          <span>作者或机构</span>
          <input v-model="form.author" class="ww-input" />
        </label>
        <label class="ww-field">
          <span>原文发布日期</span>
          <input v-model="form.publishedDate" class="ww-input" placeholder="YYYY-MM-DD 或留空" />
        </label>
        <label class="ww-field">
          <span>最后核对日期</span>
          <input v-model="form.lastVerifiedDate" type="date" class="ww-input" />
        </label>
      </div>

      <div class="ww-field">
        <span>适用阶段 *（可多选）</span>
        <div class="flex flex-wrap gap-2 pt-1">
          <label
            v-for="s in STAGE_OPTIONS"
            :key="s.value"
            class="inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs"
          >
            <input
              type="checkbox"
              :checked="form.stages.includes(s.value)"
              @change="toggleStage(s.value)"
            />
            <span>{{ s.label }}</span>
          </label>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label class="ww-field">
          <span>材料类型</span>
          <select v-model="form.materialType" class="ww-input">
            <option v-for="o in MATERIAL_TYPE_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </label>
        <label class="ww-field">
          <span>语言</span>
          <select v-model="form.language" class="ww-input">
            <option value="ZH">中文</option>
            <option value="OTHER">其他语言</option>
          </select>
        </label>
        <label class="ww-field">
          <span>访问条件</span>
          <select v-model="form.access" class="ww-input">
            <option v-for="o in ACCESS_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </label>
        <label class="ww-field">
          <span>推荐排序（越小越前）</span>
          <input v-model.number="form.priority" type="number" class="ww-input" />
        </label>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label class="ww-field">
          <span>入口类型（小程序/Web）</span>
          <select v-model="form.entryType" class="ww-input">
            <option v-for="o in ENTRY_TYPE_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </label>
        <label class="ww-field">
          <span>链接状态</span>
          <select v-model="form.linkStatus" class="ww-input">
            <option v-for="o in LINK_STATUS_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </label>
        <label class="ww-field">
          <span>发布状态</span>
          <select v-model="form.state" class="ww-input">
            <option v-for="o in PUBLISH_STATE_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </label>
      </div>

      <div v-if="form.entryType === 'MINIPROGRAM'" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="ww-field">
          <span>目标小程序 AppID</span>
          <input v-model="form.miniProgramAppId" class="ww-input" placeholder="wx..." />
        </label>
        <label class="ww-field">
          <span>目标页面路径</span>
          <input v-model="form.miniProgramPath" class="ww-input" placeholder="pages/..." />
        </label>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label class="ww-field">
          <span>主题标签（逗号分隔）</span>
          <input v-model="tagsInput" class="ww-input" placeholder="产前超声, Ponseti" />
        </label>
        <label class="ww-field">
          <span>DOI（论文适用）</span>
          <input v-model="form.doi" class="ww-input" />
        </label>
        <label class="ww-field">
          <span>PMID / 经历背景时点</span>
          <input v-model="form.storyContext" class="ww-input" placeholder="如：出生后6个月复查" />
        </label>
      </div>
    </div>

    <template #footer>
      <VSpace>
        <VButton :loading="saving" type="secondary" @click="save">保存</VButton>
        <VButton @click="modalVisible = false">取消</VButton>
      </VSpace>
    </template>
  </VModal>
</template>

<style scoped>
.ww-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #374151;
}
.ww-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  padding: 0.375rem 0.5rem;
  font-size: 0.875rem;
  background: #fff;
}
.ww-input--sm {
  width: auto;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}
</style>
