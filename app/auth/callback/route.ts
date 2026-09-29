import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(`${origin}/login?error=nocode`)

  const supabase = createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${origin}/login?error=exchange`)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email || !user.email.toLowerCase().endsWith('@solarkal.com')) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=domain`)
  }
  return NextResponse.redirect(`${origin}/`)
}