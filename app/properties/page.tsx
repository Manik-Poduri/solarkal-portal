import { requireUser } from '@/lib/auth'
import PropertiesExplorer from '@/components/PropertiesExplorer'

export default async function PropertiesPage() {
  const { supabase } = await requireUser()

  const [props, ranked] = await Promise.all([
    supabase
      .from('properties')
      .select('id,company_id,property_name,address,city,state,roof_sqft,building_sqft,property_score,sqft_source,ownership_status,validation_verdict,building_type,source_url')
      .eq('passes_gates', true)
      .limit(5000),
    supabase
      .from('ranked_companies')
      .select('company_id,name,tier,account_score,hold_reason,sf_owner')
      .limit(5000),
  ])

  const coBy = new Map((ranked.data ?? []).map((c: any) => [c.company_id, c]))
  const rows = (props.data ?? []).map((p: any) => {
    const c: any = coBy.get(p.company_id) ?? {}
    return {
      ...p,
      company_name: c.name ?? '',
      tier: c.tier ?? null,
      account_score: c.account_score ?? null,
      sf_owner: c.sf_owner ?? null,
      source_only: String(c.hold_reason ?? '').startsWith('Source list only'),
    }
  })

  return <PropertiesExplorer rows={rows} />
}
