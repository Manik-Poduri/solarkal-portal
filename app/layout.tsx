import './globals.css'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import ChatPanel from '@/components/ChatPanel'
import NavLink from '@/components/NavLink'

export const metadata = { title: 'SolarKal Rooftop Leads', icons: { icon: '/logo.png' } }

export default async function RootLayout({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let role: string | null = null
  if (user) {
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    role = data?.role ?? null
  }
  const signedIn = !!(user && role)

  return (
    <html lang="en">
      <body>
        {signedIn ? (
          <div className="app">
            <header className="topbar">
              <div className="brand">
                <div className="brand-logo" role="img" aria-label="SolarKal" />
              </div>
              <nav className="top-nav">
                <NavLink href="/">Ranked accounts</NavLink>
                {role === 'approver' && <NavLink href="/review">Review queue</NavLink>}
              </nav>
              <div className="top-user">
                <div className="avatar">{(user!.email ?? '?')[0].toUpperCase()}</div>
                <div className="who">
                  <div className="who-email">{user!.email}</div>
                  <div className="who-role">{role === 'approver' ? 'Approver' : 'View only'}</div>
                </div>
                <form action="/auth/signout" method="post">
                  <button className="signout" title="Sign out">Sign out</button>
                </form>
              </div>
            </header>
            <div className="content">{children}</div>
          </div>
        ) : (
          children
        )}
        {signedIn && <ChatPanel />}
      </body>
    </html>
  )
}