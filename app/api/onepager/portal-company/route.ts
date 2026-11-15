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
  const idsParam = new URL(request.url).searchParams.get('ids')
  if (idsParam) {
    const ids = idsParam.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200)
    if (!ids.length) return NextResponse.json({ error: 'bad ids' }, { status: 400 })
    const { data: picked } = await supabase
      .from('properties')
      .select('property_name,address,city,state,building_sqft,roof_sqft,company_id')
      .in('id', ids)
      .order('roof_sqft', { ascending: false })
    const cids = Array.from(new Set((picked ?? []).map((p: any) => p.company_id)))
    const { data: cos } = cids.length ? await supabase.from('companies').select('id,name').in('id', cids) : { data: [] as any[] }
    return NextResponse.json({
      name: cids.length === 1 ? (cos?.[0]?.name ?? '') : '',
      properties: (picked ?? []).map((p: any) => ({
        property: p.property_name || p.address,
        address: p.address,
        city: p.city ?? '',
        state: p.state ?? '',
        gla: p.building_sqft ?? p.roof_sqft ?? 0,
      })),
    })
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
