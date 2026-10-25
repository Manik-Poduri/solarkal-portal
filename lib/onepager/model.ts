import rates from './rates.json'

export type RateRow = { region: string; '500-1000': number; '1000-2000': number; '>2000': number }
export const RATE_ROWS: RateRow[] = rates.regions as RateRow[]
export const RATE_SOURCE: string = rates.source
export const REGION_NAMES = RATE_ROWS.map((r) => r.region)

export type PropertyIn = {
  property: string
  address?: string
  city: string
  state: string
  gla: number
  region: string
  bess_eligible: 'Yes' | 'No'
}

export type CompanyIn = {
  name: string
  brand_name?: string
  subtitle?: string
  cap_rate: number
  bess_lease: number
  contact_name: string
  contact_email: string
}

export type Row = PropertyIn & {
  kw: number
  rate: number
  high: number
  low: number
  mid: number
  bess: number
  annual: number
}

export type Totals = { gla: number; kw: number; high: number; low: number; solar: number; bess: number; annual: number; eligible: number; states: number }

/** Excel-style ROUND for positive numbers: digits=-3 rounds to the nearest thousand, half up. */
export function rhu(x: number, digits = 0): number {
  const f = Math.pow(10, -digits)
  return Math.round(x / f) * f
}

export function rateFor(region: string): RateRow | undefined {
  return RATE_ROWS.find((r) => r.region === region.trim())
}

export function tierKey(kw: number): '500-1000' | '1000-2000' | '>2000' {
  return kw > 2000 ? '>2000' : kw >= 1000 ? '1000-2000' : '500-1000'
}

/** index used by the workbook's INDEX(): column 2 = >2000, 1 = 1000-2000, 3 = 500-1000 */
export function tierIndex(kw: number): 1 | 2 | 3 {
  return kw > 2000 ? 2 : kw >= 1000 ? 1 : 3
}

export function validate(props: PropertyIn[]): { warnings: string[] } {
  const warnings: string[] = []
  if (props.length === 0) throw new Error('Add at least one property')
  if (props.length > 500) throw new Error('Too many properties (limit 500)')
  props.forEach((p, i) => {
    const label = p.property || `property ${i + 1}`
    for (const k of ['property', 'city', 'state', 'region'] as const) {
      if (!String(p[k] ?? '').trim()) throw new Error(`${label}: missing ${k}`)
    }
    if (!(Number(p.gla) > 0)) throw new Error(`${label}: GLA must be greater than 0`)
    if (!rateFor(p.region)) throw new Error(`${label}: region "${p.region}" is not in the lease-rate table`)
    if (p.bess_eligible !== 'Yes' && p.bess_eligible !== 'No') throw new Error(`${label}: BESS eligible must be Yes or No`)
    const r = rateFor(p.region)!
    if (r[tierKey(p.gla / 100)] === 0) {
      warnings.push(`${label} (${p.region}): the calculator has no lease rate for this region and size, so solar value is $0`)
    }
    if (!p.region.startsWith(p.state.toUpperCase()) && !p.region.includes(p.state.toUpperCase())) {
      warnings.push(`${label}: region "${p.region}" does not look like it belongs to state ${p.state}`)
    }
  })
  return { warnings }
}

export function compute(props: PropertyIn[], bessLease: number): Row[] {
  return props.map((p) => {
    const kw = p.gla / 100
    const rate = rateFor(p.region)![tierKey(kw)]
    const high = rhu(kw * rate, -3)
    const low = rhu(high * 0.75, -3)
    const mid = (high + low) / 2
    const bess = p.bess_eligible === 'Yes' ? bessLease : 0
    return { ...p, kw, rate, high, low, mid, bess, annual: mid + bess }
  })
}

export function totals(rows: Row[]): Totals {
  const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0)
  return {
    gla: sum((r) => r.gla),
    kw: sum((r) => r.kw),
    high: sum((r) => r.high),
    low: sum((r) => r.low),
    solar: sum((r) => r.mid),
    bess: sum((r) => r.bess),
    annual: sum((r) => r.annual),
    eligible: rows.filter((r) => r.bess > 0).length,
    states: new Set(rows.map((r) => r.state.toUpperCase())).size,
  }
}

// ---- display helpers (match the hand-built slide) ----
const r1 = (x: number, d: number) => (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d)

export function moneyShort(v: number, decimals = 1): string {
  const a = Math.abs(v)
  if (a >= 1e9) return `$${r1(v / 1e9, decimals)}B`
  if (a >= 1e6) return `$${r1(v / 1e6, decimals)}M`
  if (a >= 1e3) return `$${Math.round(v / 1e3).toLocaleString('en-US')}K`
  return `$${Math.round(v).toLocaleString('en-US')}`
}
export const moneyFull = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`
export const glaShort = (v: number) => (v >= 1e6 ? `${r1(v / 1e6, 2)}M` : Math.round(v).toLocaleString('en-US'))
export const num = (v: number) => Math.round(v).toLocaleString('en-US')

export function slugify(s: string) {
  return s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Company'
}
