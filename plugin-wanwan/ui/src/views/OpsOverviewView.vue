<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { VButton, VPageHeader } from '@halo-dev/components'
import {
  getOpsOverview, saveMiniProgramCheck,
  type Channel, type MiniProgramCheck, type OpsOverview, type Outcome, type ProbeState,
} from '@/api/operations'

const overview = ref<OpsOverview>()
const loading = ref(false)
const refreshError = ref('')
const channel = ref<Channel>('trial')
const version = ref('')
const outcome = ref<Outcome | ''>('')
const saving = ref(false)
const saveMessage = ref('')
const saveError = ref(false)

const labels: Record<ProbeState, string> = {
  OK: '正常',
  REDIRECT: '发生跳转',
  HTTP_ERROR: 'HTTP 异常',
  UNEXPECTED_RESPONSE: '响应格式异常',
  TIMEOUT: '请求超时',
  UNREACHABLE: '连不上服务',
  NOT_CONFIGURED: '地址待配置',
}

const channels: Record<Channel, string> = { trial: '体验版', formal: '正式版' }
const sections = computed(() => {
  const probes = overview.value?.probes
  return [
    {
      key: 'web', title: '访客 Web', link: 'https://console.cloud.tencent.com/cvm',
      action: '腾讯云 CVM',
      checks: [
        { label: 'Web 进程', result: probes?.webProcess },
        { label: '原创导读页面', result: probes?.webPosts },
      ],
    },
    {
      key: 'halo', title: 'Halo 资料 API', link: 'https://cloud.weixin.qq.com/cloudrun/service/xiaojiaoya',
      action: '微信云托管',
      checks: [
        { label: '阶段列表', result: probes?.haloStages },
        { label: '原创导读接口', result: probes?.haloPosts },
      ],
    },
  ]
})

const formatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Shanghai',
})

function checkLabel(check: MiniProgramCheck) {
  if (check.state === 'UNVERIFIED') return '待真机验证'
  if (check.state === 'UNAVAILABLE') return '暂无法读取'
  if (check.state === 'STALE') return check.outcome === 'PASS' ? '待复核（上次通过）' : '待复核（上次异常）'
  return check.outcome === 'PASS' ? '真机通过' : '真机异常'
}

async function load() {
  if (loading.value || saving.value) return
  loading.value = true
  refreshError.value = ''
  try {
    overview.value = await getOpsOverview()
  } catch {
    refreshError.value = overview.value ? '刷新失败，下方显示上次取得的结果。' : '运营状态暂时无法读取，请点击刷新重试。'
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!outcome.value || saving.value || loading.value || !overview.value) return
  saving.value = true
  saveError.value = false
  saveMessage.value = ''
  try {
    const check = await saveMiniProgramCheck(channel.value, version.value.trim(), outcome.value)
    overview.value.miniProgramChecks = overview.value.miniProgramChecks.map(row =>
      row.channel === check.channel ? check : row)
    saveMessage.value = `已记录${channels[check.channel]}真机结果。`
    outcome.value = ''
  } catch {
    saveError.value = true
    saveMessage.value = '保存失败，请核对版本号或刷新后重试。'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <VPageHeader title="运营总览">
    <template #actions>
      <VButton type="secondary" :loading="loading" :disabled="saving" @click="load">刷新状态</VButton>
    </template>
  </VPageHeader>

  <section class="ops" aria-label="运营总览内容">
    <div class="ops-meta" aria-live="polite">
      <span v-if="overview">最近探测 {{ formatter.format(new Date(overview.probes.checkedAt)) }}（北京时间）</span>
      <span v-else-if="loading">正在检查 Web 和 Halo API…</span>
      <p v-if="refreshError" role="alert">{{ refreshError }}</p>
    </div>

    <section v-for="section in sections" :key="section.key" class="ops-row" :aria-labelledby="section.key">
      <h2 :id="section.key">{{ section.title }}</h2>
      <ul class="ops-checks">
        <li v-for="check in section.checks" :key="check.label">
          <span>{{ check.label }}</span>
          <strong :data-state="check.result?.state">{{ check.result ? labels[check.result.state] : '等待读取' }}</strong>
          <small v-if="check.result && check.result.httpStatus !== null">HTTP {{ check.result.httpStatus }}</small>
          <small v-if="check.result && check.result.durationMs !== null">{{ check.result.durationMs }} ms</small>
        </li>
      </ul>
      <a :href="section.link" target="_blank" rel="noopener noreferrer">{{ section.action }} ↗</a>
    </section>

    <section class="ops-row" aria-labelledby="content-report">
      <h2 id="content-report">资料运营统计</h2>
      <ul v-if="overview?.contentReport" class="ops-checks">
        <li><span>公开可检索</span><strong>{{ overview.contentReport.publicCards }} 条</strong><small v-if="overview.contentReport.searchIndexSize !== undefined">索引 {{ overview.contentReport.searchIndexSize }} 条</small></li>
        <li><span>待审核</span><strong>{{ overview.contentReport.pendingReview }} 条</strong></li>
        <li><span>已撤回或原文下线</span><strong>{{ overview.contentReport.withdrawn }} 条</strong></li>
        <li><span>公开资料待核对链接</span><strong>{{ overview.contentReport.linksToCheck }} 条</strong></li>
        <li v-if="overview.contentReport.publishedGuides !== undefined">
          <span>原创导读</span>
          <strong data-state="OK">{{ overview.contentReport.publishedGuides }} 篇</strong>
          <small v-if="overview.contentReport.uncategorizedGuides">其中 {{ overview.contentReport.uncategorizedGuides }} 篇未归入阶段分类</small>
        </li>
        <li v-if="overview.contentReport.missingStageCategories?.length">
          <span>缺失阶段分类</span>
          <strong data-state="HTTP_ERROR">{{ overview.contentReport.missingStageCategories.join('、') }}</strong>
        </li>
        <li v-if="overview.contentReport.unreadFeedback !== undefined">
          <span>待查看建议</span>
          <strong :data-state="overview.contentReport.unreadFeedback > 0 ? 'HTTP_ERROR' : 'OK'">{{ overview.contentReport.unreadFeedback }} 条</strong>
        </li>
      </ul>
      <p v-else>{{ overview ? '资料统计暂无法读取。' : '等待读取资料统计' }}</p>
    </section>

    <section class="ops-row" aria-labelledby="miniprogram-ops">
      <h2 id="miniprogram-ops">微信小程序</h2>
      <ul v-if="overview" class="ops-checks">
        <li v-for="check in overview.miniProgramChecks" :key="check.channel">
          <span>{{ channels[check.channel] }}</span>
          <strong :data-state="check.state === 'RECENT' ? (check.outcome === 'PASS' ? 'OK' : 'HTTP_ERROR') : check.state">
            {{ checkLabel(check) }}
          </strong>
          <small v-if="check.version">{{ check.version }}</small>
          <small v-if="check.checkedAt">{{ formatter.format(new Date(check.checkedAt)) }}</small>
        </li>
      </ul>
      <p v-else>等待读取真机记录</p>
      <a href="https://mp.weixin.qq.com/" target="_blank" rel="noopener noreferrer">微信公众平台 ↗</a>
    </section>

    <form v-if="overview" class="ops-form" @submit.prevent="save">
      <h2>登记真机验证</h2>
      <p>用手机打开对应版本，检查首页、资料详情和搜索，再记录结果。记录 24 小时后需复核。</p>
      <div class="ops-inputs">
        <label>渠道
          <select v-model="channel" :disabled="saving">
            <option value="trial">体验版</option>
            <option value="formal">正式版</option>
          </select>
        </label>
        <label>版本号
          <input v-model="version" required maxlength="32" placeholder="例如 1.2.0" :disabled="saving" />
        </label>
        <label>结果
          <select v-model="outcome" required :disabled="saving">
            <option value="" disabled>选择验证结果</option>
            <option value="PASS">通过</option>
            <option value="FAIL">异常</option>
          </select>
        </label>
        <button type="submit" :disabled="loading || saving || !outcome">
          {{ saving ? '正在保存…' : '保存真机记录' }}
        </button>
      </div>
      <p v-if="saveMessage" :role="saveError ? 'alert' : 'status'">{{ saveMessage }}</p>
    </form>
  </section>
</template>

<style scoped>
.ops {
  --ops-ink: #28332e;
  --ops-muted: #59665f;
  --ops-line: #dce4df;
  --ops-accent: #285e4e;
  --ops-warn: #8e4217;
  color: var(--ops-ink);
  background: #fff;
  border: 1px solid var(--ops-line);
  border-radius: 10px;
  margin: 16px;
  padding: 0 20px;
  max-width: 1180px;
  font: 14px/1.55 "PingFang SC", "Microsoft YaHei", sans-serif;
}
.ops-meta { color: var(--ops-muted); min-height: 44px; padding: 12px 0; }
.ops [role="alert"] { color: var(--ops-warn); }
.ops-row { display: grid; grid-template-columns: 150px 1fr max-content; align-items: start; gap: 16px; border-top: 1px solid var(--ops-line); padding: 16px 0; }
.ops h2 { font-size: 16px; font-weight: 650; }
.ops-checks { display: grid; gap: 8px; }
.ops-checks li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.ops-checks li > span { min-width: 110px; }
.ops-checks strong { color: var(--ops-warn); font-weight: 650; }
.ops-checks strong[data-state="OK"] { color: var(--ops-accent); }
.ops-checks strong:not([data-state]), .ops-checks strong[data-state="UNVERIFIED"],
.ops-checks strong[data-state="NOT_CONFIGURED"], .ops-checks small { color: var(--ops-muted); }
.ops-checks small { font-variant-numeric: tabular-nums; }
.ops-row a { color: var(--ops-accent); text-decoration: underline; text-underline-offset: 3px; }
.ops-form { border-top: 1px solid var(--ops-line); padding: 16px 0 20px; }
.ops-form p { color: var(--ops-muted); margin: 6px 0 12px; }
.ops-inputs { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 12px; }
.ops-inputs label { display: grid; gap: 4px; min-width: 120px; }
.ops-inputs input, .ops-inputs select { color: var(--ops-ink); border: 1px solid #aabbb1; border-radius: 6px; padding: 6px 8px; max-width: 180px; }
.ops-inputs select { background-image: none; padding-right: 24px; }
.ops-inputs button { background: var(--ops-accent); color: #fff; padding: 7px 12px; border-radius: 6px; }
.ops-inputs button:disabled { opacity: 0.55; cursor: not-allowed; }
.ops :is(a, button, input, select):focus-visible { outline: 2px solid var(--ops-accent); outline-offset: 3px; }
@media (max-width: 670px) {
  .ops { padding: 0 14px; }
  .ops-row { grid-template-columns: 1fr; gap: 8px; }
}
</style>
