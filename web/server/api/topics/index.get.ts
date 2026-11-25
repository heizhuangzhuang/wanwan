import { useBackend } from '../../utils/backend'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const { client } = useBackend()
  return await client.listTopics(page, 20)
})
