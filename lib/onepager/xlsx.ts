import ExcelJS from 'exceljs'
import fs from 'node:fs'
import path from 'node:path'
import { CompanyIn, Row, Totals, RATE_ROWS, RATE_SOURCE, tierIndex } from './model'

export const TEMPLATE_DIR = path.join(process.cwd(), 'lib', 'onepager', 'templates')

type Snap = { style: Record<string, Record<string, unknown>>; heights: Record<number, number>; widths: Record<number, number> }

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

function snapshot(ws: ExcelJS.Worksheet): Snap {
  const style: Snap['style'] = {}
  const heights: Snap['heights'] = {}
  const widths: Snap['widths'] = {}
  ws.eachRow({ includeEmpty: true }, (row, rn) => {
    if (row.height) heights[rn] = row.height
    row.eachCell({ includeEmpty: true }, (cell) => {
      style[cell.address] = clone(cell.style) as Record<string, unknown>
    })
  })
  for (let c = 1; c <= 18; c++) {
    const w = ws.getColumn(c).width
    if (w) widths[c] = w
  }
  return { style, heights, widths }
}

const COLS = 'ABCDEFGHIJKLMN'

function fresh(wb: ExcelJS.Workbook, old: ExcelJS.Worksheet, snap: Snap) {
  const name = old.name
  wb.removeWorksheet(old.id)
  const ws = wb.addWorksheet(name)
  for (const [c, w] of Object.entries(snap.widths)) ws.getColumn(Number(c)).width = w
  return ws
}

function put(ws: ExcelJS.Worksheet, snap: Snap, coord: string, value: ExcelJS.CellValue, proto?: string) {
  const cell = ws.getCell(coord)
  if (proto && snap.style[proto]) cell.style = clone(snap.style[proto]) as unknown as ExcelJS.Style
  cell.value = value
  return cell
}

function styleRow(ws: ExcelJS.Worksheet, snap: Snap, protoRow: number, newRow: number, cols = COLS) {
  for (const col of cols) {
    const p = snap.style[`${col}${protoRow}`]
    if (p) ws.getCell(`${col}${newRow}`).style = clone(p) as unknown as ExcelJS.Style
  }
}

const f = (formula: string, result: number | string) => ({ formula, result }) as ExcelJS.CellFormulaValue

export function footnoteXlsx(cap: number, bess: number) {
  return (
    "Preliminary screening estimates for discussion purposes only. Solar values reflect midpoint estimates from SolarKal's current market model, " +
    'with system size estimated at one kW per 100 sq ft of building GLA; usable roof area is subject to site confirmation. ' +
    `BESS assumes $${Math.round(bess).toLocaleString('en-US')}/year for each site identified as eligible, over a 25-year term with no replacement cost modeled. ` +
    `Asset value is annual renewable-energy NOI divided by a ${(cap * 100).toFixed(1)}% cap rate. ` +
    'Actual economics depend on site conditions, interconnection, market rules, incentives, lease structure and final diligence'
  )
}

export async function buildWorkbook(
  company: CompanyIn,
  rows: Row[],
  tot: Totals,
  logo?: { buffer: Buffer; ext: 'png' | 'jpeg' }
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(fs.readFileSync(path.join(TEMPLATE_DIR, 'one_pager_template.xlsx')) as unknown as ExcelJS.Buffer)

  const oldPl = wb.getWorksheet('Property List')!
  const oldVa = wb.getWorksheet('Valuation')!
  const oldOp = wb.getWorksheet('Client One-Pager')!
  const plS = snapshot(oldPl), vaS = snapshot(oldVa), opS = snapshot(oldOp)
  const pl = fresh(wb, oldPl, plS)
  const va = fresh(wb, oldVa, vaS)
  const op = fresh(wb, oldOp, opS)

  const N = rows.length
  const cap = company.cap_rate
  const bessLease = company.bess_lease
  const name = company.name

  // ------------------------------------------------------------ Property List
  put(pl, plS, 'A1', `${name} – Consolidated Property List`, 'A1')
  pl.getRow(1).height = plS.heights[1]
  const plHead = ['S.NO', 'Property', 'Address', 'City', 'State', 'Building GLA (sq ft)']
  'ABCDEF'.split('').forEach((c, i) => put(pl, plS, `${c}4`, plHead[i], `${c}4`))
  pl.getRow(4).height = plS.heights[4]
  rows.forEach((r, i) => {
    const n = 5 + i
    const proto = i === 0 ? 5 : i === N - 1 && N > 2 ? 35 : 6
    const vals: ExcelJS.CellValue[] = [i + 1, r.property, r.address ?? '', r.city, r.state, Math.round(r.gla)]
    'ABCDEF'.split('').forEach((c, j) => put(pl, plS, `${c}${n}`, vals[j], `${c}${proto}`))
    pl.getRow(n).height = 20
  })
  const plT = 5 + N + 1
  'ACDE'.split('').forEach((c) => put(pl, plS, `${c}${plT}`, null, `${c}37`))
  put(pl, plS, `B${plT}`, 'Total ', 'B37')
  put(pl, plS, `F${plT}`, f(`SUM(F5:F${4 + N})`, Math.round(tot.gla)), 'F37')

  // ------------------------------------------------------------ Valuation
  const heads = [
    'Property', 'City', 'State', 'Building GLA (sq ft)', 'System Size (kW)', 'Region', 'Lease Rate ($/kW)',
    'Solar Revenue - High ($)', 'Solar Revenue - Low ($)', 'Solar Revenue - Midpoint ($)', 'BESS Eligible?',
    'Bess Revenue ($)', 'Total NOI - Midpoint ($)',
  ]
  heads.forEach((h, j) => put(va, vaS, `${COLS[j]}1`, h, `${COLS[j]}1`))
  va.getRow(1).height = vaS.heights[1]
  const t = N + 3
  const hdr = t + 3
  const firstRate = hdr + 1
  const lastRate = firstRate + RATE_ROWS.length - 1
  const bessRow = lastRate + 1
  rows.forEach((r, i) => {
    const n = 2 + i
    const proto = i === 0 ? 2 : 3
    const cells: [string, ExcelJS.CellValue][] = [
      ['A', r.property], ['B', r.city], ['C', r.state], ['D', Math.round(r.gla)],
      ['E', f(`D${n}/100`, r.kw)], ['F', r.region],
      ['G', f(`IFERROR(INDEX($D$${firstRate}:$F$${lastRate},MATCH(TRIM(F${n}),$C$${firstRate}:$C$${lastRate},0),IF(E${n}>2000,2,IF(E${n}>=1000,1,3))),"Check region")`, r.rate)],
      ['H', f(`ROUND(E${n}*G${n},-3)`, r.high)],
      ['I', f(`ROUND(H${n}*0.75,-3)`, r.low)],
      ['J', f(`AVERAGE(H${n}:I${n})`, r.mid)],
      ['K', r.bess_eligible],
      ['L', f(`IF(K${n}="Yes",$D$${bessRow},0)`, r.bess)],
      ['M', f(`J${n}+L${n}`, r.annual)],
    ]
    cells.forEach(([c, v]) => put(va, vaS, `${c}${n}`, v, `${c}${proto}`))
    va.getRow(n).height = 15
  })
  for (let n = 2; n <= N + 1; n++) va.getCell(`K${n}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Yes,No"'] }
  COLS.slice(0, 13).split('').forEach((c) => put(va, vaS, `${c}${t}`, null, `${c}34`))
  put(va, vaS, `A${t}`, 'Total', 'A34')
  const vt: Record<string, number> = { D: tot.gla, E: tot.kw, H: tot.high, I: tot.low, J: tot.solar, L: tot.bess, M: tot.annual }
  for (const [c, v] of Object.entries(vt)) put(va, vaS, `${c}${t}`, f(`SUM(${c}2:${c}${N + 1})`, v), `${c}34`)
  va.getRow(t).height = vaS.heights[34]
  put(va, vaS, `C${hdr}`, 'Region', 'C59')
  ;['1,000-2,000 kW ($/kW)', 'Over 2,000 kW ($/kW)', '500-1,000 kW ($/kW)', 'Cap Rate', 'Asset Value'].forEach((h, j) =>
    put(va, vaS, `${'DEFGH'[j]}${hdr}`, h, `${'DEFGH'[j]}59`)
  )
  va.getRow(hdr).height = vaS.heights[59]
  RATE_ROWS.forEach((r, i) => {
    const n = firstRate + i
    put(va, vaS, `C${n}`, r.region, 'C60')
    put(va, vaS, `D${n}`, r['1000-2000'], 'D60')
    put(va, vaS, `E${n}`, r['>2000'], 'E60')
    put(va, vaS, `F${n}`, r['500-1000'], 'F60')
  })
  const capRates = [0, 1, 2, 3, 4].map((i) => Math.round((cap - 0.01 + 0.005 * i) * 10000) / 10000)
  capRates.forEach((c, i) => {
    const n = firstRate + i
    put(va, vaS, `G${n}`, c, 'G60')
    put(va, vaS, `H${n}`, f(`$M$${t}/G${n}`, tot.annual / c), 'H60')
  })
  put(va, vaS, `C${bessRow}`, 'BESS lease per eligible site', 'C75')
  put(va, vaS, `D${bessRow}`, bessLease, 'D75')
  put(va, vaS, `C${bessRow + 2}`, RATE_SOURCE, 'C75').alignment = { horizontal: 'left' }

  // ------------------------------------------------------------ Client One-Pager
  const t2 = 12 + N
  const shift = t2 - 43
  for (let r = 1; r <= 11; r++) {
    styleRow(op, opS, r, r)
    if (opS.heights[r]) op.getRow(r).height = opS.heights[r]
  }
  for (let r = 12; r <= 16; r++) styleRow(op, opS, r, r, 'HIJKLMN')
  for (let i = 0; i < N; i++) {
    styleRow(op, opS, i < N - 1 ? 13 : 42, 12 + i, 'ABCDEFG')
  }
  for (let r = 12; r <= Math.max(16, 11 + N); r++) op.getRow(r).height = 12
  for (let r = 43; r <= 52; r++) {
    styleRow(op, opS, r, r + shift, 'ABCDEFG')
    if (opS.heights[r]) op.getRow(r + shift).height = opS.heights[r]
  }
  for (const [pr, nr] of [[51, t2 + 8], [52, t2 + 9]] as const) styleRow(op, opS, pr, nr, 'HIJ')
  for (const [pc, nc] of [['I46', `I${t2 + 3}`], ['J46', `J${t2 + 3}`], ['I48', `I${t2 + 5}`], ['J48', `J${t2 + 5}`], ['I49', `I${t2 + 6}`], ['J49', `J${t2 + 6}`]]) {
    if (opS.style[pc]) op.getCell(nc).style = clone(opS.style[pc]) as unknown as ExcelJS.Style
  }
  const solarTotal25 = tot.solar * 25
  const bessTotal25 = tot.bess * 25
  const assetValue = tot.annual / cap

  op.getCell('B2').value = name
  op.getCell('B3').value = 'Renewable Energy Asset Value Opportunity'
  op.getCell('I2').value = logo ? null : name
  op.getCell('B5').value = 'ESTIMATED POTENTIAL ASSET-VALUE INCREASE'
  op.getCell('B6').value = f(`G${t2}/$J$6`, assetValue)
  op.getCell('I5').value = 'Client name'
  op.getCell('J5').value = name
  op.getCell('I6').value = 'Cap rate'
  op.getCell('J6').value = cap
  op.getCell('I7').value = 'BESS lease / eligible site'
  op.getCell('J7').value = f(`Valuation!D${bessRow}`, bessLease)
  op.getCell('B10').value = 'PROPERTY FOOTPRINT + ANNUAL VALUE'
  op.getCell('I10').value = 'ASSET VALUE AT CAP RATES'
  ;['Property', 'State', 'GLA (sq ft)', 'Solar Annual Value', 'BESS Annual Value', 'Combined Annual Value'].forEach((h, j) => {
    op.getCell(`${'BCDEFG'[j]}11`).value = h
  })
  op.getCell('I11').value = 'Cap Rate'
  op.getCell('J11').value = 'Asset Value'
  capRates.forEach((c, i) => {
    op.getCell(`I${12 + i}`).value = f(`Valuation!G${firstRate + i}`, c)
    op.getCell(`J${12 + i}`).value = f(`$G$${t2}/I${12 + i}`, tot.annual / c)
  })
  rows.forEach((r, i) => {
    const n = 12 + i, v = 2 + i
    op.getCell(`B${n}`).value = f(`Valuation!A${v}`, r.property)
    op.getCell(`C${n}`).value = f(`Valuation!C${v}`, r.state)
    op.getCell(`D${n}`).value = f(`Valuation!D${v}`, Math.round(r.gla))
    op.getCell(`E${n}`).value = f(`Valuation!J${v}`, r.mid)
    op.getCell(`F${n}`).value = f(`IF(Valuation!K${v}="Yes",$J$7,0)`, r.bess)
    op.getCell(`G${n}`).value = f(`E${n}+F${n}`, r.annual)
  })
  op.getCell(`B${t2}`).value = 'PORTFOLIO TOTAL'
  ;(['D', 'E', 'F', 'G'] as const).forEach((c) => {
    const v = { D: Math.round(tot.gla), E: tot.solar, F: tot.bess, G: tot.annual }[c]
    op.getCell(`${c}${t2}`).value = f(`SUM(${c}12:${c}${t2 - 1})`, v)
  })
  op.getCell(`B${t2 + 2}`).value = 'VALUE BUILD-UP'
  op.getCell(`B${t2 + 3}`).value = '25-Year Solar Value'
  op.getCell(`D${t2 + 3}`).value = '+'
  op.getCell(`E${t2 + 3}`).value = '25-Year BESS Value'
  op.getCell(`G${t2 + 3}`).value = 'Total'
  op.getCell(`I${t2 + 3}`).value = 'Term'
  op.getCell(`J${t2 + 3}`).value = '25 years'
  op.getCell(`B${t2 + 4}`).value = f(`SUM(E12:E${t2 - 1})*25`, solarTotal25)
  op.getCell(`D${t2 + 4}`).value = f(`SUM(F12:F${t2 - 1})*25`, bessTotal25)
  op.getCell(`F${t2 + 4}`).value = f(`SUM(B${t2 + 4}:E${t2 + 4})`, solarTotal25 + bessTotal25)
  op.getCell(`I${t2 + 5}`).value = 'Cap Rate'
  op.getCell(`J${t2 + 5}`).value = f('$J$6', cap)
  op.getCell(`B${t2 + 6}`).value =
    '25-year lease value shown as nominal annual lease income × 25; asset-value estimate remains annual renewable-energy NOI ÷ cap rate.'
  op.getCell(`I${t2 + 6}`).value = 'Asset Value'
  op.getCell(`J${t2 + 6}`).value = f(`SUM(G12:G${t2 - 1})/$J$6`, assetValue)
  op.getCell(`B${t2 + 8}`).value = footnoteXlsx(cap, bessLease)

  for (const m of ['B2:G2', 'B3:G3', 'B5:G5', 'B6:G8', 'I2:J3', 'B10:G10', 'I10:N10',
    `B${t2 + 2}:G${t2 + 2}`, `B${t2 + 4}:C${t2 + 4}`, `D${t2 + 4}:E${t2 + 4}`, `F${t2 + 4}:G${t2 + 4}`,
    `B${t2 + 6}:G${t2 + 6}`, `B${t2 + 8}:J${t2 + 9}`]) op.mergeCells(m)

  if (logo) {
    const id = wb.addImage({ buffer: logo.buffer as unknown as ExcelJS.Buffer, extension: logo.ext })
    op.addImage(id, { tl: { col: 8.05, row: 1.1 }, ext: { width: 170, height: 52 } })
  }

  wb.calcProperties.fullCalcOnLoad = true
  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out as ArrayBuffer)
}

export { tierIndex }
