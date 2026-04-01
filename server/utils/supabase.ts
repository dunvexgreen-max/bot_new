import { createClient } from '@supabase/supabase-js'

export const useSupabase = () => {
  const config = useRuntimeConfig()
  const supabaseUrl = config.supabase.url || process.env.SUPABASE_URL
  const supabaseKey = config.supabase.key || process.env.SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration (URL or Key) is missing. Please check your environment variables (SUPABASE_URL, SUPABASE_KEY).')
  }

  return createClient(supabaseUrl, supabaseKey)
}
