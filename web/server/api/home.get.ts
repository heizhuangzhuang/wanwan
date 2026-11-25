import { FIXED_STAGES } from '../../shared/types'
import { normalizePostCover, useBackend } from '../utils/backend'

export default defineEventHandler(async () => {
  const { apiBase, mediaOrigin, client } = useBackend()
  if (!apiBase) {
    return {
      stages: FIXED_STAGES,
      topics: [],
      recent: [],
      posts: [],
      resourcesUnavailable: false,
      unconfigured: true,
    }
  }
  const [stagesRes, topicsRes, recentRes, postsRes] = await Promise.allSettled([
    client.getStages(),
    client.listTopics(1, 3),
    client.listResources({ page: 1, size: 6 }),
    client.listPosts(1, 3),
  ])
  return {
    stages: stagesRes.status === 'fulfilled' && stagesRes.value.length ? stagesRes.value : FIXED_STAGES,
    topics: topicsRes.status === 'fulfilled' ? topicsRes.value.items.filter(t => t.resourceCount > 0) : [],
    recent: recentRes.status === 'fulfilled' ? recentRes.value.items : [],
    posts: postsRes.status === 'fulfilled'
      ? postsRes.value.items.map(p => normalizePostCover(p, mediaOrigin))
      : [],
    resourcesUnavailable: recentRes.status === 'rejected',
    unconfigured: false,
  }
})
