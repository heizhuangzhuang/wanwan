<script setup lang="ts">
const config = useRuntimeConfig()
const route = useRoute()

const navItems = [
  { to: '/', label: '首页' },
  { to: '/stages', label: '按阶段' },
  { to: '/prenatal', label: '产前检查' },
  { to: '/tools', label: '家庭工具' },
  { to: '/resources', label: '资料库' },
]

function isCurrent(href: string): 'page' | 'true' | undefined {
  if (route.path === href) return 'page'
  if (href !== '/' && route.path.startsWith(`${href}/`)) return 'true'
  return undefined
}

const canonicalUrl = computed(() => {
  const origin = config.public.siteOrigin
  const base = config.public.siteBasePath
  if (!origin || route.path === '/search') return ''
  return `${origin}${base}${route.path === '/' ? '/' : route.path}`
})

useHead(() => ({
  link: canonicalUrl.value ? [{ rel: 'canonical', href: canonicalUrl.value }] : [],
}))
</script>

<template>
  <div>
    <a class="skip-link" href="#main">跳到主要内容</a>
    <header class="site-header">
      <div class="container header-inner">
        <NuxtLink class="brand" to="/">
          <img class="brand-logo" :src="`${config.public.siteBasePath}/assets/logo.png`" alt="" width="40" height="40" />
          <span>{{ config.public.siteTitle }}</span>
        </NuxtLink>
        <NuxtLink
          class="nav-search"
          to="/search"
          :aria-current="route.path === '/search' ? 'page' : undefined"
        >
          <span class="search-symbol" aria-hidden="true" />搜索
        </NuxtLink>
        <nav class="nav" aria-label="主导航">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            :aria-current="isCurrent(item.to)"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
      </div>
    </header>

    <main id="main" class="container site-main" tabindex="-1">
      <slot />
    </main>

    <footer class="site-footer">
      <div class="container">
        <div class="footer-main">
          <div>
            <strong>{{ config.public.siteTitle }}</strong>
            <p>{{ config.public.maintenanceStatus }}</p>
          </div>
          <nav aria-label="页脚导航">
            <NuxtLink to="/topics">精选专题</NuxtLink>
            <NuxtLink to="/posts">原创导读</NuxtLink>
            <NuxtLink to="/feedback">功能建议</NuxtLink>
            <NuxtLink to="/about">收录说明、版权勘误与隐私说明</NuxtLink>
          </nav>
        </div>
        <p v-if="config.public.contactEmail || config.public.icpNumber" class="footer-contact">
          <template v-if="config.public.contactEmail">
            联系邮箱：{{ config.public.contactEmail }}
          </template>
          <template v-if="config.public.contactEmail && config.public.icpNumber"> · </template>
          <a
            v-if="config.public.icpNumber"
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ config.public.icpNumber }}
          </a>
        </p>
      </div>
    </footer>
  </div>
</template>
