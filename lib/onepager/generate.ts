import { CompanyIn, PropertyIn, compute, moneyShort, slugify, totals, validate } from './model'
import { buildWorkbook } from './xlsx'
import { buildSlide } from './pptx'

export type OnePagerResult = {
  slug: string
  xlsx: Buffer
  pptx: Buffer
  warnings: string[]
  summary: { properties: number; annual: number; assetValue: number; solar: number; bess: number; eligible: number; assetValueLabel: string }
}

function sniff(buf: Buffer): 'png' | 'jpeg' | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg'
  return null
}

export async function generateOnePager(company: CompanyIn, props: PropertyIn[], logo?: Buffer | null): Promise<OnePagerResult> {
  const { warnings } = validate(props)
  const rows = compute(props, company.bess_lease)
  const tot = totals(rows)
  let logoExt: 'png' | 'jpeg' | null = null
  if (logo) {
    logoExt = sniff(logo)
    if (!logoExt) throw new Error('Logo must be a PNG or JPEG image')
  }
  const [xlsx, pptx] = await Promise.all([
    buildWorkbook(company, rows, tot, logo && logoExt ? { buffer: logo, ext: logoExt } : undefined),
    buildSlide(company, rows, tot, logo ?? undefined),
  ])
  const assetValue = tot.annual / company.cap_rate
  return {
    slug: slugify(company.name),
    xlsx,
    pptx,
    warnings,
    summary: {
      properties: rows.length,
      annual: tot.annual,
      assetValue,
      solar: tot.solar,
      bess: tot.bess,
      eligible: tot.eligible,
      assetValueLabel: moneyShort(assetValue),
    },
  }
}
