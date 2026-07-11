import { describe, expect, it } from 'vitest'
import { parseGeminiReceiptJson } from './chromeGemini'

describe('parseGeminiReceiptJson', () => {
  it('parses structured receipt JSON', () => {
    const raw = JSON.stringify({
      items: [
        { name: 'Asahi Pint', price: 11 },
        { name: 'Sapporo Tower', price: 58 },
        { name: 'Truffle Fries', price: 14 },
      ],
      serviceCharge: 31,
      tax: 30.69,
      tip: null,
      total: 371.69,
    })
    const result = parseGeminiReceiptJson(raw)
    expect(result.items).toHaveLength(3)
    expect(result.items[0]).toEqual({ name: 'Asahi Pint', price: 11 })
    expect(result.detectedServiceCharge).toBe(31)
    expect(result.detectedTax).toBe(30.69)
    expect(result.detectedTotal).toBe(371.69)
    expect(result.quality).toBe('good')
  })

  it('accepts fenced JSON and drops totals-like item rows', () => {
    const raw = `Here you go:\n\`\`\`json\n{"items":[{"name":"Nachos","price":19},{"name":"10% Svr Chrg","price":31}],"tax":2,"serviceCharge":31,"tip":null,"total":null}\n\`\`\``
    const result = parseGeminiReceiptJson(raw)
    expect(result.items.map((i) => i.name)).toEqual(['Nachos'])
    expect(result.detectedServiceCharge).toBe(31)
    expect(result.detectedTax).toBe(2)
  })

  it('returns empty for garbage', () => {
    const result = parseGeminiReceiptJson('not json at all')
    expect(result.items).toEqual([])
    expect(result.quality).toBe('empty')
  })
})
