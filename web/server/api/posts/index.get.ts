import { FIXED_STAGES } from '../../../shared/types'
import { normalizePostCover, useBackend } from '../../utils/backend'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const stageFilter = typeof query.stage === 'string' ? query.stage.trim().toUpperCase() : ''
  const rawKind = typeof query.kind === 'string' ? query.kind.trim().toUpperCase() : ''
  const kindFilter = rawKind === 'LITERATURE' || rawKind === 'GUIDE' ? rawKind : ''

  const stage = stageFilter ? FIXED_STAGES.find(item => item.key === stageFilter) : undefined
  if (stageFilter && !stage) {
    throw createError({ statusCode: 404, statusMessage: 'Stage Not Found' })
  }

  const { mediaOrigin, client } = useBackend()
  const list = await (stage
    ? client.listStagePosts(stage.key, page, 20, kindFilter || undefined)
    : client.listPosts(page, 20, kindFilter || undefined))

  return {
    stage: stage ?? null,
    kind: kindFilter,
    list: {
      ...list,
      items: list.items.map(p => normalizePostCover(p, mediaOrigin)),
    },
  }
})
