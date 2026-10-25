/* eslint-disable @typescript-eslint/no-explicit-any */
import JSZip from 'jszip'
import fs from 'node:fs'
import path from 'node:path'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import sharp from 'sharp'
import { CompanyIn, Row, Totals, glaShort, moneyFull, moneyShort } from './model'
import { TEMPLATE_DIR } from './xlsx'

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NAVY = '233646'

type El = Element

const kids = (el: El, ns: string, local: string): El[] => {
  const out: El[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i] as El
    if (n.nodeType === 1 && n.localName === local && n.namespaceURI === ns) out.push(n)
  }
  return out
}

function shapeByName(doc: Document, name: string): El {
  const nodes = doc.getElementsByTagNameNS(P, 'cNvPr')
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].getAttribute('name') === name) return nodes[i].parentNode!.parentNode as El
  }
  throw new Error(`Template shape "${name}" not found`)
}

/** replace the text of a text body, keeping the first run's formatting */
function setBodyText(body: El, text: string) {
  const paras = kids(body, A, 'p')
  const p0 = paras[0]
  const runs = kids(p0, A, 'r')
  const t = runs[0].getElementsByTagNameNS(A, 't')[0]
  t.textContent = text
  runs.slice(1).forEach((r) => p0.removeChild(r))
  paras.slice(1).forEach((p) => body.removeChild(p))
}

const setShapeText = (shape: El, text: string) => setBodyText(shape.getElementsByTagNameNS(P, 'txBody')[0] as El, text)
const getShapeText = (shape: El) => shape.getElementsByTagNameNS(A, 't')[0].textContent ?? ''
const setCellText = (tc: El, text: string) => setBodyText(tc.getElementsByTagNameNS(A, 'txBody')[0] as El, text)

function xfrm(shape: El): { off: El; ext: El } {
  const x = shape.getElementsByTagNameNS(A, 'xfrm')[0]
  return { off: x.getElementsByTagNameNS(A, 'off')[0] as El, ext: x.getElementsByTagNameNS(A, 'ext')[0] as El }
}
// graphic frames use p:xfrm
function frameExt(shape: El): El {
  const x = shape.getElementsByTagNameNS(P, 'xfrm')[0]
  return x.getElementsByTagNameNS(A, 'ext')[0] as El
}

function table(shape: El) {
  const tbl = shape.getElementsByTagNameNS(A, 'tbl')[0] as El
  return { tbl, trs: () => kids(tbl, A, 'tr'), cell: (r: number, c: number) => kids(kids(tbl, A, 'tr')[r], A, 'tc')[c] }
}

function wordmarkLayout(name: string) {
  const words = name.trim().split(/\s+/)
  let best: { lines: string[]; size: number } | null = null
  for (let n = 1; n <= 3; n++) {
    const per = Math.ceil(words.length / n)
    const lines: string[] = []
    for (let i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per).join(' '))
    const longest = Math.max(...lines.map((l) => l.length))
    for (let size = 30; size >= 10; size--) {
      const w = (longest * size * 0.5) / 72
      const h = (lines.length * size * 1.2) / 72
      if (w <= 2.5 && h <= 0.78) {
        if (!best || size > best.size) best = { lines, size }
        break
      }
    }
  }
  return best ?? { lines: [name], size: 10 }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function wordmarkShapeXml(id: string, off: { x: string; y: string }, ext: { cx: string; cy: string }, name: string) {
  const { lines, size } = wordmarkLayout(name)
  const paras = lines
    .map(
      (l) =>
        `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="${size * 100}" b="1" dirty="0"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:latin typeface="Calibri"/><a:ea typeface="Calibri"/><a:cs typeface="Calibri"/></a:rPr><a:t>${esc(l)}</a:t></a:r></a:p>`
    )
    .join('')
  return (
    `<p:sp xmlns:p="${P}" xmlns:a="${A}"><p:nvSpPr><p:cNvPr id="${id}" name="Client brand"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${off.x}" y="${off.y}"/><a:ext cx="${ext.cx}" cy="${ext.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="${NAVY}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`
  )
}

/** fit a client logo into the 900x285 header box (same rules as the Python version) */
export async function logoToHeaderPng(buf: Buffer): Promise<Buffer> {
  const W = 900, H = 285
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let minA = 255
  for (let i = 3; i < data.length; i += 4) if (data[i] < minA) minA = data[i]
  let bg: { r: number; g: number; b: number }
  if (minA < 250) {
    let sum = 0, cnt = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 200) {
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        cnt++
      }
    }
    bg = sum / Math.max(cnt, 1) < 110 ? { r: 255, g: 255, b: 255 } : { r: 0x23, g: 0x36, b: 0x46 }
  } else {
    bg = { r: data[2 * 4], g: data[2 * 4 + 1], b: data[2 * 4 + 2] }
  }
  const scale = Math.min((W * 0.92) / info.width, (H * 0.86) / info.height)
  const resized = await sharp(buf)
    .resize({ width: Math.max(1, Math.round(info.width * scale)), height: Math.max(1, Math.round(info.height * scale)) })
    .png()
    .toBuffer()
  return sharp({ create: { width: W, height: H, channels: 3, background: bg } })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer()
}

export async function buildSlide(company: CompanyIn, rows: Row[], tot: Totals, logo?: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(TEMPLATE_DIR, 'one_pager_template.pptx')))
  const slidePath = 'ppt/slides/slide1.xml'
  const doc = new DOMParser().parseFromString(await zip.file(slidePath)!.async('string'), 'text/xml') as unknown as Document

  const cap = company.cap_rate
  const N = rows.length
  const brand = company.brand_name || company.name
  const bessShort = moneyShort(company.bess_lease, 0)
  const S = (n: string) => shapeByName(doc, n)

  // ---- client brand block: logo image if supplied, otherwise the name as a wordmark
  const pic = S('Image 0')
  if (logo) {
    const rid = pic.getElementsByTagNameNS(A, 'blip')[0].getAttributeNS(R, 'embed')
    const rels = new DOMParser().parseFromString(await zip.file('ppt/slides/_rels/slide1.xml.rels')!.async('string'), 'text/xml')
    const relEls = rels.getElementsByTagName('Relationship')
    let target = ''
    for (let i = 0; i < relEls.length; i++) if (relEls[i].getAttribute('Id') === rid) target = relEls[i].getAttribute('Target')!
    const media = path.posix.normalize(path.posix.join('ppt/slides', target))
    zip.file(media, await logoToHeaderPng(logo))
  } else {
    const { off, ext } = xfrm(pic)
    const cNv = pic.getElementsByTagNameNS(P, 'cNvPr')[0] as El
    const node = new DOMParser().parseFromString(
      wordmarkShapeXml(cNv.getAttribute('id') || '2', { x: off.getAttribute('x')!, y: off.getAttribute('y')! }, { cx: ext.getAttribute('cx')!, cy: ext.getAttribute('cy')! }, brand),
      'text/xml'
    ).documentElement
    pic.parentNode!.insertBefore(doc.importNode(node as unknown as Node, true), pic)
    pic.parentNode!.removeChild(pic)
  }

  setShapeText(S('Text 3'), company.subtitle || `${brand} portfolio screen`)
  setShapeText(S('Text 6'), moneyShort(tot.annual / cap))
  setShapeText(S('Text 10'), `${moneyFull(tot.annual)} portfolio annual income ÷ ${(cap * 100).toFixed(1)}% cap rate`)
  setShapeText(S('Text 14'), N.toLocaleString('en-US'))
  setShapeText(S('Text 15'), N === 1 ? 'property modeled' : 'properties modeled')
  setShapeText(S('Text 16'), glaShort(tot.gla))
  setShapeText(S('Text 18'), String(tot.states))
  setShapeText(S('Text 19'), tot.states === 1 ? 'state' : 'states')
  setShapeText(S('Text 21'), moneyShort(tot.annual))
  setShapeText(S('Text 22'), `Solar ${moneyShort(tot.solar)}`)
  setShapeText(S('Text 23'), `BESS ${moneyShort(tot.bess)}`)

  // ---- income split bar
  const solarBar = S('Solar bar'), bessBar = S('BESS bar')
  const sx = xfrm(solarBar), bx = xfrm(bessBar)
  const left = Number(sx.off.getAttribute('x'))
  const width = Number(sx.ext.getAttribute('cx')) + Number(bx.ext.getAttribute('cx'))
  const sw = tot.annual ? Math.round((width * tot.solar) / tot.annual) : width
  sx.ext.setAttribute('cx', String(sw))
  bx.off.setAttribute('x', String(left + sw))
  bx.ext.setAttribute('cx', String(width - sw))
  if (width - sw <= 0) bessBar.parentNode!.removeChild(bessBar)

  // ---- top properties table
  const ranked = [...rows].sort((a, b) => b.annual - a.annual || a.property.localeCompare(b.property))
  const k = Math.min(7, N)
  const pt = table(S('Property table'))
  const trs0 = pt.trs()
  trs0.slice(1 + k, trs0.length - 1).forEach((tr) => pt.tbl.removeChild(tr))
  setCellText(pt.cell(0, 0), N > 7 ? 'TOP 7 PROPERTIES BY ANNUAL VALUE' : N === 1 ? 'PROPERTY BY ANNUAL VALUE' : 'PROPERTIES BY ANNUAL VALUE')
  ranked.slice(0, k).forEach((r, i) => {
    ;[`${r.property} · ${r.state}`, Math.round(r.gla).toLocaleString('en-US'), moneyFull(r.mid), moneyFull(r.bess), moneyFull(r.annual)].forEach((v, j) =>
      setCellText(pt.cell(i + 1, j), v)
    )
  })
  const last = k + 1
  setCellText(pt.cell(last, 0), N > 7 ? `PORTFOLIO TOTAL (ALL ${N} PROPERTIES)` : 'PORTFOLIO TOTAL')
  ;[Math.round(tot.gla).toLocaleString('en-US'), moneyFull(tot.solar), moneyFull(tot.bess), moneyFull(tot.annual)].forEach((v, j) =>
    setCellText(pt.cell(last, j + 1), v)
  )
  const baseH = 219075
  const rowH = k >= 7 ? baseH : Math.min(330000, Math.floor((2120265 - 304800 - 266700) / k))
  pt.trs().forEach((tr, i) => {
    if (i >= 1 && i <= k) tr.setAttribute('h', String(rowH))
  })
  frameExt(S('Property table')).setAttribute('cy', String(pt.trs().reduce((s, tr) => s + Number(tr.getAttribute('h')), 0)))

  // ---- cap-rate sensitivity, centred on the base cap rate
  const ct = table(S('Cap rate table'))
  for (let i = 0; i < 5; i++) {
    const c = cap - 0.01 + 0.005 * i
    setCellText(ct.cell(i + 1, 0), `${(c * 100).toFixed(2)}%`)
    setCellText(ct.cell(i + 1, 1), moneyShort(tot.annual / c))
  }

  setShapeText(S('Text 30'), `25-year term · 2% annual escalations · BESS ${bessShort}/year per eligible site`)
  setShapeText(S('Text 35'), `Contact ${company.contact_name} | ${company.contact_email} for the property-level analysis`)

  const fnShape = S('Text 36')
  let fn = getShapeText(fnShape)
  fn = fn
    .replace(/\$100,000\/year/, `$${Math.round(company.bess_lease).toLocaleString('en-US')}/year`)
    .replace(/each of the \d+ sites/, tot.eligible === 1 ? 'the 1 site' : `each of the ${tot.eligible} sites`)
    .replace(/\d+\.\d% cap rate/, `${(cap * 100).toFixed(1)}% cap rate`)
  setShapeText(fnShape, fn)

  zip.file(slidePath, new XMLSerializer().serializeToString(doc as any))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
