import { normalizePostCover, preparePostContent, useBackend } from '../../utils/backend'

export default defineEventHandler(async (event) => {
  const rawName = getRouterParam(event, 'name') || ''
  const name = decodeURIComponent(rawName).trim()
  if (!name) {
    throw createError({ statusCode: 404, statusMessage: 'Post Not Found' })
  }
  const { mediaOrigin, client } = useBackend()
  const post = await client.getPost(name)
  if (!post) {
    throw createError({ statusCode: 404, statusMessage: 'Post Not Found' })
  }
  const normalized = normalizePostCover(post, mediaOrigin)
  const { html, toc, readingMinutes } = preparePostContent(post.content, mediaOrigin)
  return {
    name: normalized.name,
    title: normalized.title,
    excerpt: normalized.excerpt,
    publishTime: normalized.publishTime,
    author: normalized.author,
    coverUrl: normalized.coverUrl,
    articleKind: normalized.articleKind,
    citation: normalized.citation,
    html,
    toc,
    readingMinutes,
  }
})
