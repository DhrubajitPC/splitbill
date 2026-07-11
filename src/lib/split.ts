import type { Bill, LineItem, Person, PersonId } from './types'

export interface PersonTotal {
  personId: PersonId
  name: string
  itemsSubtotal: number
  serviceShare: number
  taxShare: number
  tipShare: number
  total: number
}

export interface SplitResult {
  people: PersonTotal[]
  itemsSubtotal: number
  assignedSubtotal: number
  unassignedAmount: number
  grandTotal: number
  unassignedItemIds: string[]
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Split a single item equally among its assignees. */
export function shareForPerson(item: LineItem, personId: PersonId): number {
  if (item.assigneeIds.length === 0) return 0
  if (!item.assigneeIds.includes(personId)) return 0
  return item.price / item.assigneeIds.length
}

/**
 * Compute per-person totals.
 * Items split equally among assignees; service, tax & tip proportional to each person's item subtotal.
 * Service is treated like tax (typically % of consumption); tax often sits on top of consumption+service.
 */
export function computeSplit(
  people: Person[],
  items: LineItem[],
  tax: number,
  tip: number,
  serviceCharge = 0,
): SplitResult {
  const unassignedItems = items.filter((item) => item.assigneeIds.length === 0 && item.price > 0)
  const unassignedItemIds = unassignedItems.map((item) => item.id)
  const unassignedAmount = unassignedItems.reduce((sum, item) => sum + item.price, 0)

  const itemsSubtotal = items.reduce((sum, item) => sum + item.price, 0)

  const rawSubtotals = new Map<PersonId, number>()
  for (const person of people) {
    let sub = 0
    for (const item of items) {
      sub += shareForPerson(item, person.id)
    }
    rawSubtotals.set(person.id, sub)
  }

  const assignedSubtotal = [...rawSubtotals.values()].reduce((a, b) => a + b, 0)

  const result: PersonTotal[] = people.map((person) => {
    const itemsShare = rawSubtotals.get(person.id) ?? 0
    const ratio = assignedSubtotal > 0 ? itemsShare / assignedSubtotal : 0
    const serviceShare = serviceCharge * ratio
    const taxShare = tax * ratio
    const tipShare = tip * ratio
    return {
      personId: person.id,
      name: person.name,
      itemsSubtotal: roundMoney(itemsShare),
      serviceShare: roundMoney(serviceShare),
      taxShare: roundMoney(taxShare),
      tipShare: roundMoney(tipShare),
      total: roundMoney(itemsShare + serviceShare + taxShare + tipShare),
    }
  })

  // Fix penny drift on assigned portion by adjusting the largest payer if needed
  const sumTotals = result.reduce((s, p) => s + p.total, 0)
  const expected = roundMoney(
    assignedSubtotal + (assignedSubtotal > 0 ? serviceCharge + tax + tip : 0),
  )
  const drift = roundMoney(expected - sumTotals)
  if (drift !== 0 && result.length > 0) {
    const richest = result.reduce((a, b) => (a.total >= b.total ? a : b))
    richest.total = roundMoney(richest.total + drift)
  }

  return {
    people: result,
    itemsSubtotal: roundMoney(itemsSubtotal),
    assignedSubtotal: roundMoney(assignedSubtotal),
    unassignedAmount: roundMoney(unassignedAmount),
    grandTotal: roundMoney(itemsSubtotal + serviceCharge + tax + tip),
    unassignedItemIds,
  }
}

export function computeBillSplit(bill: Bill): SplitResult {
  return computeSplit(
    bill.people,
    bill.items,
    bill.tax,
    bill.tip,
    bill.serviceCharge ?? 0,
  )
}

export function formatMoney(amount: number, currency = '$'): string {
  const sign = amount < 0 ? '-' : ''
  return `${sign}${currency}${Math.abs(amount).toFixed(2)}`
}

export function summaryText(bill: Bill, split: SplitResult): string {
  const lines = split.people.map(
    (p) => `${p.name}: ${formatMoney(p.total, bill.currency)}`,
  )
  if (split.unassignedAmount > 0) {
    lines.push(
      `Unassigned: ${formatMoney(split.unassignedAmount, bill.currency)}`,
    )
  }
  return [`${bill.title} split`, ...lines].join('\n')
}
