import { requireUser } from '@/lib/auth'
import RankedExplorer from '@/components/RankedExplorer'

export default async function Home() {
  const { supabase } = await requireUser()

  const [ranked, atlas, details] = await Promise.all([
    supabase.from('ranked_companies').select('*').limit(5000),
    supabase.from('atlas_accounts').select('*').limit(5000),
    supabase
      .from('companies')
      .select('id,sf_record_type,sf_type,sf_parent_account,sf_created,sf_last_activity,in_210_list,in_salesforce,check_note')
      .limit(5000),
  ])

  const atlasBy = new Map((atlas.data ?? []).map((a: any) => [a.company_id, a]))
  const detailBy = new Map((details.data ?? []).map((d: any) => [d.id, d]))

  const rows = (ranked.data ?? []).map((r: any) => ({
    ...r,
    ...(detailBy.get(r.company_id) ?? {}),
    atlas: atlasBy.get(r.company_id) ?? null,
  }))

  return <RankedExplorer rows={rows} />
}