<script setup lang="ts">
import { isLiteratureArticle, type PreparedPostView } from '~/shared/types'

const route = useRoute()
const config = useRuntimeConfig()
const { status, copy } = useCopyAction()

const name = computed(() => String(route.params.name || '').trim())
const { data: post, error } = await useFetch<PreparedPostView>(() => `/api/posts/${encodeURIComponent(name.value)}`)

if (error.value?.statusCode === 404) {
  throw createError({ statusCode: 404, statusMessage: 'Post Not Found' })
}

const lit = computed(() => (post.value ? isLiteratureArticle(post.value) : false))
const publishDate = computed(() => (post.value?.publishTime ? post.value.publishTime.slice(0, 10) : ''))

function copyShareUrl() {
  if (!post.value || !import.meta.client) return
  const prefix = lit.value
    ? `小脚丫步步指南｜【文献译读】${post.value.title}`
    : `小脚丫步步指南｜${post.value.title}`
  copy(`${prefix}\n${window.location.href}`, '已复制文章链接，可直接粘贴发给微信好友或家人。')
}

useHead(() => ({
  title: post.value ? `${post.value.title} - ${config.public.siteTitle}` : config.public.siteTitle,
}))
</script>

<template>
  <div v-if="post">
    <p><NuxtLink to="/posts">← 返回原创导读</NuxtLink></p>
    <article class="card post-prose" :class="{ 'card-literature': lit }">
      <div class="meta-row">
        <template v-if="lit">
          <span class="badge badge-literature">文献译读</span>
          <span v-if="post.citation?.evidenceType" class="badge badge-literature-sub">
            {{ post.citation.evidenceType }}
          </span>
        </template>
        <span v-else class="badge">本站原创导读</span>
        <span>约 {{ post.readingMinutes }} 分钟阅读</span>
        <span v-if="post.author">作者 {{ post.author }}</span>
        <span v-if="publishDate">发布日期：{{ publishDate }}</span>
      </div>

      <h1>{{ post.title }}</h1>

      <div class="action-bar" style="margin: 12px 0">
        <button class="btn btn-outline" type="button" @click="copyShareUrl">
          复制文章链接分享给家人
        </button>
      </div>
      <p v-if="status" class="action-status" role="status" aria-live="polite">{{ status }}</p>

      <LiteratureCitationCard :post="post" />

      <div v-if="!lit" class="notice-bar">
        本文为本站原创导读或使用说明，不替代门诊沟通与专业医学意见。
      </div>

      <nav v-if="post.toc.length >= 2" class="post-toc" aria-label="文章目录">
        <strong>本篇目录</strong>
        <ol>
          <li v-for="item in post.toc" :key="item.id" :class="`post-toc--${item.level}`">
            <a :href="`#${item.id}`">{{ item.text }}</a>
          </li>
        </ol>
      </nav>

      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="prose-body" v-html="post.html" />
    </article>
  </div>
</template>
