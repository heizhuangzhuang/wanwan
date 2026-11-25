<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const config = useRuntimeConfig()
const is404 = computed(() => props.error?.statusCode === 404)

useHead({
  title: is404.value
    ? `内容不存在或已下线 - ${config.public.siteTitle}`
    : `服务暂时不可用 - ${config.public.siteTitle}`,
})
</script>

<template>
  <NuxtLayout name="default">
    <div v-if="is404" class="warn-bar">
      <h1>内容不存在或已停用</h1>
      <p>您访问的资料卡、专题或页面未找到，可能尚未发布或已按核查要求撤回下线。</p>
      <p>
        <NuxtLink to="/">返回首页</NuxtLink> · <NuxtLink to="/stages">按阶段浏览</NuxtLink>
      </p>
    </div>
    <div v-else class="warn-bar">
      <h1>服务暂时不可用</h1>
      <p>暂时无法连接资料服务，请稍后刷新重试。以下离线工具仍可直接打开：</p>
      <p>
        <NuxtLink to="/tools">家庭工具</NuxtLink> · <NuxtLink to="/prenatal">产前检查专项</NuxtLink>
      </p>
    </div>
  </NuxtLayout>
</template>
