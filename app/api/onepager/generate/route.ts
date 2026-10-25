import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateOnePager } from '@/lib/onepager/generate'
import type { CompanyIn, PropertyIn } from '@/lib/onepager/model'

export const runtime = 'nodejs'
export const maxDuration = 60

const s = (v: unknown, n = 200) => String(v ?? '').trim().slice(0, n)

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email?.toLowerCase().endsWith('@solarkal.com')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.company || !Array.isArray(body?.properties)) {
    return NextResponse.json({ error: 'Send a company and a list of properties.' }, { status: 400 })
  }

  const c = body.company
  const cap = Number(c.cap_rate)
  const bess = Number(c.bess_lease)
  if (!(cap >= 0.02 && cap <= 0.2)) return NextResponse.json({ error: 'Cap rate must be between 2% and 20%.' }, { status: 400 })
  if (!(bess >= 0 && bess <= 10_000_000)) return NextResponse.json({ error: 'BESS lease per site looks wrong.' }, { status: 400 })
  const company: CompanyIn = {
    name: s(c.name, 120),
    brand_name: s(c.brand_name, 80) || undefined,
    subtitle: s(c.subtitle, 160) || undefined,
    cap_rate: cap,
    bess_lease: bess,
    contact_name: s(c.contact_name, 80) || 'Adam Simensky',
    contact_email: s(c.contact_email, 120) || 'Adam.Simensky@SolarKal.com',
  }
  if (!company.name) return NextResponse.json({ error: 'Company name is required.' }, { status: 400 })

  const props: PropertyIn[] = body.properties.slice(0, 500).map((p: any) => ({
    property: s(p.property, 120),
    address: s(p.address, 160),
    city: s(p.city, 80),
    state: s(p.state, 2).toUpperCase(),
    gla: Number(p.gla),
    region: s(p.region, 60),
    bess_eligible: p.bess_eligible === 'No' ? 'No' : 'Yes',
  }))

  let logo: Buffer | null = null
  if (typeof body.logo === 'string' && body.logo.startsWith('data:image/')) {
    logo = Buffer.from(body.logo.split(',')[1] ?? '', 'base64')
    if (logo.length > 2_000_000) return NextResponse.json({ error: 'Logo is larger than 2 MB.' }, { status: 400 })
  }

  try {
    const r = await generateOnePager(company, props, logo)
    return NextResponse.json({
      slug: r.slug,
      xlsx: r.xlsx.toString('base64'),
      pptx: r.pptx.toString('base64'),
      warnings: r.warnings,
      summary: r.summary,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Could not build the files.' }, { status: 400 })
  }
}
