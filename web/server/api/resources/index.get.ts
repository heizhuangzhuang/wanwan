import { useBackend } from '../../utils/backend'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const stage = typeof query.stage === 'string' ? query.stage.trim().toUpperCase() : ''
  const type = typeof query.type === 'string' ? query.type.trim().toUpperCase() : ''
  const tag = typeof query.tag === 'string' ? query.tag.trim().slice(0, 50) : ''
  const { client } = useBackend()

  try {
    const list = await client.listResources({
      stage: stage || undefined,
      type: type || undefined,
      tag: tag || undefined,
      page,
      size: 20,
    })
    return { list, unavailable: false }
  } catch {
    return { list: null, unavailable: true }
  }
})
