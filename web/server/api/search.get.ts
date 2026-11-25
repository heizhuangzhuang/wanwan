import { FIXED_STAGES } from '../../shared/types'
import { searchPrenatalGuides } from '../../shared/prenatal'
import { normalizePostCover, useBackend } from '../utils/backend'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const keyword = typeof query.keyword === 'string' ? query.keyword.trim() : ''
  const stageFilter = typeof query.stage === 'string' ? query.stage.trim().toUpperCase() : ''
  const selectedType = typeof query.type === 'string' ? query.type.trim().toUpperCase() : ''
  const page = Math.max(1, Number(query.page) || 1)
  const tooLong = keyword.length > 100

  const { mediaOrigin, client } = useBackend()
  const [results, stages] = await Promise.all([
    keyword && !tooLong
      ? client.search({
          keyword,
          stage: stageFilter || undefined,
          type: selectedType || undefined,
          page,
          size: 20,
        }).catch(() => null)
      : null,
    client.getStages().catch(() => FIXED_STAGES),
  ])

  const unavailable = Boolean(keyword && !tooLong && !results)
  const prenatalMatches = keyword && !tooLong
    && (!selectedType || selectedType === 'ORIGINAL')
    && (!stageFilter || stageFilter === 'PRENATAL' || stageFilter === 'JUST_FOUND')
    ? searchPrenatalGuides(keyword)
    : []

  if (unavailable) {
    setResponseStatus(event, 503)
  }

  return {
    keyword,
    tooLong,
    unavailable,
    stages,
    prenatalMatches: page === 1 ? prenatalMatches : [],
    results: results
      ? {
          ...results,
          guideItems: (results.guideItems ?? []).map(p => normalizePostCover(p, mediaOrigin)),
        }
      : null,
  }
})
