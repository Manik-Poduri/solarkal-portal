import { requireUser } from '@/lib/auth'
import { REGION_NAMES } from '@/lib/onepager/model'
import OnePagerBuilder from '@/components/OnePagerBuilder'

export default async function OnePagerPage({ searchParams }: { searchParams?: { company?: string; props?: string } }) {
  const { supabase } = await requireUser()
  const { data } = await supabase
    .from('ranked_companies')
    .select('company_id,name,property_count')
    .gt('property_count', 0)
    .order('name')
  const companies = (data ?? []).map((c: any) => ({ id: c.company_id as number, name: c.name as string, n: c.property_count as number }))
  const initialId = Number(searchParams?.company)
  const initialProps = /^[0-9,]+$/.test(searchParams?.props ?? '') ? searchParams?.props : undefined
  return <OnePagerBuilder companies={companies} regions={REGION_NAMES} initialId={Number.isInteger(initialId) && initialId > 0 ? initialId : undefined} initialProps={initialProps} />
}
