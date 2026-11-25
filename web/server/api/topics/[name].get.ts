import { useBackend } from '../../utils/backend'

export default defineEventHandler(async (event) => {
  const rawName = getRouterParam(event, 'name') || ''
  const name = decodeURIComponent(rawName).trim()
  if (!name) {
    throw createError({ statusCode: 404, statusMessage: 'Topic Not Found' })
  }
  const { client } = useBackend()
  const topic = await client.getTopic(name)
  if (!topic) {
    throw createError({ statusCode: 404, statusMessage: 'Topic Not Found' })
  }
  return topic
})
