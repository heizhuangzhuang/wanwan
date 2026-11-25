import { FIXED_STAGES } from '../../../shared/types'
import { normalizePostCover, useBackend } from '../../utils/backend'

export default defineEventHandler(async (event) => {
  const rawKey = getRouterParam(event, 'key') || ''
  const key = decodeURIComponent(rawKey).trim().toUpperCase()
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const type = typeof query.type === 'string' ? query.type.trim().toUpperCase() : ''
  const tag = typeof query.tag === 'string' ? query.tag.trim().slice(0, 50) : ''

  const { mediaOrigin, client } = useBackend()
  const stages = await client.getStages().catch(() => FIXED_STAGES)
  const stage = stages.find(s => s.key === key)
  if (!stage) {
    throw createError({ statusCode: 404, statusMessage: 'Stage Not Found' })
  }

  const [resources, posts] = await Promise.all([
    client.listResources({ stage: stage.key, type: type || undefined, tag: tag || undefined, page, size: 20 }).catch(() => null),
    client.listStagePosts(stage.key, 1, 3).catch(() => null),
  ])

  return {
    stage,
    resources,
    posts: posts
      ? { ...posts, items: posts.items.map(p => normalizePostCover(p, mediaOrigin)) }
      : null,
  }
})
