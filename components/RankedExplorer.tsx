'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any

const nf = (n: any) => (n == null || n === '' ? '—' : Number(n).toLocaleString('en-US'))
const pct = (n: any) => (n == null ? '—' : `${Math.round(Number(n) * 100)}%`)
const STATES = ['NJ', 'NY', 'IL', 'MD', 'MA']

const largestOf = (r: Row): number | null =>
  Math.max(Number(r.largest_roof_sqft ?? 0), Number(r.atlas?.biggest_building_sqft ?? 0)) || null

const confLabel = (c: number | null) => (c == null ? 'No rating' : c >= 0.75 ? 'High' : c >= 0.5 ? 'Medium' : 'Low')
const confTone = (c: number | null) => (c == null ? '' : c >= 0.75 ? 'ok' : c >= 0.5 ? 'warn' : 'bad')

const TABS = [
  { id: 'all', label: 'All accounts', test: (_r: Row) => true },
  { id: 'A', label: 'Bucket A', test: (r: Row) => r.atlas?.bucket === 'A' },
  { id: 'B', label: 'Bucket B', test: (r: Row) => r.atlas?.bucket === 'B' },
  { id: 'C', label: 'Bucket C', test: (r: Row) => r.atlas?.bucket === 'C' },
  { id: 'props', label: 'With loaded properties', test: (r: Row) => r.property_count > 0 },
  { id: 'flagged', label: 'Flagged', test: (r: Row) => !!r.atlas?.audit_flags || r.confirm_largest_roof },
]

const PAGE = 10

const SORTS: Record<string, { label: string; val: (r: Row) => number | string }> = {
  addressable: { label: 'Addressable sq ft', val: (r) => Number(r.atlas?.total_addressable_sqft ?? -1) },
  largest: { label: 'Largest roof', val: (r) => largestOf(r) ?? -1 },
  confidence: { label: 'Confidence', val: (r) => Number(r.atlas?.overall_confidence ?? -1) },
  qualifying: { label: 'Qualifying properties', val: (r) => Number(r.atlas?.n_properties_qualifying ?? -1) },
  name: { label: 'Name (A–Z)', val: (r) => String(r.name).toLowerCase() },
}

function Meter({ value, tone }: { value: number | null; tone?: string }) {
  const w = value == null ? 0 : Math.max(0, Math.min(1, value)) * 100
  return (
    <div className="meter">
      <div className={`meter-fill ${tone ?? ''}`} style={{ width: `${w}%` }} />
    </div>
  )
}

function Bucket({ b }: { b?: string | null }) {
  return <span className={`bucket ${b ?? ''}`}>{b ?? '—'}</span>
}

function Drawer({ r, onClose }: { r: Row; onClose: () => void }) {
  const a = r.atlas
  const conf = a?.overall_confidence == null ? null : Number(a.overall_confidence)
  const geo = a && a.n_properties_total ? Number(a.n_properties_geocoded) / Number(a.n_properties_total) : null
  const lookups = Number(a?.n_solar_lookups ?? 0)
  const checked = a ? Number(a.n_solar_live_match) + Number(a.n_solar_live_no_match) + Number(a.n_solar_regional) : 0
  const solarParts = a
    ? [
        { k: 'Live match', v: Number(a.n_solar_live_match), c: 'c1' },
        { k: 'Live, no match', v: Number(a.n_solar_live_no_match), c: 'c2' },
        { k: 'Regional data only', v: Number(a.n_solar_regional), c: 'c3' },
        { k: 'No public source', v: Number(a.n_solar_no_public_source), c: 'c4' },
      ]
    : []
  const qs: Record<string, number> = a?.qualifying_sqft ?? {}
  const qMax = Math.max(1, ...Object.values(qs).map(Number))

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={r.name}>
        <div className="drawer-head">
          <div>
            <h2>{r.name}</h2>
            <div className="row">
              <Bucket b={a?.bucket} />
              {a && <span className="muted">Rank {a.rank_in_bucket} in bucket {a.bucket}</span>}
              {r.confirm_largest_roof && <span className="badge warn">confirm largest roof</span>}
            </div>
          </div>
          <button className="secondary" onClick={onClose}>Close ✕</button>
        </div>

        <p><Link href={`/company/${r.company_id}`}>Open full page with property list →</Link></p>

        {!a && <p className="muted">No Atlas rating for this account yet. Salesforce details and loaded properties are below.</p>}

        {a && (
          <>
            <h3>Ratings</h3>
            <div className="rating-main">
              <div>
                <div className="big">{conf == null ? '—' : conf.toFixed(2)}</div>
                <span className={`badge ${confTone(conf)}`}>{confLabel(conf)} confidence</span>
              </div>
              <div style={{ flex: 1 }}><Meter value={conf} tone={confTone(conf)} /></div>
            </div>
            <div className="mini-meters">
              <div><span>Properties that qualify</span><b>{pct(a.qualifying_rate)}</b><Meter value={Number(a.qualifying_rate)} /></div>
              <div><span>Properties geocoded</span><b>{pct(geo)}</b><Meter value={geo} /></div>
              <div><span>Solar lookups with a data source</span><b>{lookups ? pct(checked / lookups) : '—'}</b><Meter value={lookups ? checked / lookups : null} /></div>
            </div>
            <p className="muted small">
              Solar signal strength: <b>{a.solar_signal_strength ?? '—'}</b>. &quot;No public source&quot; means solar status could not be checked for that property.
            </p>

            {a.audit_flags && <div className="callout">⚠ Audit flags: {a.audit_flags}</div>}

            <h3>Details</h3>
            <dl className="grid">
              <div><dt>Addressable sq ft</dt><dd>{nf(a.total_addressable_sqft)}</dd></div>
              <div><dt>Biggest building</dt><dd>{nf(a.biggest_building_sqft)} sq ft</dd></div>
              <div><dt>Biggest building address</dt><dd>{a.biggest_building_address ?? '—'}</dd></div>
              <div><dt>Properties (total / qualifying)</dt><dd>{nf(a.n_properties_total)} / {nf(a.n_properties_qualifying)}</dd></div>
              <div><dt>Buildings (total / qualifying)</dt><dd>{nf(a.n_buildings_total)} / {nf(a.n_buildings_qualifying)}</dd></div>
              <div><dt>Data sources</dt><dd>{a.ingest_paths ? String(a.ingest_paths).replace(/_/g, ' ').toLowerCase().split(',').join(', ') : '—'}</dd></div>
            </dl>

            <h3>Qualifying roof sq ft by state</h3>
            <div className="bars">
              {[...STATES, 'other'].map((s) => (
                <div key={s} className="bar-row">
                  <span>{s === 'other' ? 'Other' : s}</span>
                  <div className="meter"><div className="meter-fill" style={{ width: `${(Number(qs[s] ?? 0) / qMax) * 100}%` }} /></div>
                  <b>{nf(qs[s] ?? 0)}</b>
                </div>
              ))}
            </div>

            <h3>Solar lookups ({nf(lookups)})</h3>
            <div className="stack">
              {solarParts.map((p) => (
                <div key={p.k} className={p.c} style={{ width: `${lookups ? (p.v / lookups) * 100 : 0}%` }} title={`${p.k}: ${p.v}`} />
              ))}
            </div>
            <div className="legend">
              {solarParts.map((p) => (
                <span key={p.k}><i className={p.c} /> {p.k} {nf(p.v)}</span>
              ))}
            </div>
          </>
        )}

        <h3>Loaded properties</h3>
        <dl className="grid">
          <div><dt>Properties on file</dt><dd>{r.property_count}</dd></div>
          <div><dt>Largest loaded roof</dt><dd>{nf(r.largest_roof_sqft)} sq ft</dd></div>
          <div><dt>Total loaded roof</dt><dd>{nf(r.total_roof_sqft)} sq ft</dd></div>
        </dl>

        <h3>Company (Salesforce)</h3>
        <dl className="grid">
          <div><dt>HQ / billing state</dt><dd>{r.billing_state ?? '—'}</dd></div>
          <div><dt>Salesforce owner</dt><dd>{r.sf_owner ?? '—'}</dd></div>
          <div><dt>Account type</dt><dd>{[r.sf_record_type, r.sf_type].filter(Boolean).join(' · ') || '—'}</dd></div>
          <div><dt>Parent account</dt><dd>{r.sf_parent_account ?? '—'}</dd></div>
          <div><dt>Created</dt><dd>{r.sf_created ?? '—'}</dd></div>
          <div><dt>Last activity</dt><dd>{r.sf_last_activity ?? '—'}</dd></div>
          <div><dt>On lists</dt><dd>{[r.in_salesforce && 'Salesforce', r.in_210_list && '210 list'].filter(Boolean).join(' + ') || '—'}</dd></div>
          <div><dt>Status</dt><dd>{r.status}</dd></div>
        </dl>
        {r.check_note && <p className="muted small">Note: {r.check_note}</p>}
      </aside>
    </>
  )
}

export default function RankedExplorer({ rows }: { rows: Row[] }) {
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('addressable')
  const [state, setState] = useState('')
  const [signal, setSignal] = useState('')
  const [minConf, setMinConf] = useState(0)
  const [sel, setSel] = useState<Row | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setSel(null)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, rows.filter(t.test).length])), [rows])

  const list = useMemo(() => {
    const t = TABS.find((x) => x.id === tab)!
    const needle = q.trim().toLowerCase()
    const out = rows.filter(
      (r) =>
        t.test(r) &&
        (!needle || r.name.toLowerCase().includes(needle)) &&
        (!state || Number(r.atlas?.qualifying_sqft?.[state] ?? 0) > 0) &&
        (!signal || r.atlas?.solar_signal_strength === signal) &&
        (!minConf || Number(r.atlas?.overall_confidence ?? 0) >= minConf)
    )
    const f = SORTS[sort].val
    out.sort((a, b) => {
      const x = f(a), y = f(b)
      if (typeof x === 'string' || typeof y === 'string') return String(x).localeCompare(String(y))
      return y - x || String(a.name).localeCompare(String(b.name))
    })
    return out
  }, [rows, tab, q, sort, state, signal, minConf])

  useEffect(() => { setPage(1) }, [tab, q, sort, state, signal, minConf])

  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const cur = Math.min(page, pages)
  const start = (cur - 1) * PAGE
  const slice = list.slice(start, start + PAGE)
  const pageNums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - cur) <= 2)

  const totalAddr = list.reduce((s, r) => s + Number(r.atlas?.total_addressable_sqft ?? 0), 0)
  const rated = list.filter((r) => r.atlas?.overall_confidence != null)
  const avgConf = rated.length ? rated.reduce((s, r) => s + Number(r.atlas.overall_confidence), 0) / rated.length : null

  return (
    <main>
      <h1>Account Ratings</h1>
      <p className="muted">
        Companies ranked by addressable roof sq ft. Click any company to see its ratings and company details.
      </p>

      <div className="cards">
        <div className="stat"><div className="stat-label">Accounts in view</div><div className="stat-value">{nf(list.length)}</div></div>
        <div className="stat"><div className="stat-label">Addressable sq ft</div><div className="stat-value">{nf(totalAddr)}</div></div>
        <div className="stat"><div className="stat-label">Average confidence</div><div className="stat-value">{avgConf == null ? '—' : avgConf.toFixed(2)}</div></div>
        <div className="stat"><div className="stat-label">Bucket A in view</div><div className="stat-value">{nf(list.filter((r) => r.atlas?.bucket === 'A').length)}</div></div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label} <span className="count">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="filters">
        <input placeholder="Search companies" value={q} onChange={(e) => setQ(e.target.value)} />
        <label>Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label>State (qualifying roofs)
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Solar signal
          <select value={signal} onChange={(e) => setSignal(e.target.value)}>
            <option value="">Any</option>
            {['property_level', 'mixed', 'regional', 'unavailable'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </label>
        <label>Min confidence {minConf ? minConf.toFixed(2) : 'any'}
          <input type="range" min={0} max={0.9} step={0.05} value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} />
        </label>
        {(q || state || signal || minConf > 0) && (
          <button className="secondary" onClick={() => { setQ(''); setState(''); setSignal(''); setMinConf(0) }}>Clear filters</button>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bucket</th>
              <th className="num">Ranking</th>
              <th className="num">Addressable sq ft</th>
              <th>Name of the company</th>
              <th className="num">No. of properties</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={r.company_id} className={`click ${sel?.company_id === r.company_id ? 'sel' : ''}`} onClick={() => setSel(r)}>
                <td><Bucket b={r.atlas?.bucket} /></td>
                <td className="num"><span className="rank">{start + i + 1}</span></td>
                <td className="num">{nf(r.atlas?.total_addressable_sqft)}</td>
                <td className="acct">{r.name}</td>
                <td className="num">{nf(r.atlas?.n_properties_total ?? r.property_count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length === 0 && <p className="muted">No accounts match these filters.</p>}

      {list.length > 0 && (
        <div className="pager">
          <span className="muted small">Showing {start + 1}–{Math.min(start + PAGE, list.length)} of {nf(list.length)}</span>
          <div className="pager-btns">
            <button disabled={cur === 1} onClick={() => setPage(cur - 1)}>← Prev</button>
            {pageNums.map((n, k) => (
              <span key={n} style={{ display: 'contents' }}>
                {k > 0 && n - pageNums[k - 1] > 1 && <span className="muted">…</span>}
                <button className={n === cur ? 'on' : ''} onClick={() => setPage(n)}>{n}</button>
              </span>
            ))}
            <button disabled={cur === pages} onClick={() => setPage(cur + 1)}>Next →</button>
          </div>
        </div>
      )}

      {sel && <Drawer r={sel} onClose={() => setSel(null)} />}
    </main>
  )
}