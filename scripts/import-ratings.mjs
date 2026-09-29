// Usage:  node scripts/import-atlas.mjs "C:\path\to\atlas_per_account_summary_all.xlsx"
// Put DRY=1 in front to check the file without writing anything.
import fs from 'node:fs'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

try {
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
} catch {}

const file = process.argv[2]
if (!file) { console.error('Give the path to the .xlsx file.'); process.exit(1) }
const DRY = !!process.env.DRY

const norm = (s) =>
  String(s).toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(inc|llc|corp|corporation|company|co|the|trust|reit)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()

const ALIAS = {
  'dh property holdings': 'kadima industrial partners',
  irg: 'industrial realty group',
  'lineage logistics': 'lineage',
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
const json = (v) => { try { return v ? JSON.parse(v) : null } catch { return null } }

const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' })
const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
console.log('rows in file:', raw.length)

const all = raw.map((r) => ({
  account_name: String(r.account_name).trim(),
  normalized_name: norm(r.account_name),
  bucket: r.bucket,
  rank_in_bucket: num(r.account_rank_in_bucket),
  total_addressable_sqft: num(r.account_total_addressable_sqft),
  overall_confidence: num(r.overall_confidence),
  n_properties_total: num(r.n_properties_total),
  n_properties_geocoded: num(r.n_properties_geocoded),
  n_properties_qualifying: num(r.n_properties_qualifying),
  qualifying_rate: num(r.qualifying_rate),
  ingest_paths: r.ingest_paths,
  ingest_path_counts: json(r.ingest_path_counts),
  n_buildings_total: num(r.n_buildings_total),
  n_buildings_qualifying: num(r.n_buildings_qualifying),
  biggest_building_sqft: num(r.biggest_building_sqft),
  biggest_building_address: r.biggest_building_address,
  solar_signal_strength: r.solar_signal_strength,
  n_solar_lookups: num(r.n_solar_lookups),
  n_solar_live_match: num(r.n_solar_live_match),
  n_solar_live_no_match: num(r.n_solar_live_no_match),
  n_solar_regional: num(r.n_solar_regional),
  n_solar_no_public_source: num(r.n_solar_no_public_source),
  solar_source_mix: json(r.solar_source_mix),
  qualifying_sqft: {
    NJ: num(r.qualifying_sqft_NJ) ?? 0, NY: num(r.qualifying_sqft_NY) ?? 0, IL: num(r.qualifying_sqft_IL) ?? 0,
    MD: num(r.qualifying_sqft_MD) ?? 0, MA: num(r.qualifying_sqft_MA) ?? 0, other: num(r.qualifying_sqft_other_states) ?? 0,
  },
  audit_flags: r.any_audit_run_flags,
}))

// A few companies appear twice under slightly different names. Keep the larger row.
const best = new Map()
for (const r of all) {
  const cur = best.get(r.normalized_name)
  if (!cur || (r.total_addressable_sqft ?? 0) > (cur.total_addressable_sqft ?? 0)) best.set(r.normalized_name, r)
}
const rows = [...best.values()]
const dropped = all.filter((r) => !rows.includes(r)).map((r) => r.account_name)
if (dropped.length) console.log('duplicate accounts merged (smaller row dropped):', dropped.join(' | '))

if (DRY) {
  const by = {}
  rows.forEach((r) => (by[r.bucket] = (by[r.bucket] ?? 0) + 1))
  console.log('DRY RUN. Buckets:', by, '| first row:', rows[0].account_name, rows[0].overall_confidence)
  process.exit(0)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing Supabase URL or service role key in .env.local'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

const { data: companies, error: ce } = await db.from('companies').select('id,name,normalized_name').limit(10000)
if (ce) { console.error(ce.message); process.exit(1) }
const idByNorm = new Map(companies.map((c) => [c.normalized_name, c.id]))

const missing = []
for (const r of rows) {
  const k = ALIAS[r.normalized_name] ?? r.normalized_name
  r.company_id = idByNorm.get(k) ?? null
  if (r.company_id === null) missing.push(r)
}
if (missing.length) {
  const { data: made, error } = await db.from('companies').insert(
    missing.map((r) => ({
      name: r.account_name, normalized_name: r.normalized_name, status: 'new',
      check_note: 'Added from the Atlas account summary file',
    }))
  ).select('id,normalized_name')
  if (error) { console.error(error.message); process.exit(1) }
  made.forEach((c) => idByNorm.set(c.normalized_name, c.id))
  missing.forEach((r) => (r.company_id = idByNorm.get(r.normalized_name)))
  console.log('new companies created:', missing.map((r) => r.account_name).join(', '))
}

for (let i = 0; i < rows.length; i += 100) {
  const { error } = await db.from('atlas_accounts').upsert(rows.slice(i, i + 100), { onConflict: 'normalized_name' })
  if (error) { console.error(error.message); process.exit(1) }
}
console.log('done. accounts imported:', rows.length, '| matched to existing companies:', rows.length - missing.length)