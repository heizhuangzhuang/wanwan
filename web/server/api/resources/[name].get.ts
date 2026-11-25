import { useBackend } from '../../utils/backend'

export default defineEventHandler(async (event) => {
  const rawName = getRouterParam(event, 'name') || ''
  const name = decodeURIComponent(rawName).trim()
  if (!name) {
    throw createError({ statusCode: 404, statusMessage: 'Resource Not Found' })
  }
  const { client } = useBackend()
  const resource = await client.getResource(name)
  if (!resource) {
    throw createError({ statusCode: 404, statusMessage: 'Resource Not Found' })
  }

  let related: typeof resource[] = []
  const tag = resource.tags?.[0]
  const stage = resource.stages?.[0]
  if (resource.linkStatus !== 'SOURCE_RETRACTED' && (tag || stage)) {
    try {
      const { items } = await client.listResources({ tag, stage: tag ? undefined : stage, size: 4 })
      related = items
        .filter(item => item.name !== resource.name && item.linkStatus !== 'SOURCE_RETRACTED')
        .slice(0, 3)
    } catch {
      related = []
    }
  }

  return { resource, related }
})
