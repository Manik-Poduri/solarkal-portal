import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'crypto'

const STATES = ['MA', 'MD', 'IL', 'NJ', 'NY']
const MIN_ROOF = 100_000
const MIN_DEAL_DATE = '2021-01-01'
const SUITABILITY = ['high', 'medium', 'low', 'unknown']

function sha(s: string) {
  return createHash('sha256').update(s).digest()
}

function tokenOk(header: string | null) {
  const expected = process.env.INGEST_TOKEN
  if (!expected || expected.length < 24) return false
  const given = (header ?? '').replace(/^Bearer\s+/i, '')
  return timingSafeEqual(sha(given), sha(expected))
}

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(inc|llc|corp|corporation|company|co|the|trust|reit)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

type Source = { name: string; url: string; field?: string; value?: string; retrieved_at?: string }

export async function POST(request: Request) {
  if (!tokenOk(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'server not configured' }, { status: 500 })
  const db = createClient(url, key, { auth: { persistSession: false } })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const items: any[] = Array.isArray(body?.items) ? body.items.slice(0, 50) : []
  const out = { queued: 0, screened_out: 0, skipped_rejected: 0, duplicates: 0, invalid: [] as string[] }

  for (const [i, it] of items.entries()) {
    const kind = it?.kind
    const company: string = String(it?.company_name ?? '').trim()
    const payload = { ...(it?.payload ?? {}) }
    const sources: Source[] = Array.isArray(it?.sources) ? it.sources : []

    if (!['new_property', 'update_property', 'remove_property'].includes(kind) || !company) {
      out.invalid.push(`item ${i}: bad kind or company`)
      continue
    }
    if (sources.length === 0 || !sources.every((s) => s?.name && /^https?:\/\//.test(String(s?.url ?? '')))) {
      out.invalid.push(`item ${i}: every proposal needs sources with name and http(s) url`)
      continue
    }

    const targetId = it?.target_property_id ? Number(it.target_property_id) : null
    if (kind !== 'new_property' && !Number.isInteger(targetId)) {
      out.invalid.push(`item ${i}: ${kind} needs target_property_id`)
      continue
    }

    const address = String(payload.address ?? '').trim().toLowerCase()
    const fingerprint = sha(`${kind}|${norm(company)}|${address}|${targetId ?? ''}|${payload.roof_sqft ?? ''}`).toString('hex')

    const { data: rej } = await db.from('rejected_fingerprints').select('fingerprint').eq('fingerprint', fingerprint).maybeSingle()
    if (rej) { out.skipped_rejected++; continue }

    const gates: Record<string, string> = {}

    if (kind === 'new_property') {
      const readings: { source: string; sqft: number }[] = Array.isArray(payload.roof_sqft_readings)
        ? payload.roof_sqft_readings.filter((r: any) => r?.source && Number(r?.sqft) > 0).map((r: any) => ({ source: String(r.source), sqft: Number(r.sqft) }))
        : []
      if (readings.length === 0 && Number(payload.roof_sqft) > 0) {
        readings.push({ source: 'single source', sqft: Number(payload.roof_sqft) })
      }
      if (readings.length === 0 || !payload.address || !payload.deal_date) {
        out.invalid.push(`item ${i}: needs address, deal_date and roof_sqft_readings`)
        continue
      }

      const vals = readings.map((r) => r.sqft)
      const distinctSources = new Set(readings.map((r) => r.source)).size
      const agree = distinctSources >= 2 && Math.max(...vals) <= Math.min(...vals) * 1.1
      payload.roof_sqft = median(vals)
      payload.roof_sqft_readings = readings
      payload.confidence = agree ? 'verified' : 'needs_review'

      const fail = async (gate: string) => {
        await db.from('screened_out').insert({
          company_name: company, address: payload.address, failed_gate: gate, detail: { payload, sources },
        })
        out.screened_out++
      }

      const state = String(payload.state ?? '').toUpperCase()
      payload.state = state
      if (!STATES.includes(state)) { await fail('gate1_state'); continue }
      gates.gate1_state = 'pass'

      if (payload.roof_sqft < MIN_ROOF) { await fail('gate2_size'); continue }
      gates.gate2_size = 'pass'

      const { data: tracked } = await db.from('companies').select('id').eq('normalized_name', norm(company)).maybeSingle()
      if (tracked) {
        gates.gate3_not_on_list = 'tracked company'
      } else {
        const { data: excluded } = await db.rpc('is_excluded', { p_norm: norm(company), p_raw: company })
        if (excluded) { await fail('gate3_not_on_list'); continue }
        gates.gate3_not_on_list = 'pass'
      }

      if (payload.owns_or_controls_roof !== true) { await fail('gate4_controls_roof'); continue }
      gates.gate4_controls_roof = 'pass'

      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.deal_date)) || payload.deal_date < MIN_DEAL_DATE) {
        await fail('gate5_deal_2021_plus'); continue
      }
      gates.gate5_deal_2021_plus = 'pass'

      if (payload.has_existing_solar === true) { await fail('gate6_no_solar'); continue }
      gates.gate6_no_solar = payload.has_existing_solar === false ? 'pass' : 'unknown'

      payload.roof_suitability = SUITABILITY.includes(payload.roof_suitability) ? payload.roof_suitability : 'unknown'
      gates.gate7_suitability = payload.roof_suitability
      delete payload.has_existing_solar
    }

    const { error } = await db.from('proposals').insert({
      kind, company_name: company, target_property_id: targetId,
      payload, gate_results: gates, sources, fingerprint,
    })
    if (error) {
      if (error.code === '23505') out.duplicates++
      else out.invalid.push(`item ${i}: ${error.message}`)
    } else {
      out.queued++
    }
  }

  return NextResponse.json(out)
}