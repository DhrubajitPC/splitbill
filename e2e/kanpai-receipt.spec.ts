import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { KANPAI_EXPECTED, KANPAI_TOTALS } from './kanpai-expected'

const root = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(root, '../public/fixtures/kanpai-receipt.png')

async function readReviewItems(page: Page) {
  return page.locator('.item-row').evaluateAll((rows) =>
    rows.map((row) => {
      const name = (row.querySelector('.field--name') as HTMLInputElement | null)?.value ?? ''
      const priceRaw =
        (row.querySelector('.field--price') as HTMLInputElement | null)?.value ?? ''
      return { name, price: Number.parseFloat(priceRaw) || 0 }
    }),
  )
}

test.describe('Kanpai receipt OCR', () => {
  test('parses menu prices without header shift', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.goto('/')

    await page.getByPlaceholder('Name').fill('Alex')
    await page.getByRole('button', { name: 'Add' }).click()
    await page.getByPlaceholder('Name').fill('Sam')
    await page.getByRole('button', { name: 'Add' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { name: 'Scan receipt' })).toBeVisible()

    await page.locator('input[type="file"]').nth(1).setInputFiles(fixture)

    await expect(page.getByRole('heading', { name: 'Review items' })).toBeVisible({
      timeout: 160_000,
    })

    const items = await readReviewItems(page)
    const lastOcr = await page.evaluate(() => window.__splitbillLastOcr ?? null)
    const lastBoxes = await page.evaluate(
      () => (window as unknown as { __splitbillLastBoxes?: unknown }).__splitbillLastBoxes ?? null,
    )
    if (lastBoxes) {
      const fs = await import('node:fs')
      const out = path.resolve(root, '../e2e/fixtures/kanpai-ocr-boxes.json')
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, JSON.stringify(lastBoxes, null, 2))
      console.log('Wrote boxes to', out, 'count=', Array.isArray(lastBoxes) ? lastBoxes.length : 0)
    }

    // Always dump for the fix loop
    console.log('OCR items:', JSON.stringify(items, null, 2))
    if (lastOcr) {
      console.log(
        'rawText preview:',
        (lastOcr.rawText ?? '').split('\n').slice(0, 40).join(' | '),
      )
    }

    expect(items.length, `expected ~20 items, got ${items.length}`).toBeGreaterThanOrEqual(15)

    // Critical: first priced drinks must not be shifted (Asahi≠$58)
    expect(items[0]?.price).toBe(11)
    expect(items[0]?.name).toMatch(/asahi/i)

    for (const expected of KANPAI_EXPECTED) {
      const hit = items.find((i) => expected.name.test(i.name) && i.price === expected.price)
      expect(
        hit,
        `Missing ${expected.name} @ $${expected.price}. Have: ${items
          .map((i) => `${i.name}=$${i.price}`)
          .join(', ')}`,
      ).toBeTruthy()
    }

    // Two Asahi lines (HH $6 and 8PM $16) — ensure both prices exist
    expect(items.filter((i) => /asahi/i.test(i.name)).map((i) => i.price).sort((a, b) => a - b)).toEqual(
      expect.arrayContaining([6, 11, 16]),
    )

    const sum = items.reduce((s, i) => s + i.price, 0)
    expect(Math.abs(sum - KANPAI_TOTALS.itemsSubtotal)).toBeLessThanOrEqual(1)
  })
})
