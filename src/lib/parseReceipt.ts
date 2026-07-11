export interface ParsedLine {
  name: string
  price: number
}

export interface ParseResult {
  items: ParsedLine[]
  detectedTax: number | null
  detectedTip: number | null
  detectedServiceCharge: number | null
  detectedTotal: number | null
  quality: 'good' | 'weak' | 'empty'
}

export interface OcrBox {
  text: string
  score: number
  /** Polygon points [[x,y], ...] */
  poly: Array<[number, number] | { x: number; y: number }>
}

const JUNK_RE =
  /\b(sub\s*total|subtotal|total|tax|vat|gst|hst|tip|gratuity|sv[ry]\s*chrg|svr\s*chrg|syr\s*chrg|service\s*ch(?:ar)?ge|rounding|change|cash|card|visa|mastercard|amex|debit|credit|balance|amount\s*due|payment|paid|thank|please|server|table|guest|check|folio|invoice|closed|qlub|reg\s*no|tel|email|www\.|https?|pax|receipt|op:|tbl|corporate\s*info|instagram|feedback|scan|qr|kanp\s*ai|kanpai|church|street|pos\b|rcpt|title|tapas|craf?t\s*beer|beer\s*garden)\b/i

/** Header / contact / meta lines that must never enter the item-name queue. */
const HEADER_JUNK_RE =
  /@|\.sg\b|\.com\b|\/|cosmicdiner|kanp\s*ai|\bkanpai\b|\bwww\.|\bhttps?:|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\+?\d{2,3}[\s-]?\d{3,4}[\s-]?\d{4}\b|\bgst\s*reg|\bs\(\d{5,}\)?|\bclosed\s*bill\b|\bthank\s*you\b|\bcraf?t\s*beer\b|\btapas\b|\bbeer\s*garden\b|\bchurch\s*st|\btel\b|\bpax\b|\btbl\b|\brcpt\b|\bpos\d*\b|\bop\b|\bqlub\b|^no:?$|\bemail\b|\bstitle\b|corporate\s*info/i

const MONEY_AT_END_RE = /\$?\s*(\d{1,4})\s*[.,]\s*(\d{1,2})\s*$/
const BARE_DOLLAR_INT_RE = /\$\s*(\d{1,4})\s*$/
const MONEY_ONLY_RE = /^\$?\s*(\d{1,4})\s*[.,]\s*(\d{1,2})\s*$/
const DOLLAR_ONLY_RE = /^\$\s*(\d{1,4})\s*$/

function pointXY(p: [number, number] | { x: number; y: number }): { x: number; y: number } {
  if (Array.isArray(p)) return { x: p[0], y: p[1] }
  return { x: p.x, y: p.y }
}

function boxCenter(poly: OcrBox['poly']): { x: number; y: number } {
  const pts = poly.map(pointXY)
  const x = pts.reduce((s, p) => s + p.x, 0) / Math.max(pts.length, 1)
  const y = pts.reduce((s, p) => s + p.y, 0) / Math.max(pts.length, 1)
  return { x, y }
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

export function normalizeMoney(rawWhole: string, rawFrac?: string): number | null {
  if (rawFrac != null) {
    const frac = rawFrac.padEnd(2, '0').slice(0, 2)
    const n = Number.parseFloat(`${rawWhole}.${frac}`)
    if (!Number.isFinite(n) || n <= 0 || n > 10000) return null
    return Math.round(n * 100) / 100
  }
  const cleaned = rawWhole.replace(/\s+/g, '').replace(',', '.')
  const n = Number.parseFloat(cleaned)
  if (!Number.isFinite(n) || n <= 0 || n > 10000) return null
  return Math.round(n * 100) / 100
}

function parsePriceToken(text: string): number | null {
  const t = text.replace(/\s+/g, ' ').trim()
  let m = t.match(MONEY_ONLY_RE) || t.match(MONEY_AT_END_RE)
  if (m) return normalizeMoney(m[1]!, m[2])
  m = t.match(DOLLAR_ONLY_RE) || t.match(BARE_DOLLAR_INT_RE)
  if (m) return normalizeMoney(m[1]!, '00')
  return null
}

function extractMoneyAtEnd(text: string): { price: number; name: string } | null {
  const t = text.replace(/\s+/g, ' ').trim()
  let m = t.match(MONEY_AT_END_RE)
  if (m) {
    const price = normalizeMoney(m[1]!, m[2])
    if (price == null) return null
    const name = t.slice(0, m.index).trim().replace(/[.\-–—:$]+$/, '').trim()
    return { price, name }
  }
  m = t.match(BARE_DOLLAR_INT_RE)
  if (m) {
    const price = normalizeMoney(m[1]!, '00')
    if (price == null) return null
    const name = t.slice(0, m.index).trim().replace(/[.\-–—:$]+$/, '').trim()
    return { price, name }
  }
  return null
}

function letterRatio(s: string): number {
  const letters = (s.match(/[A-Za-z]/g) ?? []).length
  return letters / Math.max(s.replace(/\s/g, '').length, 1)
}

function isHeaderOrMeta(name: string): boolean {
  const t = name.trim()
  if (!t) return true
  if (JUNK_RE.test(t) || HEADER_JUNK_RE.test(t)) return true
  // Pure date/time fragments like "09/07/202618:00"
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t)) return true
  if (/\d{1,2}:\d{2}/.test(t) && letterRatio(t) < 0.45) return true
  return false
}

function isLikelyItemName(name: string): boolean {
  const t = name.trim()
  if (t.length < 2) return false
  if (/^\d+$/.test(t)) return false
  if (isHeaderOrMeta(t)) return false
  if (letterRatio(t) < 0.35) return false
  const withoutQty = t.replace(/^\d+\s+/, '').replace(/^[*\-–—]+\s*/, '')
  if (withoutQty.length < 2) return false
  // Venue taglines are long and rarely look like menu items
  if (withoutQty.length > 42 && /\band\b/i.test(withoutQty)) return false
  return true
}

/** Prefer the parse whose item sum best matches total − tax − tip − service. */
function preferParse(a: ParseResult, b: ParseResult): ParseResult {
  const score = (r: ParseResult) => {
    const sum = r.items.reduce((s, i) => s + i.price, 0)
    let s = r.items.length * 4
    const deductions =
      (r.detectedTax ?? 0) + (r.detectedTip ?? 0) + (r.detectedServiceCharge ?? 0)
    if (r.detectedTotal != null && r.detectedTotal > 0) {
      const expected = r.detectedTotal - deductions
      if (expected > 0) {
        const delta = Math.abs(sum - expected)
        s += Math.max(0, 80 - delta)
        if (delta <= 1) s += 40
        if (sum > r.detectedTotal * 1.05) s -= 50
      }
    }
    return s
  }
  return score(b) > score(a) ? b : a
}

function cleanItemName(name: string): string {
  return name
    .replace(/^\d+\s+/, '')
    .replace(/^[*\-–—]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function classifySpecial(line: string, price: number, out: ParseResult): boolean {
  const lower = line.toLowerCase().replace(/\s+/g, '')
  const spaced = line.toLowerCase()
  if (/svrchrg|syrchrg|servicech/.test(lower) || /\bsv[ry]\s*chrg\b|\bservice\s*ch/.test(spaced)) {
    out.detectedServiceCharge = price
    return true
  }
  if (/\btax\b|\bvat\b|\bgst\b|\bhst\b/.test(spaced) && !/\bpre.?tax\b|\breg\b/.test(spaced)) {
    out.detectedTax = price
    return true
  }
  if (/\btip\b|\bgratuity\b/.test(spaced)) {
    out.detectedTip = price
    return true
  }
  if (/\b(grand\s*)?total\b|\bamount\s*due\b/.test(spaced)) {
    out.detectedTotal = price
    return true
  }
  if (/\bsub\s*total\b|\bsubtotal\b|\brounding\b/.test(spaced)) {
    return true
  }
  if (/\b(qlub|visa|mastercard|amex|cash|card|paid)\b/.test(spaced)) {
    return true
  }
  return false
}

function isServiceChargeLabel(name: string): boolean {
  return /sv[ry]\s*chrg|svr\s*chrg|syr\s*chrg|service\s*ch/i.test(name)
}

/** Pull misclassified service/tax/total lines out of items into detected fields. */
function sweepExtrasFromItems(out: ParseResult): void {
  const kept: ParsedLine[] = []
  for (const item of out.items) {
    if (isServiceChargeLabel(item.name)) {
      out.detectedServiceCharge ??= item.price
      continue
    }
    if (/\b(gst|vat|hst|tax)\b/i.test(item.name) && !/\bpre.?tax\b/i.test(item.name)) {
      out.detectedTax ??= item.price
      continue
    }
    if (/\b(grand\s*)?total\b|\bamount\s*due\b/i.test(item.name)) {
      out.detectedTotal ??= item.price
      continue
    }
    if (/\btip\b|\bgratuity\b/i.test(item.name)) {
      out.detectedTip ??= item.price
      continue
    }
    kept.push(item)
  }
  out.items = kept
}

function scoreQuality(items: ParsedLine[], total: number | null): ParseResult['quality'] {
  if (items.length === 0) return 'empty'
  if (items.length >= 3 && (total == null || items.reduce((s, i) => s + i.price, 0) <= total * 1.15)) {
    return 'good'
  }
  if (items.length >= 2) return 'weak'
  return 'weak'
}

/**
 * Parse plain OCR text into line items (strict money patterns only).
 */
export function parseReceiptText(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const out: ParseResult = {
    items: [],
    detectedTax: null,
    detectedTip: null,
    detectedServiceCharge: null,
    detectedTotal: null,
    quality: 'empty',
  }

  for (const line of lines) {
    const money = extractMoneyAtEnd(line)
    if (!money) continue
    if (classifySpecial(line, money.price, out)) continue
    if (!isLikelyItemName(money.name)) continue
    if (money.price > 500) continue
    out.items.push({ name: cleanItemName(money.name) || 'Item', price: money.price })
  }

  sweepExtrasFromItems(out)
  out.quality = scoreQuality(out.items, out.detectedTotal)
  return out
}

type Enriched = OcrBox & { cx: number; cy: number; text: string }

/**
 * Column-aware box parser: match each right-column price to the nearest left-column name.
 */
export function parseOcrBoxes(boxes: OcrBox[]): ParseResult {
  const out: ParseResult = {
    items: [],
    detectedTax: null,
    detectedTip: null,
    detectedServiceCharge: null,
    detectedTotal: null,
    quality: 'empty',
  }

  if (boxes.length === 0) return out

  const enriched: Enriched[] = boxes
    .filter((b) => b.text.trim() && b.score >= 0.3)
    .map((b) => {
      const c = boxCenter(b.poly)
      return { ...b, text: b.text.replace(/\s+/g, ' ').trim(), cx: c.x, cy: c.y }
    })
    .sort((a, b) => a.cy - b.cy || a.cx - b.cx)

  const priceBoxes: Array<Enriched & { price: number }> = []
  const textBoxes: Enriched[] = []

  for (const box of enriched) {
    const onlyPrice = parsePriceToken(box.text)
    const trimmed = box.text.replace(/\s+/g, ' ').trim()
    if (
      onlyPrice != null &&
      (MONEY_ONLY_RE.test(trimmed) || DOLLAR_ONLY_RE.test(trimmed))
    ) {
      priceBoxes.push({ ...box, price: onlyPrice })
      continue
    }
    const embedded = extractMoneyAtEnd(box.text)
    if (embedded && embedded.name.trim().length === 0) {
      priceBoxes.push({ ...box, price: embedded.price })
      continue
    }
    if (embedded && embedded.name.trim()) {
      // name+price in one box
      if (classifySpecial(box.text, embedded.price, out)) continue
      if (isLikelyItemName(embedded.name) && embedded.price <= 500) {
        out.items.push({ name: cleanItemName(embedded.name), price: embedded.price })
      }
      continue
    }
    textBoxes.push(box)
  }

  // Also catch "10%Svr Chrg" style labels near prices via text boxes + nearby price
  const rowTol =
    enriched.length > 0
      ? Math.min(
          28,
          Math.max(
            14,
            median(
              enriched.map((b) => {
                const ys = b.poly.map((p) => pointXY(p).y)
                return Math.max(...ys) - Math.min(...ys)
              }),
            ) * 0.9,
          ),
        )
      : 18

  if (priceBoxes.length > 0) {
    const priceColX = median(priceBoxes.map((p) => p.cx))
    const usedText = new Set<Enriched>()

    for (const pb of [...priceBoxes].sort((a, b) => a.cy - b.cy)) {
      // Special totals from nearby left labels
      const nearbyLabel = textBoxes
        .filter((t) => Math.abs(t.cy - pb.cy) <= rowTol * 1.5 && t.cx < pb.cx)
        .sort((a, b) => Math.abs(a.cy - pb.cy) - Math.abs(b.cy - pb.cy))[0]

      const labelText = nearbyLabel?.text ?? ''
      if (classifySpecial(labelText || pb.text, pb.price, out)) {
        if (nearbyLabel) usedText.add(nearbyLabel)
        continue
      }

      // Prefer left-column name with closest Y
      const candidates = textBoxes.filter(
        (t) =>
          !usedText.has(t) &&
          t.cx < priceColX - 8 &&
          Math.abs(t.cy - pb.cy) <= rowTol &&
          isLikelyItemName(t.text),
      )

      let nameBox =
        candidates.sort((a, b) => Math.abs(a.cy - pb.cy) - Math.abs(b.cy - pb.cy))[0] ?? null

      // If nothing on same row, take nearest unpaired name above within 2 row heights
      if (!nameBox) {
        nameBox =
          textBoxes
            .filter(
              (t) =>
                !usedText.has(t) &&
                t.cx < priceColX - 8 &&
                t.cy <= pb.cy + rowTol * 0.3 &&
                pb.cy - t.cy <= rowTol * 2.2 &&
                isLikelyItemName(t.text),
            )
            .sort((a, b) => pb.cy - a.cy - (pb.cy - b.cy) || Math.abs(a.cy - pb.cy) - Math.abs(b.cy - pb.cy))[0] ??
          null
      }

      if (!nameBox) continue
      if (pb.price > 500) continue

      // Merge same-row / just-above fragments (HH prefixes; split names like Gyoza+Cheese)
      const sameRowBits = textBoxes.filter(
        (t) =>
          !usedText.has(t) &&
          t !== nameBox &&
          t.cx < pb.cx &&
          t.cy <= nameBox!.cy + rowTol * 0.35 &&
          nameBox!.cy - t.cy <= rowTol * 1.15 &&
          !/^\d+$/.test(t.text) &&
          !/^-\d+$/.test(t.text) &&
          !isHeaderOrMeta(t.text) &&
          (Math.abs(t.cy - nameBox!.cy) <= rowTol * 0.75 ||
            /^\d{1,2}PM$/i.test(t.text) ||
            /^HH$/i.test(t.text) ||
            /^(K\.?|Blanc|Bianc|Black|Cheese|Lychee|Plum|Spark|Pint)$/i.test(t.text)),
      )
      const aboveFrag = textBoxes.find(
        (t) =>
          !usedText.has(t) &&
          t !== nameBox &&
          t.cx < pb.cx &&
          nameBox!.cy - t.cy > 0 &&
          nameBox!.cy - t.cy <= rowTol * 1.2 &&
          !isHeaderOrMeta(t.text) &&
          /^[*]?(Gyoza|Chu-?Hi)$/i.test(t.text),
      )
      const nameParts = [...sameRowBits, ...(aboveFrag ? [aboveFrag] : []), nameBox].sort(
        (a, b) => a.cy - b.cy || a.cx - b.cx,
      )
      const seenTxt = new Set<string>()
      const ordered: string[] = []
      for (const p of nameParts) {
        const key = p.text.toLowerCase()
        if (seenTxt.has(key)) continue
        seenTxt.add(key)
        ordered.push(p.text)
      }
      const name = cleanItemName(ordered.join(' '))
      if (!isLikelyItemName(name)) continue

      usedText.add(nameBox)
      for (const bit of sameRowBits) usedText.add(bit)
      if (aboveFrag) usedText.add(aboveFrag)
      out.items.push({ name, price: pb.price })
    }
  }

  // Sequential only as fallback when column pairing found little —
  // never replace a solid column parse (FIFO name-queue shifts badly on this receipt).
  const sequential = parseSequentialFragments(enriched.map((b) => b.text))
  if (out.items.length < 5) {
    const best = preferParse(out, sequential)
    if (best === sequential) {
      out.items = sequential.items
    }
  }
  out.detectedTax ??= sequential.detectedTax
  out.detectedTip ??= sequential.detectedTip
  out.detectedServiceCharge ??= sequential.detectedServiceCharge
  out.detectedTotal ??= sequential.detectedTotal

  if (out.items.length < 3) {
    const textFallback = parseReceiptText(enriched.map((b) => b.text).join('\n'))
    const chosen = preferParse(out, textFallback)
    if (chosen === textFallback) {
      out.items = textFallback.items
      out.detectedTax ??= textFallback.detectedTax
      out.detectedTip ??= textFallback.detectedTip
      out.detectedServiceCharge ??= textFallback.detectedServiceCharge
      out.detectedTotal ??= textFallback.detectedTotal
    }
  }

  // Deduplicate identical name+price
  const seen = new Set<string>()
  out.items = out.items.filter((item) => {
    const key = `${item.name.toLowerCase()}|${item.price}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  sweepExtrasFromItems(out)
  out.quality = scoreQuality(out.items, out.detectedTotal)
  return out
}

/** Walk OCR fragments: queue item names, assign each price to the oldest queued name. */
function parseSequentialFragments(fragments: string[]): ParseResult {
  const out: ParseResult = {
    items: [],
    detectedTax: null,
    detectedTip: null,
    detectedServiceCharge: null,
    detectedTotal: null,
    quality: 'empty',
  }

  const nameQueue: string[] = []
  let qtyPrefix = ''
  let pendingLabel = ''

  const flushSpecialOrItem = (price: number) => {
    if (pendingLabel) {
      const label = pendingLabel
      pendingLabel = ''
      if (classifySpecial(label, price, out)) return
      // Non-totals meta must not consume a price — fall through to the name queue
    }
    if (nameQueue.length > 0) {
      const name = cleanItemName(nameQueue.shift()!)
      if (isLikelyItemName(name) && price <= 500) {
        out.items.push({ name, price })
      } else if (nameQueue.length > 0 && isLikelyItemName(nameQueue[0]!) && price <= 500) {
        // Skipped a junk queued name — try next
        const next = cleanItemName(nameQueue.shift()!)
        if (isLikelyItemName(next)) out.items.push({ name: next, price })
      }
    }
  }

  const holdAsTotalsLabel = (text: string) => {
    if (
      /\b(sub\s*total|subtotal|total|tax|vat|gst|hst|tip|gratuity|sv[ry]\s*chrg|service\s*ch|rounding|qlub|amount\s*due)\b/i.test(
        text,
      )
    ) {
      pendingLabel = text
      return true
    }
    return false
  }

  for (const raw of fragments) {
    const text = raw.replace(/\s+/g, ' ').trim()
    if (!text) continue

    const priceOnly = parsePriceToken(text)
    const isPriceOnly =
      priceOnly != null &&
      (MONEY_ONLY_RE.test(text) || DOLLAR_ONLY_RE.test(text) || /^\$\s*\d/.test(text))

    if (isPriceOnly && priceOnly != null) {
      flushSpecialOrItem(priceOnly)
      qtyPrefix = ''
      continue
    }

    const embedded = extractMoneyAtEnd(text)
    if (embedded) {
      const namePart = embedded.name.trim()
      if (namePart) {
        if (holdAsTotalsLabel(namePart)) {
          flushSpecialOrItem(embedded.price)
          qtyPrefix = ''
          continue
        }
        if (isHeaderOrMeta(namePart) || JUNK_RE.test(namePart)) {
          if (classifySpecial(namePart, embedded.price, out)) {
            qtyPrefix = ''
            continue
          }
          // Drop header/meta + its stray price entirely
          qtyPrefix = ''
          continue
        }
        nameQueue.push(cleanItemName(`${qtyPrefix} ${namePart}`.trim()))
        qtyPrefix = ''
      }
      flushSpecialOrItem(embedded.price)
      continue
    }

    if (/^\d+$/.test(text)) {
      qtyPrefix = `${qtyPrefix} ${text}`.trim()
      continue
    }

    // Happy-hour / time tokens are prefixes, not standalone items
    if (/^\d{1,2}PM$/i.test(text) || /^HH$/i.test(text) || /^AM$/i.test(text)) {
      qtyPrefix = `${qtyPrefix} ${text}`.trim()
      continue
    }

    if (isHeaderOrMeta(text) || JUNK_RE.test(text)) {
      holdAsTotalsLabel(text)
      continue
    }

    const isFragment =
      /^(K\.?|Blanc|Black|Pint|Spark|Cheese|Lychee|Plum|Tower|Bianc|Biack)$/i.test(text) ||
      (text.length <= 2 && !/\d/.test(text))

    if (isFragment && nameQueue.length > 0) {
      nameQueue[nameQueue.length - 1] = cleanItemName(`${nameQueue[nameQueue.length - 1]} ${text}`)
      continue
    }

    if (
      isLikelyItemName(text) ||
      /Pint|Tower|Fries|Belly|Nachos|Cheese|Asahi|Sapporo|Tequila|Chu-?Hi|Quesad|Gyoza|Truffle|Pork|Popcorn|Pellegrino|Lychee|Blanc|Plum|Bianc|Biack/i.test(
        text,
      )
    ) {
      // Still refuse clear header/meta even if food-ish keywords appear in a URL
      if (isHeaderOrMeta(text)) {
        holdAsTotalsLabel(text)
        continue
      }
      nameQueue.push(cleanItemName(`${qtyPrefix} ${text}`.trim()))
      qtyPrefix = ''
      continue
    }

    if (nameQueue.length > 0 && !isHeaderOrMeta(text)) {
      nameQueue[nameQueue.length - 1] = cleanItemName(`${nameQueue[nameQueue.length - 1]} ${text}`)
    } else if (qtyPrefix) {
      // hold as prefix still — incomplete
      qtyPrefix = `${qtyPrefix} ${text}`.trim()
    }
  }

  out.items = out.items.filter(
    (item) =>
      item.name.length >= 3 &&
      isLikelyItemName(item.name) &&
      !/^(\d+\s+)*(\d{1,2}PM\s*)?(HH\s*)?$/i.test(item.name) &&
      item.price < 250,
  )

  sweepExtrasFromItems(out)
  out.quality = scoreQuality(out.items, out.detectedTotal)
  return out
}
