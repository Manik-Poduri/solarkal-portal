'use client'

import { useMemo, useRef, useState } from 'react'

type Row = {
  id: number
  property: string
  address: string
  city: string
  state: string
  gla: string
  region: string
  bess: 'Yes' | 'No'
  confidence?: 'high' | 'medium' | 'low'
  note?: string
  bessNote?: string
  bessConf?: 'high' | 'medium' | 'low'
}

type Result = {
  slug: string
  warnings: string[]
  summary: { properties: number; annual: number; assetValue: number; solar: number; bess: number; eligible: number; assetValueLabel: string }
  xlsxUrl: string
  pptxUrl: string
}

const nf = (n: number) => Math.round(n).toLocaleString('en-US')
const CHUNK = 10

// small CSV/TSV line splitter (handles "quoted, values")
function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((x) => x.trim())
  const out: string[] = []
  let cur = ''
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

function parsePasted(text: string, startId: number): { rows: Row[]; skipped: string[] } {
  const rows: Row[] = []
  const skipped: string[] = []
  let id = startId
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const c = splitLine(line)
      const glaRaw = c[c.length - 1]?.replace(/[, ]/g, '')
      const gla = Number(glaRaw)
      if (!(gla > 0)) {
        if (i > 0) skipped.push(line)
        return // header row or bad line
      }
      let property = '', address = '', city = '', state = ''
      if (c.length >= 5) [property, address, city, state] = c
      else if (c.length === 4) [property, city, state] = c
      else {
        skipped.push(line)
        return
      }
      rows.push({ id: id++, property, address, city, state: state.toUpperCase().slice(0, 2), gla: String(gla), region: '', bess: 'Yes' })
    })
  return { rows, skipped }
}

function b64Blob(b64: string, type: string) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type }))
}

export default function OnePagerBuilder({ companies, regions }: { companies: { id: number; name: string; n: number }[]; regions: string[] }) {
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [cap, setCap] = useState('6.0')
  const [bessLease, setBessLease] = useState('100000')
  const [contactName, setContactName] = useState('Adam Simensky')
  const [contactEmail, setContactEmail] = useState('Adam.Simensky@SolarKal.com')
  const [logo, setLogo] = useState<string | null>(null)
  const [logoName, setLogoName] = useState('')
  const [paste, setPaste] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [minGla, setMinGla] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState<'' | 'detect' | 'build'>('')
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const nextId = useRef(1)

  const missing = useMemo(() => rows.filter((r) => !r.region).length, [rows])
  const totalGla = useMemo(() => rows.reduce((s, r) => s + (Number(r.gla) || 0), 0), [rows])

  function addFromPaste() {
    const { rows: add, skipped } = parsePasted(paste, nextId.current)
    nextId.current += add.length
    setRows((r) => [...r, ...add])
    setPaste('')
    setResult(null)
    setMsg(
      add.length
        ? `Added ${add.length} ${add.length === 1 ? 'property' : 'properties'}.` + (skipped.length ? ` Skipped ${skipped.length} line(s) I could not read.` : '')
        : 'No rows found. Paste lines like: Property, Address, City, State, GLA (sq ft).'
    )
  }

  async function loadPortal(id: string) {
    if (!id) return
    setMsg('Loading properties from the portal…')
    const res = await fetch(`/api/onepager/portal-company?id=${id}`)
    const d = await res.json()
    if (!res.ok) return setMsg(d.error ?? 'Could not load that company.')
    const add: Row[] = (d.properties as any[]).map((p) => ({
      id: nextId.current++,
      property: p.property,
      address: p.address ?? '',
      city: p.city,
      state: String(p.state).toUpperCase(),
      gla: String(p.gla),
      region: '',
      bess: 'Yes',
    }))
    if (!name) setName(d.name)
    setRows((r) => [...r, ...add])
    setResult(null)
    setMsg(`Loaded ${add.length} properties for ${d.name}. Building size is used as GLA.`)
  }

  function onLogo(file: File | undefined) {
    if (!file) return
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setMsg('Logo must be a PNG or JPEG.')
    if (file.size > 1_500_000) return setMsg('Logo is over 1.5 MB. Use a smaller file.')
    const fr = new FileReader()
    fr.onload = () => {
      setLogo(String(fr.result))
      setLogoName(file.name)
    }
    fr.readAsDataURL(file)
  }

  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))

  async function detect(onlyMissing: boolean) {
    const todo = rows.filter((r) => !onlyMissing || !r.region)
    if (!todo.length) return setMsg('Every property already has a region.')
    setBusy('detect')
    setResult(null)
    try {
      const found: Record<number, string> = {}
      for (let i = 0; i < todo.length; i += CHUNK) {
        const chunk = todo.slice(i, i + CHUNK)
        setProgress(`Looking up utilities… ${Math.min(i + CHUNK, todo.length)} of ${todo.length}`)
        const res = await fetch('/api/onepager/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ properties: chunk.map(({ id, property, address, city, state }) => ({ id, property, address, city, state })) }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? 'Lookup failed')
        setRows((rs) =>
          rs.map((r) => {
            const hit = (d.results as any[]).find((x) => x.id === r.id)
            return hit ? { ...r, region: hit.region, confidence: hit.confidence, note: hit.note } : r
          })
        )
        for (const x of d.results as any[]) if (x.region) found[x.id] = x.region
      }

      // battery eligibility, decided once per distinct region
      const regionOf = (r: Row) => found[r.id] || r.region
      const sample = new Map<string, { region: string; state: string; city: string }>()
      for (const r of rows) {
        const g = regionOf(r)
        if (g && !sample.has(g)) sample.set(g, { region: g, state: r.state, city: r.city })
      }
      const list = Array.from(sample.values())
      const verdict: Record<string, { bess: 'Yes' | 'No'; confidence: 'high' | 'medium' | 'low'; note: string }> = {}
      for (let i = 0; i < list.length; i += 6) {
        setProgress(`Checking battery eligibility… ${Math.min(i + 6, list.length)} of ${list.length} areas`)
        const res = await fetch('/api/onepager/bess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regions: list.slice(i, i + 6) }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? 'Battery check failed')
        for (const x of d.results as any[]) verdict[x.region] = x
      }
      setRows((rs) =>
        rs.map((r) => {
          const v = verdict[regionOf(r)]
          return v ? { ...r, bess: v.bess, bessConf: v.confidence, bessNote: v.note } : r
        })
      )
      setMsg('Regions and battery eligibility filled in. Check anything marked low or medium before you build.')
    } catch (e: any) {
      setMsg(e.message)
    } finally {
      setBusy('')
      setProgress('')
    }
  }

  function applyBessRule() {
    const min = Number(minGla.replace(/,/g, ''))
    setRows((rs) => rs.map((r) => ({ ...r, bess: !minGla || !(min > 0) ? 'Yes' : Number(r.gla) >= min ? 'Yes' : 'No' })))
    setMsg(minGla ? `BESS set to Yes only for buildings of ${nf(min)} sq ft or more.` : 'BESS set to Yes for every property.')
  }

  async function build() {
    setResult(null)
    if (!name.trim()) return setMsg('Enter the company name.')
    if (!rows.length) return setMsg('Add at least one property.')
    if (missing) return setMsg(`${missing} propert${missing === 1 ? 'y has' : 'ies have'} no region yet.`)
    setBusy('build')
    setProgress('Building the Excel and the slide…')
    try {
      const res = await fetch('/api/onepager/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: {
            name: name.trim(),
            brand_name: brand.trim() || undefined,
            cap_rate: Number(cap) / 100,
            bess_lease: Number(bessLease.replace(/,/g, '')),
            contact_name: contactName,
            contact_email: contactEmail,
          },
          logo,
          properties: rows.map((r) => ({
            property: r.property,
            address: r.address,
            city: r.city,
            state: r.state,
            gla: Number(r.gla),
            region: r.region,
            bess_eligible: r.bess,
          })),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not build the files')
      setResult({
        slug: d.slug,
        warnings: d.warnings,
        summary: d.summary,
        xlsxUrl: b64Blob(d.xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
        pptxUrl: b64Blob(d.pptx, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
      })
      setMsg('')
    } catch (e: any) {
      setMsg(e.message)
    } finally {
      setBusy('')
      setProgress('')
    }
  }

  const cellInput = { padding: '6px 8px', fontSize: 14 } as const

  return (
    <main>
      <h1>One-pager</h1>
      <p className="muted">
        Give it a company and its properties. It works out the solar and battery value with the lease rates from the Q3 2026 calculator, then builds the Excel
        evaluation and the one-slide PowerPoint.
      </p>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>1 · Company</h2>
        <div className="filters">
          <label style={{ minWidth: 260 }}>Company name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bridge Industrial Properties" />
          </label>
          <label>Name on the slide (optional)
            <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="shorter brand name" />
          </label>
          <label>Logo (PNG or JPEG, optional)
            <input type="file" accept="image/png,image/jpeg" onChange={(e) => onLogo(e.target.files?.[0])} />
          </label>
          {logo && (
            <button className="secondary" onClick={() => { setLogo(null); setLogoName('') }}>Remove {logoName}</button>
          )}
        </div>
        <div className="filters">
          <label>Cap rate (%)
            <input style={{ width: 90 }} value={cap} onChange={(e) => setCap(e.target.value)} />
          </label>
          <label>BESS lease per eligible site ($/yr)
            <input style={{ width: 150 }} value={bessLease} onChange={(e) => setBessLease(e.target.value)} />
          </label>
          <label>Contact name
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </label>
          <label>Contact email
            <input style={{ minWidth: 260 }} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </label>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Without a logo, the company name is printed in the box at the top left of the slide.
        </p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>2 · Properties</h2>
        <p className="muted">
          Paste one property per line, copied from Excel or typed with commas: <b>Property, Address, City, State, GLA (sq ft)</b>. The address column can be left out.
        </p>
        <textarea
          rows={6}
          style={{ width: '100%' }}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={'Kurv Somerset, Randolph Rd & Weston Canal Rd, Franklin Twp (Somerset), NJ, 1243982\nKurv McCook, 9301 W 55th St, McCook, IL, 1193232'}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={addFromPaste} disabled={!paste.trim()}>Add these properties</button>
          {companies.length > 0 && (
            <label className="row muted" style={{ fontSize: 13 }}>
              or load from the portal:
              <select defaultValue="" onChange={(e) => { loadPortal(e.target.value); e.target.value = '' }}>
                <option value="">Companies with loaded properties</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.n})</option>)}
              </select>
            </label>
          )}
          {rows.length > 0 && <button className="secondary" onClick={() => { setRows([]); setResult(null) }}>Clear all</button>}
        </div>
      </section>

      {rows.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>3 · Regions and battery eligibility</h2>
          <p className="muted">
            {rows.length} properties · {nf(totalGla)} sq ft. The region sets the lease rate, so it is the input to double-check.
          </p>
          <div className="row">
            <button onClick={() => detect(true)} disabled={!!busy}>Find regions + battery eligibility with Claude</button>
            <button className="secondary" onClick={() => detect(false)} disabled={!!busy}>Redo all</button>
            <label className="row muted" style={{ fontSize: 13, marginLeft: 12 }}>
              BESS only for buildings of at least
              <input style={{ width: 110, ...cellInput }} value={minGla} onChange={(e) => setMinGla(e.target.value)} placeholder="no minimum" />
              sq ft
              <button className="secondary" onClick={applyBessRule}>Apply</button>
            </label>
          </div>
          {progress && <p className="muted">{progress}</p>}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Property</th><th>City</th><th>St</th><th className="num">GLA (sq ft)</th><th>Region</th><th>BESS</th><th>Check</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: '8px 14px' }}>
                      <input style={{ ...cellInput, width: 210 }} value={r.property} onChange={(e) => patch(r.id, { property: e.target.value })} />
                    </td>
                    <td style={{ padding: '8px 14px' }}>
                      <input style={{ ...cellInput, width: 150 }} value={r.city} onChange={(e) => patch(r.id, { city: e.target.value, region: '', confidence: undefined })} />
                    </td>
                    <td style={{ padding: '8px 14px' }}>
                      <input style={{ ...cellInput, width: 52 }} value={r.state} maxLength={2} onChange={(e) => patch(r.id, { state: e.target.value.toUpperCase(), region: '', confidence: undefined })} />
                    </td>
                    <td className="num" style={{ padding: '8px 14px' }}>
                      <input style={{ ...cellInput, width: 110, textAlign: 'right' }} value={r.gla} onChange={(e) => patch(r.id, { gla: e.target.value.replace(/[^0-9.]/g, '') })} />
                    </td>
                    <td style={{ padding: '8px 14px' }}>
                      <select style={cellInput} value={r.region} onChange={(e) => patch(r.id, { region: e.target.value, confidence: undefined, note: 'Set by hand' })}>
                        <option value="">Choose…</option>
                        {regions.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px 14px' }}>
                      <select style={cellInput} value={r.bess} onChange={(e) => patch(r.id, { bess: e.target.value as 'Yes' | 'No', bessConf: undefined, bessNote: 'Set by hand' })}>
                        <option>Yes</option><option>No</option>
                      </select>
                    </td>
                    <td style={{ padding: '8px 14px', fontSize: 13 }}>
                      {r.confidence && <span className={`badge ${r.confidence === 'high' ? 'ok' : r.confidence === 'medium' ? 'warn' : 'bad'}`}>{r.confidence}</span>}{' '}
                      <span className="muted">{r.note}</span>
                      {r.bessNote && (
                        <div style={{ marginTop: 4 }}>
                          <span className={`badge ${r.bessConf === 'high' ? 'ok' : r.bessConf === 'medium' ? 'warn' : r.bessConf ? 'bad' : ''}`}>BESS</span>{' '}
                          <span className="muted">{r.bessNote}</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 14px' }}>
                      <button className="link" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} title="Remove">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button onClick={build} disabled={!!busy || !rows.length}>Build Excel + one-pager</button>
            {missing > 0 && <span className="muted">{missing} still need a region</span>}
          </div>
        </section>
      )}

      {msg && <p className="callout" style={{ margin: '14px 0' }}>{msg}</p>}

      {result && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Done</h2>
          <div className="cards" style={{ margin: '12px 0' }}>
            <div className="stat"><div className="stat-label">Illustrative asset value</div><div className="stat-value">{result.summary.assetValueLabel}</div></div>
            <div className="stat"><div className="stat-label">Annual income</div><div className="stat-value">${nf(result.summary.annual)}</div></div>
            <div className="stat"><div className="stat-label">Solar / BESS</div><div className="stat-value" style={{ fontSize: 28 }}>${nf(result.summary.solar)} / ${nf(result.summary.bess)}</div></div>
            <div className="stat"><div className="stat-label">BESS-eligible sites</div><div className="stat-value">{result.summary.eligible} of {result.summary.properties}</div></div>
          </div>
          <div className="row">
            <a className="btn" href={result.pptxUrl} download={`${result.slug}_One_pager.pptx`}>Download one-pager (.pptx)</a>
            <a className="btn" href={result.xlsxUrl} download={`${result.slug}_One_pager.xlsx`}>Download Excel (.xlsx)</a>
          </div>
          {result.warnings.length > 0 && (
            <div className="callout" style={{ marginTop: 14 }}>
              {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}
          <p className="muted small">
            Preliminary screening estimate. Solar value = building GLA ÷ 100 kW × the lease $/kW for the region and size tier, midpoint of high and 75% low.
          </p>
        </section>
      )}
    </main>
  )
}
