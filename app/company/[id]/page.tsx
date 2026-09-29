import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser, fmt } from '@/lib/auth'

export default async function CompanyPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireUser()
  const id = Number(params.id)
  if (!Number.isInteger(id)) notFound()

  const { data: company } = await supabase.from('companies').select('*').eq('id', id).single()
  if (!company) notFound()
  const { data: atlas } = await supabase.from('atlas_accounts').select('*').eq('company_id', id).maybeSingle()
  const { data: props } = await supabase
    .from('properties')
    .select('*')
    .eq('company_id', id)
    .order('roof_sqft', { ascending: false })

  const ids = (props ?? []).map((p) => p.id)
  const { data: evidence } = ids.length
    ? await supabase.from('evidence').select('*').in('property_id', ids).order('retrieved_at')
    : { data: [] as any[] }

  const total = (props ?? []).reduce((s, p) => s + (p.roof_sqft ?? 0), 0)
  const largest = props?.[0]?.roof_sqft

  return (
    <main>
      <p><Link href="/">← Ranked list</Link></p>
      <h1>{company.name}</h1>
      <p className="muted">
        {props?.length ?? 0} approved {props?.length === 1 ? 'property' : 'properties'} · largest roof{' '}
        {fmt(largest)} sq ft · total {fmt(total)} sq ft · status {company.status}
      </p>
      <dl className="grid">
        <div><dt>Billing state (Salesforce)</dt><dd>{company.billing_state ?? '—'}</dd></div>
        <div><dt>Industry (Salesforce, cut off in the PDF)</dt><dd>{company.industry ?? '—'}</dd></div>
        <div><dt>Salesforce owner</dt><dd>{company.sf_owner ?? '—'}</dd></div>
        <div><dt>Account type</dt><dd>{[company.sf_record_type, company.sf_type].filter(Boolean).join(' · ') || '—'}</dd></div>
        <div><dt>Parent account</dt><dd>{company.sf_parent_account ?? '—'}</dd></div>
        <div><dt>Created in Salesforce</dt><dd>{company.sf_created ?? '—'}</dd></div>
        <div><dt>Last activity</dt><dd>{company.sf_last_activity ?? '—'}</dd></div>
        <div><dt>On your lists</dt><dd>{[company.in_salesforce && 'Salesforce', company.in_210_list && '210 list'].filter(Boolean).join(' + ') || 'Neither (added from property files)'}</dd></div>
      </dl>
      {company.check_note && <p className="muted">Note: {company.check_note}</p>}
            {atlas && (
        <section className="card">
          <div className="row">
            <strong>Ratings (Atlas)</strong>
            <span className={`bucket ${atlas.bucket}`}>{atlas.bucket}</span>
            <span className="muted">rank {atlas.rank_in_bucket} in bucket {atlas.bucket}</span>
          </div>
          <dl className="grid">
            <div><dt>Overall confidence</dt><dd>{atlas.overall_confidence == null ? '—' : Number(atlas.overall_confidence).toFixed(2)}</dd></div>
            <div><dt>Qualifying rate</dt><dd>{atlas.qualifying_rate == null ? '—' : `${Math.round(Number(atlas.qualifying_rate) * 100)}%`}</dd></div>
            <div><dt>Addressable sq ft</dt><dd>{fmt(atlas.total_addressable_sqft)}</dd></div>
            <div><dt>Biggest building</dt><dd>{fmt(atlas.biggest_building_sqft)} sq ft</dd></div>
            <div><dt>Biggest building address</dt><dd>{atlas.biggest_building_address ?? '—'}</dd></div>
            <div><dt>Properties (total / qualifying)</dt><dd>{fmt(atlas.n_properties_total)} / {fmt(atlas.n_properties_qualifying)}</dd></div>
            <div><dt>Solar signal</dt><dd>{atlas.solar_signal_strength ?? '—'}</dd></div>
          </dl>
          {atlas.audit_flags && <p className="muted">Audit flags: {atlas.audit_flags}</p>}
        </section>
      )}
      {(props?.length ?? 0) === 0 && (
        <p className="muted">No properties on file yet. The daily research will look for qualifying roofs.</p>
      )}

      {(props ?? []).map((p) => {
        const ev = (evidence ?? []).filter((e: any) => e.property_id === p.id)
        const mapQ = encodeURIComponent(`${p.address}, ${p.city ?? ''} ${p.state} ${p.zip ?? ''}`)
        return (
          <section key={p.id} className="card">
            <div className="row">
              <strong>{p.property_name && p.property_name !== p.address ? `${p.property_name} · ` : ''}{p.address}</strong>
              <span className="muted">{[p.city, p.state, p.zip].filter(Boolean).join(', ')}</span>
              {p.confidence === 'verified' ? (
                <span className="badge ok">verified</span>
              ) : (
                <span className="badge warn">needs review</span>
              )}
              {p.is_campus_or_portfolio && <span className="badge warn">confirm largest roof</span>}
              <a href={`https://www.google.com/maps/search/?api=1&query=${mapQ}`} target="_blank" rel="noreferrer">Map ↗</a>
            </div>

            <dl className="grid">
              <div><dt>Roof (sq ft)</dt><dd>{fmt(p.roof_sqft)}</dd></div>
              <div><dt>Roof basis</dt><dd>{p.roof_basis ?? '—'}</dd></div>
              <div><dt>Building (sq ft)</dt><dd>{fmt(p.building_sqft)}</dd></div>
              <div><dt>Buildings</dt><dd>{p.building_count ?? '—'}</dd></div>
              <div><dt>Stories</dt><dd>{p.stories ?? '—'}</dd></div>
              <div><dt>Solar suitability</dt><dd>{p.roof_suitability}</dd></div>
              <div><dt>Existing solar</dt><dd>{p.has_existing_solar == null ? 'not checked' : p.has_existing_solar ? 'yes' : 'no'}</dd></div>
              <div><dt>Roof control</dt><dd>{p.control_basis ?? '—'}</dd></div>
              <div><dt>Deal</dt><dd>{[p.deal_type, p.deal_date].filter(Boolean).join(' · ') || 'not recorded'}</dd></div>
              <div><dt>Parcel ID</dt><dd>{p.parcel_id ?? '—'}</dd></div>
              <div><dt>Est. system (kW)</dt><dd>{fmt(p.est_system_kw)}</dd></div>
              <div><dt>Est. annual kWh</dt><dd>{fmt(p.est_annual_kwh)}</dd></div>
              <div><dt>Est. annual savings</dt><dd>{p.est_annual_savings_usd == null ? '—' : `$${fmt(p.est_annual_savings_usd)}`}</dd></div>
            </dl>
            <p className="muted" style={{ fontSize: 12 }}>
              Solar figures are estimates, not quotes.{p.notes ? ` Notes: ${p.notes}` : ''}
            </p>

            {ev.length > 0 && (
              <details>
                <summary>Sources ({ev.length})</summary>
                <ul>
                  {ev.map((e: any) => (
                    <li key={e.id}>
                      {e.field}: {e.value} —{' '}
                      {e.source_url ? (
                        <a href={e.source_url} target="_blank" rel="noreferrer">{e.source_name}</a>
                      ) : (
                        <span>{e.source_name}</span>
                      )}{' '}
                      <span className="muted">({String(e.retrieved_at).slice(0, 10)})</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )
      })}
    </main>
  )
}