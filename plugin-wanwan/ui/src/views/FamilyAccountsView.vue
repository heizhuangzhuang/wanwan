<script setup lang="ts">
import { axiosInstance } from '@halo-dev/api-client'
import { onMounted, ref } from 'vue'

interface FamilyUser {
  username: string
  displayName: string
  disabled: boolean
  web: string | null
  mini: string | null
}

const page = ref(1)
const total = ref(0)
const rows = ref<FamilyUser[]>([])
const busy = ref(false)
const failed = ref(false)

async function load(target: number) {
  if (busy.value) return
  busy.value = true
  failed.value = false
  try {
    const { data } = await axiosInstance.get<{ total: number; items: FamilyUser[] }>(
      '/apis/console.api.xiaojiaoya.run/v1alpha1/family-users', { params: { page: target } },
    )
    page.value = target
    rows.value = data.items
    total.value = data.total
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}

function showTime(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—'
}

onMounted(() => load(1))
</script>

<template>
  <main class="family-accounts">
    <h1>家庭账号登录来源</h1>
    <p>时间为北京时间。停用和删除账号可在 Halo「用户」中按用户名查找处理。</p>
    <div v-if="failed" role="alert">读取失败。<button @click="load(page)">重试</button></div>
    <p v-else-if="busy">正在读取…</p>
    <p v-else-if="!rows.length">暂无家庭账号。</p>
    <div v-else class="family-table">
      <table>
        <thead><tr><th>家长账号</th><th>状态</th><th>最近 Web 登录</th><th>最近小程序登录</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.username">
            <td>{{ row.displayName }}<br><small>{{ row.username }}</small></td>
            <td>{{ row.disabled ? '已停用' : '正常' }}</td>
            <td>{{ showTime(row.web) }}</td><td>{{ showTime(row.mini) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="total > 20" class="family-pages">
      <button :disabled="busy || page === 1" @click="load(page - 1)">上一页</button>
      <span>{{ page }} / {{ Math.ceil(total / 20) }}</span>
      <button :disabled="busy || page * 20 >= total" @click="load(page + 1)">下一页</button>
    </div>
  </main>
</template>

<style scoped>
.family-accounts { padding: 1.5rem; }
.family-accounts h1 { font-size: 1.35rem; font-weight: 600; margin-bottom: .6rem; }
.family-table { overflow: auto; margin-block: 1rem; }
table { width: 100%; border-collapse: collapse; text-align: left; }
td, th { padding: .65rem; border-bottom: 1px solid #d9dfdc; }
.family-pages { display: flex; align-items: center; gap: 1rem; }
button { text-decoration: underline; }
</style>
