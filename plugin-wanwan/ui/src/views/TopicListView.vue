<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
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
import RiFolderLine from '~icons/ri/folder-line'
import {
  createTopic,
  deleteTopic,
  listResourceCards,
  listTopics,
  updateTopic,
} from '@/api/wanwan'
import {
  PUBLISH_STATE_OPTIONS,
  type PublishState,
  type ResourceCard,
  type Topic,
  type TopicSpec,
} from '@/types/wanwan'

const loading = ref(false)
const topics = ref<Topic[]>([])
const allCards = ref<ResourceCard[]>([])
const modalVisible = ref(false)
const saving = ref(false)
const editing = ref<Topic | null>(null)
const resourceNamesText = ref('')

const form = reactive<TopicSpec>({
  title: '',
  intro: '',
  resourceNames: [],
  state: 'DRAFT',
  priority: 1000,
})

async function loadAllCards(): Promise<ResourceCard[]> {
  const cards = new Map<string, ResourceCard>()
  let page = 1
  for (;;) {
    const result = await listResourceCards(page, 100)
    const before = cards.size
    for (const card of result.items ?? []) cards.set(card.metadata.name, card)
    if (cards.size >= result.total || cards.size === before) break
    page += 1
  }
  return [...cards.values()]
}

function publishedCountOf(topic: Topic): number {
  const names = new Set(topic.spec.resourceNames ?? [])
  return allCards.value.filter(
    (c) =>
      names.has(c.metadata.name)
      && c.spec.state === 'PUBLISHED'
      && c.spec.linkStatus !== 'SOURCE_RETRACTED',
  ).length
}

async function load() {
  loading.value = true
  try {
    const [topicRes, cards] = await Promise.all([listTopics(1, 100), loadAllCards()])
    topics.value = (topicRes.items ?? []).sort(
      (a, b) => (a.spec.priority ?? 1000) - (b.spec.priority ?? 1000),
    )
    allCards.value = cards
  } catch {
    Toast.error('加载专题失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  form.title = ''
  form.intro = ''
  form.resourceNames = []
  form.state = 'DRAFT'
  form.priority = 1000
  resourceNamesText.value = ''
  modalVisible.value = true
}

function openEdit(topic: Topic) {
  editing.value = topic
  form.title = topic.spec.title
  form.intro = topic.spec.intro
  form.resourceNames = [...(topic.spec.resourceNames ?? [])]
  form.state = topic.spec.state
  form.priority = topic.spec.priority ?? 1000
  resourceNamesText.value = form.resourceNames.join('\n')
  modalVisible.value = true
}

function appendCardName(name: string) {
  const lines = resourceNamesText.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!lines.includes(name)) {
    lines.push(name)
    resourceNamesText.value = lines.join('\n')
  }
}

async function save() {
  if (!form.title.trim()) {
    Toast.warning('请填写专题标题')
    return
  }
  const spec: TopicSpec = {
    title: form.title.trim(),
    intro: form.intro.trim(),
    resourceNames: resourceNamesText.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    state: form.state,
    priority: Number(form.priority) || 1000,
  }
  saving.value = true
  try {
    if (editing.value) {
      await updateTopic({ ...editing.value, spec })
      Toast.success('专题已更新')
    } else {
      await createTopic({
        apiVersion: 'wanwan.run/v1alpha1',
        kind: 'Topic',
        metadata: { name: '', generateName: 'topic-' },
        spec,
      })
      Toast.success('专题已创建')
    }
    modalVisible.value = false
    await load()
  } catch {
    Toast.error('保存专题失败')
  } finally {
    saving.value = false
  }
}

async function setState(topic: Topic, state: PublishState) {
  const run = async () => {
    try {
      await updateTopic({ ...topic, spec: { ...topic.spec, state } })
      Toast.success(state === 'PUBLISHED' ? '专题已发布' : '专题已撤回')
      await load()
    } catch {
      Toast.error('更新状态失败')
    }
  }
  if (state === 'WITHDRAWN') {
    Dialog.warning({
      title: '撤回专题',
      description: `确定将专题「${topic.spec.title}」撤回下线？`,
      confirmType: 'danger',
      onConfirm: run,
    })
    return
  }
  await run()
}

function handleDelete(topic: Topic) {
  Dialog.warning({
    title: '删除专题',
    description: `确定删除专题「${topic.spec.title}」？`,
    confirmType: 'danger',
    onConfirm: async () => {
      await deleteTopic(topic.metadata.name)
      Toast.success('已删除')
      await load()
    },
  })
}

function stateLabel(state: PublishState): string {
  return PUBLISH_STATE_OPTIONS.find((o) => o.value === state)?.label ?? state
}

onMounted(load)
</script>

<template>
  <VPageHeader title="弯弯专题">
    <template #icon>
      <RiFolderLine class="mr-2 self-center" />
    </template>
    <template #actions>
      <VButton type="secondary" @click="openCreate">新建专题</VButton>
    </template>
  </VPageHeader>

  <div class="m-4">
    <VCard :body-class="['!p-0']">
      <VLoading v-if="loading" />
      <VEmpty v-else-if="!topics.length" message="暂无专题" title="新建专题以组织推荐阅读顺序">
        <template #actions>
          <VButton type="secondary" @click="openCreate">新建专题</VButton>
        </template>
      </VEmpty>

      <ul v-else class="divide-y divide-gray-100">
        <li
          v-for="topic in topics"
          :key="topic.metadata.name"
          class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex items-center gap-2">
              <VTag :theme="topic.spec.state === 'PUBLISHED' ? 'primary' : 'default'">
                {{ stateLabel(topic.spec.state) }}
              </VTag>
              <span class="font-medium text-gray-900">{{ topic.spec.title }}</span>
              <span
                class="text-xs"
                :class="publishedCountOf(topic) === 0 ? 'text-amber-700 font-medium' : 'text-gray-500'"
              >
                （已公开 {{ publishedCountOf(topic) }} / 共 {{ topic.spec.resourceNames?.length ?? 0 }} 条资料）
              </span>
            </div>
            <p class="line-clamp-2 text-xs text-gray-600">{{ topic.spec.intro }}</p>
          </div>
          <VSpace class="shrink-0">
            <VButton size="sm" @click="openEdit(topic)">编辑</VButton>
            <VButton
              v-if="topic.spec.state !== 'PUBLISHED'"
              size="sm"
              type="secondary"
              @click="setState(topic, 'PUBLISHED')"
            >
              发布
            </VButton>
            <VButton v-else size="sm" type="danger" @click="setState(topic, 'WITHDRAWN')">
              撤回
            </VButton>
            <VButton size="sm" type="danger" @click="handleDelete(topic)">删除</VButton>
          </VSpace>
        </li>
      </ul>
    </VCard>
  </div>

  <VModal
    :visible="modalVisible"
    :width="680"
    :title="editing ? '编辑专题' : '新建专题'"
    @close="modalVisible = false"
  >
    <div class="space-y-3 text-sm">
      <label class="ww-field">
        <span>专题标题 *</span>
        <input v-model="form.title" class="ww-input" />
      </label>

      <label class="ww-field">
        <span>导读说明</span>
        <textarea v-model="form.intro" rows="3" class="ww-input" />
      </label>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="ww-field">
          <span>发布状态</span>
          <select v-model="form.state" class="ww-input">
            <option v-for="o in PUBLISH_STATE_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </label>
        <label class="ww-field">
          <span>排序（越小越前）</span>
          <input v-model.number="form.priority" type="number" class="ww-input" />
        </label>
      </div>

      <label class="ww-field">
        <span>关联资料卡 ID（每行一个，按阅读顺序排列）</span>
        <textarea v-model="resourceNamesText" rows="5" class="ww-input font-mono text-xs" />
      </label>

      <div v-if="allCards.length" class="ww-field">
        <span>快速追加已有资料卡：</span>
        <div class="flex max-h-32 flex-wrap gap-1 overflow-y-auto pt-1">
          <button
            v-for="c in allCards"
            :key="c.metadata.name"
            type="button"
            class="rounded border px-2 py-0.5 text-xs hover:bg-gray-100"
            @click="appendCardName(c.metadata.name)"
          >
            + {{ c.spec.displayTitle || c.spec.originalTitle }}
          </button>
        </div>
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
select.ww-input {
  background-image: none;
  padding-right: 1.75rem;
}
</style>
