import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// Properties already approved in the portal for one company, shaped for the one-pager builder.
export async function GET(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email?.toLowerCase().endsWith('@solarkal.com')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const [{ data: company }, { data: props }] = await Promise.all([
    supabase.from('companies').select('name').eq('id', id).single(),
    supabase
      .from('properties')
      .select('property_name,address,city,state,building_sqft,roof_sqft')
      .eq('company_id', id)
      .order('roof_sqft', { ascending: false }),
  ])
  return NextResponse.json({
    name: company?.name ?? '',
    properties: (props ?? []).map((p: any) => ({
      property: p.property_name || p.address,
      address: p.address,
      city: p.city ?? '',
      state: p.state ?? '',
      gla: p.building_sqft ?? p.roof_sqft ?? 0,
    })),
  })
}
