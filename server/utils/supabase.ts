import { createClient } from '@supabase/supabase-js'

export const useSupabase = () => {
  const config = useRuntimeConfig()
  const supabaseUrl = config.supabase.url || process.env.SUPABASE_URL
  const supabaseKey = config.supabase.key || process.env.SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase config is missing. Please check your .env/runtimeConfig.')
  }

  return createClient(supabaseUrl, supabaseKey)
}
