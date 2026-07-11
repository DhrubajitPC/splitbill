import { describe, expect, it } from 'vitest'
import { isReliableExtract, scoreExtract } from './extractQuality'
import type { ParseResult } from './parseReceipt'

function result(partial: Partial<ParseResult> & { items: ParseResult['items'] }): ParseResult {
  return {
    detectedTax: null,
    detectedTip: null,
    detectedServiceCharge: null,
    detectedTotal: null,
    quality: 'weak',
    ...partial,
  }
}

describe('isReliableExtract', () => {
  it('rejects the Gemini garbage that treated grand total as an item', () => {
    const bad = result({
      items: [
        { name: 'a y | CEE 9%', price: 18 },
        { name: 'HEBER 1', price: 14.3 },
        { name: 'it 19', price: 18.9 },
        { name: 'Bait', price: 218.14 },
      ],
      detectedTotal: 218.14,
    })
    expect(isReliableExtract(bad)).toBe(false)
  })

  it('accepts a dense reconciled extract', () => {
    const good = result({
      items: [
        { name: 'Sweet Sour Pork', price: 18.9 },
        { name: 'Shredded Pork Fried Rice', price: 11.8 },
        { name: 'Mini Cucumber', price: 6.3 },
        { name: 'Oriental Salad', price: 6 },
        { name: 'Shrimp Fried Rice', price: 15 },
        { name: 'Spinach', price: 13 },
        { name: 'Strawberry Mochi XLB', price: 15.8 },
        { name: 'Shrimp Dou Miao', price: 18 },
        { name: 'Shrimp SM', price: 12.8 },
        { name: 'Hot Jasmine Tea', price: 8 },
        { name: 'PorkBeanS Noodle', price: 11 },
        { name: 'PorkChop Fried Rice', price: 14.3 },
        { name: 'D Fry Shrimp Wanton', price: 9.8 },
        { name: 'OCBC Chilli Crab XLB', price: 21.24 },
      ],
      detectedServiceCharge: 18.19,
      detectedTax: 18.01,
      detectedTotal: 218.14,
      quality: 'good',
    })
    expect(isReliableExtract(good)).toBe(true)
    expect(scoreExtract(good)).toBeGreaterThan(scoreExtract(result({ items: good.items.slice(0, 3) })))
  })
})
