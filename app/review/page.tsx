import { redirect } from 'next/navigation'
import { requireUser, fmt } from '@/lib/auth'
import { approve, reject } from './actions'

const GATE_LABELS: Record<string, string> = {
  gate1_state: '1 In target state',
  gate2_size: '2 Roof ≥ 100k sq ft',
  gate3_not_on_list: '3 Tracked or new company',
  gate4_controls_roof: '4 Owns/controls roof',
  gate5_deal_2021_plus: '5 Deal 2021+',
  gate6_no_solar: '6 No existing solar',
  gate7_suitability: '7 Roof suitability',
}

export default async function ReviewPage() {
  const { supabase, role } = await requireUser()
  if (role !== 'approver') redirect('/')

  const { data: pending } = await supabase
    .from('proposals').select('*').eq('status', 'pending').order('created_at', { ascending: false })
  const { data: screened } = await supabase
    .from('screened_out').select('*').order('created_at', { ascending: false }).limit(50)

  return (
    <main>
      <h1>Review queue</h1>
      <p className="muted">
        Nothing below is live until you approve it. Rejected items are remembered and won&apos;t be proposed again.
      </p>

      {(pending ?? []).length === 0 && <p className="muted">No pending proposals.</p>}

      {(pending ?? []).map((p) => {
        const d = p.payload ?? {}
        return (
          <section key={p.id} className="card">
            <div className="row">
              <strong>{p.company_name}</strong>
              <span className="badge">{p.kind.replace('_', ' ')}</span>
              {d.confidence === 'verified' ? (
                <span className="badge ok">two sources agree</span>
              ) : (
                <span className="badge warn">needs review</span>
              )}
              {d.is_campus_or_portfolio && <span className="badge warn">confirm largest roof</span>}
            </div>

            <dl className="grid">
              <div><dt>Address</dt><dd>{[d.address, d.city, d.state, d.zip].filter(Boolean).join(', ') || '—'}</dd></div>
              <div><dt>Roof (sq ft)</dt><dd>{fmt(d.roof_sqft)}</dd></div>
              <div><dt>Stories / suitability</dt><dd>{d.stories ?? '—'} / {d.roof_suitability ?? '—'}</dd></div>
              <div><dt>Roof control</dt><dd>{d.control_basis ?? '—'}</dd></div>
              <div><dt>Deal</dt><dd>{[d.deal_type, d.deal_date].filter(Boolean).join(' · ') || '—'}</dd></div>
              <div><dt>Roof readings</dt><dd>{Array.isArray(d.roof_sqft_readings) ? d.roof_sqft_readings.map((r: any) => `${r.source}: ${fmt(r.sqft)}`).join('; ') : '—'}</dd></div>
            </dl>

            <div className="row" style={{ margin: '6px 0' }}>
              {Object.entries(p.gate_results ?? {}).map(([k, v]) => (
                <span key={k} className={`badge ${v === 'pass' ? 'ok' : v === 'unknown' ? 'warn' : ''}`}>
                  {GATE_LABELS[k] ?? k}: {String(v)}
                </span>
              ))}
            </div>

            <details>
              <summary>Sources ({(p.sources ?? []).length})</summary>
              <ul>
                {(p.sources ?? []).map((s: any, i: number) => (
                  <li key={i}>
                    <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a>{' '}
                    <span className="muted">{s.field ? `(${s.field})` : ''}</span>
                  </li>
                ))}
              </ul>
            </details>

            <div className="row" style={{ marginTop: 10 }}>
              <form action={approve}>
                <input type="hidden" name="id" value={p.id} />
                <button>Approve</button>
              </form>
              <form action={reject} className="row">
                <input type="hidden" name="id" value={p.id} />
                <input name="reason" placeholder="Reason for rejecting" required />
                <button className="danger">Reject</button>
              </form>
            </div>
          </section>
        )
      })}

      <h2>Screened out (recent)</h2>
      <p className="muted">Failed a hard gate and never reached the queue. Listed here in case you disagree.</p>
      <table>
        <thead><tr><th>Company</th><th>Address</th><th>Failed gate</th></tr></thead>
        <tbody>
          {(screened ?? []).map((s) => (
            <tr key={s.id}>
              <td>{s.company_name}</td>
              <td>{s.address}</td>
              <td>{GATE_LABELS[s.failed_gate] ?? s.failed_gate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}