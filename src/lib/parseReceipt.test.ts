import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parseOcrBoxes, parseReceiptText } from './parseReceipt'

describe('parseReceiptText', () => {
  it('extracts priced line items and skips totals', () => {
    const text = `
      CAFE LUNA
      Burger Deluxe     $14.50
      Garden Salad      $9.00
      Shared Fries      $6.00
      Subtotal         $29.50
      Tax               $2.36
      Tip               $5.00
      Total            $36.86
    `
    const result = parseReceiptText(text)
    expect(result.items).toEqual([
      { name: 'Burger Deluxe', price: 14.5 },
      { name: 'Garden Salad', price: 9 },
      { name: 'Shared Fries', price: 6 },
    ])
    expect(result.detectedTax).toBe(2.36)
    expect(result.detectedTip).toBe(5)
    expect(result.detectedTotal).toBe(36.86)
    expect(result.quality).toBe('good')
  })

  it('handles dollar signs and OCR spacing in prices', () => {
    const text = 'Pasta Bolognese  $12.50\nEspresso $3 .00'
    const result = parseReceiptText(text)
    expect(result.items).toHaveLength(2)
    expect(result.items[0]!.price).toBe(12.5)
    expect(result.items[1]!.price).toBe(3)
  })

  it('rejects header junk without real money decimals', () => {
    const text = `
      Church Street 01-02 S(049482)
      TEL +65 8738 7426
      1 Asahi Pint $11.00
      Qlub $371.69
      Closed Bill
    `
    const result = parseReceiptText(text)
    expect(result.items.map((i) => i.name)).toEqual(['Asahi Pint'])
    expect(result.items[0]!.price).toBe(11)
  })

  it('detects service charge', () => {
    const text = `1 Nachos $19.00\n10% Svr Chrg $31.00\n9% GST $30.69\nTOTAL $371.69`
    const result = parseReceiptText(text)
    expect(result.detectedServiceCharge).toBe(31)
    expect(result.detectedTax).toBe(30.69)
    expect(result.detectedTotal).toBe(371.69)
  })

  it('sweeps OCR-typo service charge out of items', () => {
    const text = `1 Asahi Pint $11.00\n10% Syr Chrg $31.00\n9% GST $30.69`
    const result = parseReceiptText(text)
    expect(result.items.map((i) => i.name)).toEqual(['Asahi Pint'])
    expect(result.detectedServiceCharge).toBe(31)
    expect(result.detectedTax).toBe(30.69)
  })
})

describe('parseOcrBoxes', () => {
  it('pairs left name with right price on the same row', () => {
    const result = parseOcrBoxes([
      {
        text: '1 Asahi Pint',
        score: 0.9,
        poly: [
          [10, 100],
          [200, 100],
          [200, 120],
          [10, 120],
        ],
      },
      {
        text: '$11.00',
        score: 0.95,
        poly: [
          [220, 100],
          [280, 100],
          [280, 120],
          [220, 120],
        ],
      },
      {
        text: '1 Truffle Fries',
        score: 0.9,
        poly: [
          [10, 140],
          [200, 140],
          [200, 160],
          [10, 160],
        ],
      },
      {
        text: '$14.00',
        score: 0.95,
        poly: [
          [220, 140],
          [280, 140],
          [280, 160],
          [220, 160],
        ],
      },
    ])
    expect(result.items).toEqual([
      { name: 'Asahi Pint', price: 11 },
      { name: 'Truffle Fries', price: 14 },
    ])
  })

  it('assigns late prices to the earliest queued item name', () => {
    const result = parseOcrBoxes([
      box('Asahi Pint', 10, 100),
      box('Sapporo Black Pint', 10, 120),
      box('$11.00', 200, 105),
      box('Sapporo Tower', 10, 140),
      box('$11.00', 200, 125),
      box('San Pellegrino Spark', 10, 160),
      box('$58.00', 200, 145),
      box('*Gyoza Cheese', 10, 180),
      box('$15.00', 200, 165),
      box('6PM HH Asahi', 10, 200),
      box('$12.00', 200, 185),
      box('SUBTOTAL', 10, 220),
      box('$310.00', 200, 220),
      box('10% Svr Chrg', 10, 240),
      box('$31.00', 200, 240),
      box('9% GST', 10, 260),
      box('$30.69', 200, 260),
      box('TOTAL', 10, 280),
      box('$371.69', 200, 280),
    ])
    expect(result.items.slice(0, 5)).toEqual([
      { name: 'Asahi Pint', price: 11 },
      { name: 'Sapporo Black Pint', price: 11 },
      { name: 'Sapporo Tower', price: 58 },
      { name: 'San Pellegrino Spark', price: 15 },
      { name: 'Gyoza Cheese', price: 12 },
    ])
    expect(result.detectedServiceCharge).toBe(31)
    expect(result.detectedTax).toBe(30.69)
    expect(result.detectedTotal).toBe(371.69)
  })

  it('does not drop early item prices when header labels precede the menu', () => {
    const result = parseOcrBoxes([
      box('KANP AI', 10, 10),
      box('Craf Beer tarden and Tapas. NO 20', 10, 30),
      box('j@@cosmicdiner.sg', 10, 50),
      box('iner.sg/kanpai2 09/07/202618:00', 10, 70),
      box('Asahi Pint', 10, 100),
      box('Sapporo Biack Pint', 10, 120),
      box('$11.00', 200, 105),
      box('Sapporo Tower', 10, 140),
      box('$11.00', 200, 125),
      box('San Pel legrino Spark', 10, 160),
      box('$58.00', 200, 145),
      box('Gyoza Cheese', 10, 180),
      box('$15.00', 200, 165),
      box('6PM HH Asahi', 10, 200),
      box('$12.00', 200, 185),
      box('6PM HH K.Bianc', 10, 220),
      box('$6.00', 200, 205),
      box('6PM HH Sapporo', 10, 240),
      box('$12.00', 200, 225),
      box('7PM HH Sapporo', 10, 260),
      box('$6.00', 200, 245),
      box('7PM HH Sapporo Black', 10, 280),
      box('$7.00', 200, 265),
      box('7PM HH Tequila', 10, 300),
      box('$14.00', 200, 285),
      box('$28.00', 200, 305),
      box('SUBTOTAL', 10, 340),
      box('$310.00', 200, 340),
      box('10% Svr Chrg', 10, 360),
      box('$31.00', 200, 360),
      box('9% GST', 10, 380),
      box('$30.69', 200, 380),
      box('TOTAL', 10, 400),
      box('$371.69', 200, 400),
    ])
    expect(result.items.slice(0, 9)).toEqual([
      { name: 'Asahi Pint', price: 11 },
      { name: 'Sapporo Biack Pint', price: 11 },
      { name: 'Sapporo Tower', price: 58 },
      { name: 'San Pel legrino Spark', price: 15 },
      { name: 'Gyoza Cheese', price: 12 },
      { name: '6PM HH Asahi', price: 6 },
      { name: '6PM HH K.Bianc', price: 12 },
      { name: '6PM HH Sapporo', price: 6 },
      { name: '7PM HH Sapporo', price: 7 },
    ])
    // Must not look like the shifted failure mode (Asahi=$58)
    expect(result.items[0]?.price).not.toBe(58)
  })

  it('parses recorded Kanpai PaddleOCR boxes to receipt ground truth', () => {
    const fixturePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../e2e/fixtures/kanpai-ocr-boxes.json',
    )
    const boxes = JSON.parse(readFileSync(fixturePath, 'utf8'))
    const result = parseOcrBoxes(boxes)
    expect(result.items[0]).toMatchObject({ name: 'Asahi Pint', price: 11 })
    expect(result.items[1]).toMatchObject({ name: 'Sapporo Biack Pint', price: 11 })
    expect(result.items[2]).toMatchObject({ name: 'Sapporo Tower', price: 58 })
    expect(result.items[3]).toMatchObject({ name: 'San Pellegrino Spark', price: 15 })
    expect(result.items[4]).toMatchObject({ name: 'Gyoza Cheese', price: 12 })
    expect(result.items.reduce((s, i) => s + i.price, 0)).toBe(310)
    expect(result.detectedServiceCharge).toBe(31)
    expect(result.detectedTax).toBe(30.69)
    expect(result.detectedTotal).toBe(371.69)
    expect(result.items).toHaveLength(20)
  })
})

function box(text: string, x: number, y: number) {
  return {
    text,
    score: 0.9,
    poly: [
      [x, y],
      [x + 80, y],
      [x + 80, y + 16],
      [x, y + 16],
    ] as Array<[number, number]>,
  }
}
