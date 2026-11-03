'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any

const nf = (n: any) => (n == null || n === '' ? '—' : Number(n).toLocaleString('en-US'))
const STATES = ['NJ', 'NY', 'IL', 'MD', 'MA']

// Companies loaded from the unchecked source list carry this hold reason.
const sourceOnly = (r: Row) => String(r.hold_reason ?? '').startsWith('Source list only')
const tierNum = (r: Row) => (r.tier === 'Tier 1' ? '1' : r.tier === 'Tier 2' ? '2' : r.tier === 'Tier 3' ? '3' : '—')
const tierClass = (r: Row) => (r.tier === 'Tier 1' ? 'A' : r.tier === 'Tier 2' ? 'B' : 'C')

const TABS = [
  { id: 'all', label: 'All accounts', test: (_r: Row) => true },
  { id: 't1', label: 'Tier 1', test: (r: Row) => r.tier === 'Tier 1' },
  { id: 't2', label: 'Tier 2', test: (r: Row) => r.tier === 'Tier 2' },
  { id: 't3', label: 'Tier 3', test: (r: Row) => r.tier === 'Tier 3' },
  { id: 'valid', label: 'Validated only', test: (r: Row) => !sourceOnly(r) },
  { id: 'flagged', label: 'Flagged', test: (r: Row) => !!r.confirm_largest_roof || (!!r.hold_reason && !sourceOnly(r)) },
]

const PAGE = 10

const liveContacts = (r: Row) => (r.contacts ?? []).filter((c: any) => !c.possibly_moved)

const csvCell = (v: any) => {
  const t = v == null ? '' : String(v)
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}
function downloadCsv(name: string, header: string[], data: any[][]) {
  const text = '\uFEFF' + [header, ...data].map((row) => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const SORTS: Record<string, { label: string; val: (r: Row) => number | string }> = {
  score: { label: 'Account score', val: (r) => Number(r.account_score ?? -1) },
  largest: { label: 'Largest roof', val: (r) => Number(r.largest_roof_sqft ?? -1) },
  total: { label: 'Total roof sq ft', val: (r) => Number(r.total_roof_sqft ?? -1) },
  qualifying: { label: 'Qualifying properties', val: (r) => Number(r.n_qualifying ?? r.property_count ?? -1) },
  name: { label: 'Name (A–Z)', val: (r) => String(r.name).toLowerCase() },
}

function Tier({ r }: { r: Row }) {
  return <span className={`bucket ${tierClass(r)}`} title={r.tier ?? 'No tier'}>{tierNum(r)}</span>
}

function Drawer({ r, onClose }: { r: Row; onClose: () => void }) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={r.name}>
        <div className="drawer-head">
          <div>
            <h2>{r.name}</h2>
            <div className="row">
              <Tier r={r} />
              <span className="muted">{r.tier ?? 'No tier'}</span>
              {sourceOnly(r) ? <span className="badge warn">source list only</span> : <span className="badge ok">validated</span>}
              {r.confirm_largest_roof && <span className="badge warn">confirm largest roof</span>}
            </div>
          </div>
          <button className="secondary" onClick={onClose}>Close ✕</button>
        </div>

        <p><Link href={`/company/${r.company_id}`}>Open full page with property list →</Link></p>

        <h3>Ranking</h3>
        <dl className="grid">
          <div><dt>Account score</dt><dd>{r.account_score == null ? '—' : Number(r.account_score).toFixed(2)}</dd></div>
          <div><dt>Qualifying properties</dt><dd>{nf(r.n_qualifying ?? r.property_count)}</dd></div>
          <div><dt>Approach verdict</dt><dd>{r.approach_verdict ?? '—'}</dd></div>
          <div><dt>Who to pitch</dt><dd>{r.who_to_pitch ?? '—'}</dd></div>
        </dl>
        {r.hold_reason && <div className="callout">⚠ {r.hold_reason}</div>}

        <h3>Loaded properties</h3>
        <dl className="grid">
          <div><dt>Properties on file</dt><dd>{r.property_count}</dd></div>
          <div><dt>Largest loaded roof</dt><dd>{nf(r.largest_roof_sqft)} sq ft</dd></div>
          <div><dt>Total loaded roof</dt><dd>{nf(r.total_roof_sqft)} sq ft</dd></div>
          <div><dt>All roofs verified</dt><dd>{r.all_verified ? 'Yes' : 'No'}</dd></div>
        </dl>

        <h3>Contacts ({nf(r.n_contacts ?? 0)})</h3>
        {r.best_contact && <p className="small"><strong>Best contact to pitch:</strong> {r.best_contact}</p>}
        {(r.contacts ?? []).length === 0 ? (
          <p className="muted small">No named contacts on file yet{r.sf_match_status === 'no_match' ? ' (company is not in Salesforce)' : ''}.</p>
        ) : (
          <ul className="small" style={{ paddingLeft: 18, margin: '6px 0' }}>
            {(r.contacts as any[])
              .slice()
              .sort((a, b) => Number(!!a.possibly_moved) - Number(!!b.possibly_moved) || String(a.contact_name).localeCompare(String(b.contact_name)))
              .map((c, i) => (
                <li key={i} style={{ marginBottom: 4, opacity: c.possibly_moved ? 0.55 : 1 }}>
                  <strong>{c.contact_name}</strong>{c.title ? `, ${c.title}` : ''}
                  {c.possibly_moved && <span className="badge warn" style={{ marginLeft: 6 }}>may have moved</span>}
                  <br />
                  <span className="muted">{[c.email, c.phone].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
          </ul>
        )}

        <h3>Company (Salesforce)</h3>
        <dl className="grid">
          <div><dt>Main state</dt><dd>{r.billing_state ?? '—'}</dd></div>
          <div><dt>Salesforce owner</dt><dd>{r.sf_owner ?? '—'}</dd></div>
          <div><dt>Salesforce account</dt><dd>{r.sf_account_name ?? (r.sf_match_status === 'no_match' ? 'Not in Salesforce' : '—')}</dd></div>
          <div><dt>Open opportunities</dt><dd>{r.sf_open_opps ?? '—'}</dd></div>
          <div><dt>Last opportunity stage</dt><dd>{r.sf_last_stage ?? '—'}</dd></div>
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
  const [sort, setSort] = useState('score')
  const [state, setState] = useState('')
  const [valid, setValid] = useState('')
  const [contact, setContact] = useState('')
  const [owner, setOwner] = useState('')
  const [sel, setSel] = useState<Row | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setSel(null)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const owners = useMemo(
    () => Array.from(new Set(rows.map((r) => r.sf_owner).filter(Boolean))).sort((a: any, b: any) => String(a).localeCompare(String(b))) as string[],
    [rows]
  )

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, rows.filter(t.test).length])), [rows])

  const list = useMemo(() => {
    const t = TABS.find((x) => x.id === tab)!
    const needle = q.trim().toLowerCase()
    const out = rows.filter(
      (r) =>
        t.test(r) &&
        (!needle || r.name.toLowerCase().includes(needle)) &&
        (!state || r.billing_state === state) &&
        (!valid || (valid === 'validated' ? !sourceOnly(r) : sourceOnly(r))) &&
        (!contact || (contact === 'has' ? Number(r.n_contacts ?? 0) > 0 : Number(r.n_contacts ?? 0) === 0)) &&
        (!owner || (owner === '__none' ? !r.sf_owner : r.sf_owner === owner))
    )
    const f = SORTS[sort].val
    out.sort((a, b) => {
      const x = f(a), y = f(b)
      if (typeof x === 'string' || typeof y === 'string') return String(x).localeCompare(String(y))
      return y - x || String(a.name).localeCompare(String(b.name))
    })
    return out
  }, [rows, tab, q, sort, state, valid, contact, owner])

  useEffect(() => { setPage(1) }, [tab, q, sort, state, valid, contact, owner])

  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const cur = Math.min(page, pages)
  const start = (cur - 1) * PAGE
  const slice = list.slice(start, start + PAGE)
  const pageNums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - cur) <= 2)

  const exportAccounts = () =>
    downloadCsv(
      `solarkal-ranked-accounts-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Rank', 'Tier', 'Account score', 'Company', 'Main state', 'Qualifying properties', 'Largest roof sq ft', 'Total roof sq ft', 'Data', 'Salesforce owner', 'Named contacts', 'Best contact to pitch', 'Approach verdict', 'Who to pitch'],
      list.map((r) => [r.rank, r.tier, r.account_score == null ? '' : Number(r.account_score).toFixed(2), r.name, r.billing_state, r.n_qualifying ?? r.property_count, r.largest_roof_sqft, r.total_roof_sqft, sourceOnly(r) ? 'Source list only' : 'Validated', r.sf_owner, r.n_contacts ?? 0, r.best_contact, r.approach_verdict, r.who_to_pitch])
    )

  const exportContacts = () =>
    downloadCsv(
      `solarkal-contacts-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Company', 'Tier', 'Rank', 'Account score', 'Salesforce owner', 'Contact name', 'Title', 'Email', 'Phone', 'Contact owner', 'May have moved'],
      list.flatMap((r) =>
        (r.contacts ?? []).map((c: any) => [r.name, r.tier, r.rank, r.account_score == null ? '' : Number(r.account_score).toFixed(2), r.sf_owner, c.contact_name, c.title, c.email, c.phone, c.contact_owner, c.possibly_moved ? 'Yes' : ''])
      )
    )

  const totalRoof = list.reduce((s, r) => s + Number(r.total_roof_sqft ?? 0), 0)
  const nValid = list.filter((r) => !sourceOnly(r)).length
  const nTier1 = list.filter((r) => r.tier === 'Tier 1').length

  return (
    <main>
      <h1>Account Ratings</h1>
      <p className="muted">
        Companies ranked by account score: the sum of each account&apos;s five best property scores (roof size × state grade × data confidence), plus a small bonus for extra properties. Click any company for details.
      </p>

      <div className="cards">
        <div className="stat"><div className="stat-label">Accounts in view</div><div className="stat-value">{nf(list.length)}</div></div>
        <div className="stat"><div className="stat-label">Qualifying roof sq ft</div><div className="stat-value">{nf(totalRoof)}</div></div>
        <div className="stat"><div className="stat-label">Validated accounts</div><div className="stat-value">{nf(nValid)}</div></div>
        <div className="stat"><div className="stat-label">Tier 1 in view</div><div className="stat-value">{nf(nTier1)}</div></div>
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
        <label>Main state
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Data
          <select value={valid} onChange={(e) => setValid(e.target.value)}>
            <option value="">All</option>
            <option value="validated">Validated</option>
            <option value="source">Source list only</option>
          </select>
        </label>
        <label>Contacts
          <select value={contact} onChange={(e) => setContact(e.target.value)}>
            <option value="">All</option>
            <option value="has">Has named contact</option>
            <option value="none">No named contact</option>
          </select>
        </label>
        <label>Salesforce owner
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">All</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
            <option value="__none">Not in Salesforce</option>
          </select>
        </label>
        {(q || state || valid || contact || owner) && (
          <button className="secondary" onClick={() => { setQ(''); setState(''); setValid(''); setContact(''); setOwner('') }}>Clear filters</button>
        )}
        <button className="secondary" onClick={exportAccounts} disabled={list.length === 0}>Download accounts CSV ({nf(list.length)})</button>
        <button className="secondary" onClick={exportContacts} disabled={list.length === 0}>Download contacts CSV</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tier</th>
              <th className="num">Ranking</th>
              <th className="num">Score</th>
              <th>Name of the company</th>
              <th className="num">No. of properties</th>
              <th className="num">Largest roof sq ft</th>
              <th className="num">Contacts</th>
              <th>Owner</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={r.company_id} className={`click ${sel?.company_id === r.company_id ? 'sel' : ''}`} onClick={() => setSel(r)}>
                <td><Tier r={r} /></td>
                <td className="num"><span className="rank">{start + i + 1}</span></td>
                <td className="num">{r.account_score == null ? '—' : Number(r.account_score).toFixed(2)}</td>
                <td className="acct">{r.name}</td>
                <td className="num">{nf(r.n_qualifying ?? r.property_count)}</td>
                <td className="num">{nf(r.largest_roof_sqft)}</td>
                <td className="num">{nf(r.n_contacts ?? 0)}</td>
                <td>{r.sf_owner ?? '—'}</td>
                <td>{sourceOnly(r) ? <span className="badge warn">source list only</span> : <span className="badge ok">validated</span>}</td>
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
