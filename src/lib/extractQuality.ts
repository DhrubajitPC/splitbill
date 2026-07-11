import type { ParseResult } from './parseReceipt'

function letterRatio(s: string): number {
  const letters = (s.match(/[A-Za-z\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length
  return letters / Math.max(s.replace(/\s/g, '').length, 1)
}

/** Heuristic: reject hallucinated / total-as-item extracts before showing Review. */
export function isReliableExtract(result: ParseResult): boolean {
  const { items } = result
  if (items.length < 5) return false

  const sum = items.reduce((s, i) => s + i.price, 0)
  if (sum <= 0) return false

  // Grand total (or payment) mistaken as a line item
  if (result.detectedTotal != null) {
    if (items.some((i) => Math.abs(i.price - result.detectedTotal!) < 0.05)) return false
  }
  if (items.some((i) => i.price > sum * 0.5 && items.length >= 4)) return false

  let badNames = 0
  for (const item of items) {
    const name = item.name.trim()
    if (name.length < 3) badNames++
    else if (letterRatio(name) < 0.4) badNames++
    else if (/^[a-z]\s+[a-z]\b/i.test(name) && name.length < 12) badNames++
    else if (/[|]/.test(name)) badNames++
    else if (/^\d+(\.\d+)?$/.test(name)) badNames++
  }
  if (badNames > Math.max(1, Math.floor(items.length * 0.25))) return false

  // Prefer extracts that roughly reconcile with total − tax − service when present
  if (result.detectedTotal != null && result.detectedTotal > 0) {
    const extras =
      (result.detectedTax ?? 0) +
      (result.detectedTip ?? 0) +
      (result.detectedServiceCharge ?? 0)
    const expectedSub = result.detectedTotal - extras
    if (expectedSub > 1) {
      const delta = Math.abs(sum - expectedSub)
      if (delta > Math.max(8, expectedSub * 0.2)) return false
    }
  }

  return true
}

export function scoreExtract(result: ParseResult): number {
  if (!isReliableExtract(result) && result.items.length < 5) return result.items.length
  const sum = result.items.reduce((s, i) => s + i.price, 0)
  let score = result.items.length * 5
  if (result.detectedTotal != null) {
    const extras =
      (result.detectedTax ?? 0) +
      (result.detectedTip ?? 0) +
      (result.detectedServiceCharge ?? 0)
    const expected = result.detectedTotal - extras
    if (expected > 0) score += Math.max(0, 60 - Math.abs(sum - expected))
  }
  if (isReliableExtract(result)) score += 40
  return score
}
