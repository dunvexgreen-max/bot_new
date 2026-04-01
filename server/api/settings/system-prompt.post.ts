import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { value } = await readValidatedBody(event, z.object({
    value: z.string()
  }).parse)

  const supabase = useSupabase()
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'system_prompt', value }, { onConflict: 'key' })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { success: true }
})
