import type { ParseResult, ParsedLine } from './parseReceipt'

const SESSION_OPTS = {
  expectedInputs: [
    { type: 'text' as const, languages: ['en'] },
    { type: 'image' as const },
  ],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
}

const RECEIPT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          price: { type: 'number' },
        },
        required: ['name', 'price'],
        additionalProperties: false,
      },
    },
    serviceCharge: { type: ['number', 'null'] },
    tax: { type: ['number', 'null'] },
    tip: { type: ['number', 'null'] },
    total: { type: ['number', 'null'] },
  },
  required: ['items'],
  additionalProperties: false,
}

const SYSTEM = `You extract line items from restaurant receipt photos.
Return only menu/food/drink items with their final line prices.
Do NOT include restaurant name, address, phone, email, table, POS, date, payment method, or "Corporate Info".
serviceCharge = service / "Svr Chrg" / "Syr Chrg" amount if present, else null.
tax = GST/VAT/tax amount if present, else null.
tip = tip/gratuity if present (not service charge), else null.
total = grand total if present, else null.
Use the printed item name (fix obvious OCR-like typos when clear). Prices are numbers in the receipt currency.`

const USER_TEXT = `Extract every priced menu item from this receipt photo into the JSON schema.
Include happy-hour / HH lines. Exclude subtotal, service, tax, tip, total, and payment lines from items.`

let sessionPromise: Promise<LanguageModel> | null = null

export async function isChromeGeminiAvailable(): Promise<boolean> {
  if (typeof LanguageModel === 'undefined') return false
  try {
    const status = await LanguageModel.availability(SESSION_OPTS)
    return status === 'available' || status === 'downloadable' || status === 'downloading'
  } catch {
    return false
  }
}

async function getSession(onProgress?: (pct: number) => void): Promise<LanguageModel> {
  if (typeof LanguageModel === 'undefined') throw new Error('Chrome Prompt API unavailable')

  if (!sessionPromise) {
    sessionPromise = (async () => {
      const status = await LanguageModel.availability(SESSION_OPTS)
      if (status === 'unavailable') throw new Error('Chrome on-device model unavailable')

      onProgress?.(8)
      const session = await LanguageModel.create({
        ...SESSION_OPTS,
        initialPrompts: [{ role: 'system', content: SYSTEM }],
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            if (typeof e.loaded === 'number') {
              onProgress?.(8 + Math.round(e.loaded * 32))
            }
          })
        },
      })
      onProgress?.(42)
      return session
    })().catch((err) => {
      sessionPromise = null
      throw err
    })
  }
  return sessionPromise
}

function clampMoney(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 10000) return null
  return Math.round(n * 100) / 100
}

function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const t = name.replace(/\s+/g, ' ').trim().replace(/^[*\-–—]+\s*/, '')
  if (t.length < 2 || t.length > 120) return null
  return t
}

/** Parse structured JSON (or fenced JSON) from Gemini into a ParseResult. */
export function parseGeminiReceiptJson(raw: string): ParseResult & { rawText: string } {
  const empty: ParseResult & { rawText: string } = {
    items: [],
    detectedTax: null,
    detectedTip: null,
    detectedServiceCharge: null,
    detectedTotal: null,
    quality: 'empty',
    rawText: raw,
  }

  let text = raw.trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) text = fenced[1]!.trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return empty
  text = text.slice(start, end + 1)

  let data: unknown
  try {
    data = JSON.parse(text) as unknown
  } catch {
    return empty
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return empty
  const obj = data as Record<string, unknown>

  const items: ParsedLine[] = []
  if (Array.isArray(obj.items)) {
    for (const row of obj.items) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const name = cleanName(r.name)
      const price = clampMoney(r.price)
      if (!name || price == null) continue
      // Skip totals-like rows that slipped into items
      if (/\b(sub\s*total|subtotal|total|tax|gst|svr|syr|service|tip|gratuity|rounding)\b/i.test(name)) {
        continue
      }
      items.push({ name, price })
    }
  }

  const detectedServiceCharge = clampMoney(obj.serviceCharge)
  const detectedTax = clampMoney(obj.tax)
  const detectedTip = clampMoney(obj.tip)
  const detectedTotal = clampMoney(obj.total)

  let quality: ParseResult['quality'] = 'empty'
  if (items.length >= 3) quality = 'good'
  else if (items.length >= 1) quality = 'weak'

  return {
    items,
    detectedTax,
    detectedTip,
    detectedServiceCharge,
    detectedTotal,
    quality,
    rawText: raw,
  }
}

/**
 * Extract receipt lines using Chrome's built-in Gemini Nano (Prompt API).
 * Stays on-device; requires desktop Chrome with the model available.
 */
export async function runChromeGeminiOcr(
  image: Blob,
  onProgress?: (pct: number) => void,
): Promise<ParseResult & { rawText: string }> {
  onProgress?.(5)
  const session = await getSession(onProgress)
  onProgress?.(48)

  const result = await session.prompt(
    [
      {
        role: 'user',
        content: [
          { type: 'text', value: USER_TEXT },
          { type: 'image', value: image },
        ],
      },
    ],
    {
      responseConstraint: RECEIPT_SCHEMA,
    },
  )

  onProgress?.(92)
  const parsed = parseGeminiReceiptJson(typeof result === 'string' ? result : String(result))
  if (parsed.items.length === 0) {
    throw new Error('On-device AI returned no priced items')
  }
  return parsed
}
