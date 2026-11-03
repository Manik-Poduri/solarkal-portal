import { requireUser } from '@/lib/auth'
import RankedExplorer from '@/components/RankedExplorer'

export default async function Home() {
  const { supabase } = await requireUser()

  const [ranked, atlas, details, contacts] = await Promise.all([
    supabase.from('ranked_companies').select('*').limit(5000),
    supabase.from('atlas_accounts').select('*').limit(5000),
    supabase
      .from('companies')
      .select('id,sf_record_type,sf_type,sf_parent_account,sf_created,sf_last_activity,in_210_list,in_salesforce,check_note,n_contacts,n_senior_contacts,best_contact,sf_account_name,sf_match_status,sf_open_opps,sf_last_stage')
      .limit(5000),
    supabase
      .from('company_contacts')
      .select('company_id,contact_name,title,email,phone,contact_owner,seniority,possibly_moved')
      .limit(5000),
  ])

  const atlasBy = new Map((atlas.data ?? []).map((a: any) => [a.company_id, a]))
  const detailBy = new Map((details.data ?? []).map((d: any) => [d.id, d]))
  const contactsBy = new Map<string, any[]>()
  for (const c of (contacts.data ?? []) as any[]) {
    const k = String(c.company_id)
    if (!contactsBy.has(k)) contactsBy.set(k, [])
    contactsBy.get(k)!.push(c)
  }

  const rows = (ranked.data ?? []).map((r: any) => ({
    ...r,
    ...(detailBy.get(r.company_id) ?? {}),
    atlas: atlasBy.get(r.company_id) ?? null,
    contacts: contactsBy.get(String(r.company_id)) ?? [],
  }))

  return <RankedExplorer rows={rows} />
}