export function getSupabasePublicUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
}

export function getSupabaseServerUrl(): string {
  return process.env.SUPABASE_INTERNAL_URL || getSupabasePublicUrl()
}
