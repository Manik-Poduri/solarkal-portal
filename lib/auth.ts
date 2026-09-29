import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'

export type Role = 'viewer' | 'approver'

export async function requireUser() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !user.email?.toLowerCase().endsWith('@solarkal.com')) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login?error=noprofile')

  return { supabase, user, role: profile.role as Role, email: profile.email as string }
}

export const fmt = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('en-US')