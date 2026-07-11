import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DTF_EXPECTED, DTF_TOTALS } from './dtf-expected'

const root = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(root, '../public/fixtures/din-tai-fung-receipt.png')

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

async function readExtras(page: Page) {
  return page.locator('.extras input').evaluateAll((inputs) =>
    inputs.map((el) => Number.parseFloat((el as HTMLInputElement).value) || 0),
  )
}

test.describe('Din Tai Fung receipt OCR', () => {
  test('extracts bilingual menu lines and service/GST — not the grand total', async ({
    page,
  }) => {
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
      timeout: 180_000,
    })

    const items = await readReviewItems(page)
    const extras = await readExtras(page)
    const [service = 0, tax = 0] = extras

    const lastOcr = await page.evaluate(() => window.__splitbillLastOcr ?? null)
    const lastBoxes = await page.evaluate(
      () => (window as unknown as { __splitbillLastBoxes?: unknown }).__splitbillLastBoxes ?? null,
    )
    if (lastBoxes) {
      const fs = await import('node:fs')
      const out = path.resolve(root, '../e2e/fixtures/dtf-ocr-boxes.json')
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, JSON.stringify(lastBoxes, null, 2))
      console.log('Wrote DTF boxes', Array.isArray(lastBoxes) ? lastBoxes.length : 0)
    }
    console.log('DTF items:', JSON.stringify(items, null, 2))
    console.log('DTF extras service/tax/tip:', extras)
    if (lastOcr) {
      console.log(
        'raw preview:',
        (lastOcr.rawText ?? '').split('\n').slice(0, 50).join(' | '),
      )
    }

    // Must not treat grand total as an item (the prior Gemini failure mode)
    expect(items.some((i) => Math.abs(i.price - DTF_TOTALS.total) < 0.05)).toBe(false)
    expect(items.length).toBeGreaterThanOrEqual(10)

    const sum = items.reduce((s, i) => s + i.price, 0)
    expect(Math.abs(sum - DTF_TOTALS.itemsSubtotal)).toBeLessThanOrEqual(3)

    // Service + GST should land in extras (not as line items)
    expect(Math.abs(service - DTF_TOTALS.serviceCharge)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(tax - DTF_TOTALS.tax)).toBeLessThanOrEqual(0.5)

    let hits = 0
    for (const expected of DTF_EXPECTED) {
      const hit = items.find((i) => expected.name.test(i.name) && Math.abs(i.price - expected.price) < 0.06)
      if (hit) hits++
    }
    expect(
      hits,
      `Only matched ${hits}/${DTF_EXPECTED.length}. Have: ${items
        .map((i) => `${i.name}=$${i.price}`)
        .join(', ')}`,
    ).toBeGreaterThanOrEqual(10)
  })
})
