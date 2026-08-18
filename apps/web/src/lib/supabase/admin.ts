import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServerUrl } from './url'

export function createAdminClient() {
  const supabaseUrl = getSupabaseServerUrl()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error('Configuração do Supabase Service Role Key ausente no ambiente.')
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
