import { FIXED_STAGES } from '../../../shared/types'
import { useBackend } from '../../utils/backend'

export default defineEventHandler(async () => {
  const { client } = useBackend()
  return await client.getStages().catch(() => FIXED_STAGES)
})
