'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export default function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname()
  const active = href === '/' ? path === '/' || path.startsWith('/company') : path.startsWith(href)
  return (
    <Link href={href} className={`navlink ${active ? 'active' : ''}`}>
      {children}
    </Link>
  )
}