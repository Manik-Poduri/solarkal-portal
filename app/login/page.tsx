'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'

const MESSAGES: Record<string, string> = {
  domain: 'Only @solarkal.com Google accounts can sign in.',
  noprofile: 'Your account has no profile yet. Contact an admin.',
  nocode: 'Sign-in was interrupted. Please try again.',
  exchange: 'Sign-in failed. Please try again.',
}

function LoginInner() {
  const error = useSearchParams().get('error')

  async function signIn() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: 'solarkal.com', prompt: 'select_account' },
      },
    })
  }

  return (
    <main className="login">
            {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="SolarKal: Solar Made Simple. Done Right." className="login-logo" />
      <h1>Rooftop Leads</h1>
      <p>Sign in with your @solarkal.com Google account.</p>
      {error && <p className="error">{MESSAGES[error] ?? 'Sign-in failed.'}</p>}
      <button onClick={signIn}>Sign in with Google</button>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  )
}