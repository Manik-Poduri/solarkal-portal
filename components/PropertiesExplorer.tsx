'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any

const nf = (n: any) => (n == null || n === '' ? '—' : Number(n).toLocaleString('en-US'))
const STATES = ['NJ', 'NY', 'IL', 'MD', 'MA']
const PAGE = 25
const MAX_SELECT = 200

const SORTS: Record<string, { label: string; val: (r: Row) => number | string }> = {
  score: { label: 'Property score', val: (r) => Number(r.property_score ?? -1) },
  roof: { label: 'Roof sq ft', val: (r) => Number(r.roof_sqft ?? -1) },
  account: { label: 'Account score', val: (r) => Number(r.account_score ?? -1) },
  company: { label: 'Company (A–Z)', val: (r) => String(r.company_name).toLowerCase() },
}

const csvCell = (v: any) => {
  const t = v == null ? '' : String(v)
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}
function downloadCsv(name: string, header: string[], data: any[][]) {
  const text = '﻿' + [header, ...data].map((row) => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function PropertiesExplorer({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [tier, setTier] = useState('')
  const [data, setData] = useState('')
  const [roofData, setRoofData] = useState('')
  const [minRoof, setMinRoof] = useState('')
  const [sort, setSort] = useState('score')
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState<Set<number>>(new Set())

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const min = Number(minRoof.replace(/,/g, '')) || 0
    const out = rows.filter(
      (r) =>
        (!needle || `${r.company_name} ${r.property_name ?? ''} ${r.address ?? ''} ${r.city ?? ''}`.toLowerCase().includes(needle)) &&
        (!state || r.state === state) &&
        (!tier || r.tier === tier) &&
        (!data || (data === 'validated' ? !r.source_only : r.source_only)) &&
        (!roofData || (r.sqft_source ?? 'estimated') === roofData) &&
        (!min || Number(r.roof_sqft ?? 0) >= min)
    )
    const f = SORTS[sort].val
    out.sort((a, b) => {
      const x = f(a), y = f(b)
      if (typeof x === 'string' || typeof y === 'string') return String(x).localeCompare(String(y)) || Number(b.property_score ?? 0) - Number(a.property_score ?? 0)
      return y - x || String(a.company_name).localeCompare(String(b.company_name))
    })
    return out
  }, [rows, q, state, tier, data, roofData, minRoof, sort])

  useEffect(() => { setPage(1) }, [q, state, tier, data, roofData, minRoof, sort])

  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const cur = Math.min(page, pages)
  const start = (cur - 1) * PAGE
  const slice = list.slice(start, start + PAGE)
  const totalRoof = list.reduce((s, r) => s + Number(r.roof_sqft ?? 0), 0)
  const nCompanies = new Set(list.map((r) => r.company_id)).size

  const toggle = (id: number) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else if (n.size < MAX_SELECT) n.add(id)
      return n
    })
  const selectView = () => setSel(new Set(list.slice(0, MAX_SELECT).map((r) => r.id)))
  const selIds = Array.from(sel)

  const exportCsv = () =>
    downloadCsv(
      `solarkal-properties-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Company', 'Tier', 'Property', 'Address', 'City', 'State', 'Roof sq ft', 'Property score', 'Roof data', 'Ownership', 'Validation', 'Property type', 'Data', 'Source'],
      list.map((r) => [r.company_name, r.tier, r.property_name, r.address, r.city, r.state, r.roof_sqft, r.property_score == null ? '' : Number(r.property_score).toFixed(2), r.sqft_source, r.ownership_status, r.validation_verdict, r.building_type, r.source_only ? 'Source list only' : 'Validated', r.source_url])
    )

  return (
    <main>
      <h1>Properties</h1>
      <p className="muted">
        Every property that passed the checks, across all companies. Filter it, tick the ones you want, and build a one-pager from just those. You can mix companies or pick a single building.
      </p>

      <div className="cards">
        <div className="stat"><div className="stat-label">Properties in view</div><div className="stat-value">{nf(list.length)}</div></div>
        <div className="stat"><div className="stat-label">Roof sq ft in view</div><div className="stat-value">{nf(totalRoof)}</div></div>
        <div className="stat"><div className="stat-label">Companies in view</div><div className="stat-value">{nf(nCompanies)}</div></div>
        <div className="stat"><div className="stat-label">Selected</div><div className="stat-value">{nf(sel.size)}</div></div>
      </div>

      <div className="filters">
        <input placeholder="Search company, property or city" value={q} onChange={(e) => setQ(e.target.value)} />
        <label>State
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Tier
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">All</option>
            <option>Tier 1</option>
            <option>Tier 2</option>
            <option>Tier 3</option>
          </select>
        </label>
        <label>Roof data
          <select value={roofData} onChange={(e) => setRoofData(e.target.value)}>
            <option value="">All</option>
            <option value="verified">Verified</option>
            <option value="corrected">Corrected</option>
            <option value="estimated">Estimated</option>
          </select>
        </label>
        <label>Data
          <select value={data} onChange={(e) => setData(e.target.value)}>
            <option value="">All</option>
            <option value="validated">Validated</option>
            <option value="source">Source list only</option>
          </select>
        </label>
        <label>Min roof sq ft
          <input style={{ width: 110 }} value={minRoof} onChange={(e) => setMinRoof(e.target.value)} placeholder="any" />
        </label>
        <label>Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        {(q || state || tier || data || roofData || minRoof) && (
          <button className="secondary" onClick={() => { setQ(''); setState(''); setTier(''); setData(''); setRoofData(''); setMinRoof('') }}>Clear filters</button>
        )}
      </div>

      <div className="row" style={{ margin: '10px 0' }}>
        <button className="secondary" onClick={selectView} disabled={list.length === 0}>Select all in view{list.length > MAX_SELECT ? ` (first ${MAX_SELECT})` : ''}</button>
        <button className="secondary" onClick={() => setSel(new Set())} disabled={sel.size === 0}>Clear selection</button>
        {sel.size > 0 ? (
          <Link className="btn" href={`/onepager?props=${selIds.join(',')}`}>Build one-pager from {sel.size} selected →</Link>
        ) : (
          <span className="muted small">Tick properties to build a one-pager from them.</span>
        )}
        <button className="secondary" onClick={exportCsv} disabled={list.length === 0}>Download CSV ({nf(list.length)})</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Company</th>
              <th>Property</th>
              <th>City</th>
              <th>State</th>
              <th className="num">Roof sq ft</th>
              <th className="num">Score</th>
              <th>Roof data</th>
              <th>Ownership</th>
              <th>Data</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label="Select property" /></td>
                <td className="acct"><Link href={`/company/${r.company_id}`}>{r.company_name}</Link></td>
                <td>{r.property_name || r.address}</td>
                <td>{r.city || '—'}</td>
                <td>{r.state}</td>
                <td className="num">{nf(r.roof_sqft)}</td>
                <td className="num">{r.property_score == null ? '—' : Number(r.property_score).toFixed(2)}</td>
                <td><span className={`badge ${r.sqft_source === 'verified' || r.sqft_source === 'corrected' ? 'ok' : 'warn'}`}>{r.sqft_source ?? 'estimated'}</span></td>
                <td>{r.ownership_status ?? '—'}</td>
                <td>{r.source_only ? <span className="badge warn">source list only</span> : <span className="badge ok">validated</span>}</td>
                <td><Link href={`/onepager?props=${r.id}`}>One-pager</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length === 0 && <p className="muted">No properties match these filters.</p>}

      {list.length > 0 && (
        <div className="pager">
          <span className="muted small">Showing {start + 1}–{Math.min(start + PAGE, list.length)} of {nf(list.length)}</span>
          <div className="pager-btns">
            <button disabled={cur === 1} onClick={() => setPage(cur - 1)}>← Prev</button>
            <span className="muted small" style={{ padding: '0 8px' }}>Page {cur} of {pages}</span>
            <button disabled={cur === pages} onClick={() => setPage(cur + 1)}>Next →</button>
          </div>
        </div>
      )}
    </main>
  )
}
