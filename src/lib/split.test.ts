import { describe, expect, it } from 'vitest'
import { computeSplit, formatMoney, shareForPerson } from './split'
import type { LineItem, Person } from './types'

const alex: Person = { id: 'p1', name: 'Alex' }
const sam: Person = { id: 'p2', name: 'Sam' }
const jordan: Person = { id: 'p3', name: 'Jordan' }

describe('shareForPerson', () => {
  it('splits equally among assignees', () => {
    const item: LineItem = {
      id: 'i1',
      name: 'Pizza',
      price: 30,
      assigneeIds: ['p1', 'p2'],
    }
    expect(shareForPerson(item, 'p1')).toBe(15)
    expect(shareForPerson(item, 'p2')).toBe(15)
    expect(shareForPerson(item, 'p3')).toBe(0)
  })

  it('charges nothing when person did not partake', () => {
    const item: LineItem = {
      id: 'i1',
      name: 'Wine',
      price: 40,
      assigneeIds: ['p1'],
    }
    expect(shareForPerson(item, 'p2')).toBe(0)
  })

  it('returns 0 for unassigned items', () => {
    const item: LineItem = {
      id: 'i1',
      name: 'Mystery',
      price: 10,
      assigneeIds: [],
    }
    expect(shareForPerson(item, 'p1')).toBe(0)
  })
})

describe('computeSplit', () => {
  it('splits items fairly and allocates tax/tip proportionally', () => {
    const items: LineItem[] = [
      { id: 'i1', name: 'Burger', price: 20, assigneeIds: ['p1'] },
      { id: 'i2', name: 'Salad', price: 10, assigneeIds: ['p2'] },
      { id: 'i3', name: 'Fries', price: 10, assigneeIds: ['p1', 'p2'] },
    ]
    // Alex: 20 + 5 = 25; Sam: 10 + 5 = 15; ratio 25:15
    const result = computeSplit([alex, sam], items, 8, 4)

    const a = result.people.find((p) => p.personId === 'p1')!
    const s = result.people.find((p) => p.personId === 'p2')!

    expect(a.itemsSubtotal).toBe(25)
    expect(s.itemsSubtotal).toBe(15)
    expect(a.taxShare).toBe(5) // 25/40 * 8
    expect(s.taxShare).toBe(3) // 15/40 * 8
    expect(a.tipShare).toBe(2.5)
    expect(s.tipShare).toBe(1.5)
    expect(a.total).toBe(32.5)
    expect(s.total).toBe(19.5)
    expect(result.unassignedItemIds).toEqual([])
  })

  it('allocates service charge like tax on top of consumption share', () => {
    // Kanpai-style: $310 items, $31 svc (10%), $30.69 tax (9% on items+svc)
    const items: LineItem[] = [
      { id: 'i1', name: 'A', price: 200, assigneeIds: ['p1'] },
      { id: 'i2', name: 'B', price: 110, assigneeIds: ['p2'] },
    ]
    const result = computeSplit([alex, sam], items, 30.69, 0, 31)
    const a = result.people.find((p) => p.personId === 'p1')!
    const s = result.people.find((p) => p.personId === 'p2')!

    expect(a.serviceShare).toBe(20) // 200/310 * 31
    expect(s.serviceShare).toBe(11)
    expect(a.taxShare).toBe(19.8) // 200/310 * 30.69
    expect(s.taxShare).toBe(10.89)
    expect(result.grandTotal).toBe(371.69)
    expect(a.total + s.total).toBe(371.69)
  })

  it('does not charge a person for items they skipped', () => {
    const items: LineItem[] = [
      { id: 'i1', name: 'Steak', price: 40, assigneeIds: ['p1'] },
      { id: 'i2', name: 'Soup', price: 12, assigneeIds: ['p2', 'p3'] },
    ]
    const result = computeSplit([alex, sam, jordan], items, 0, 0)
    const a = result.people.find((p) => p.personId === 'p1')!
    const s = result.people.find((p) => p.personId === 'p2')!
    const j = result.people.find((p) => p.personId === 'p3')!

    expect(a.total).toBe(40)
    expect(s.total).toBe(6)
    expect(j.total).toBe(6)
  })

  it('flags unassigned items and reports unassigned amount', () => {
    const items: LineItem[] = [
      { id: 'i1', name: 'Assigned', price: 10, assigneeIds: ['p1'] },
      { id: 'i2', name: 'Orphan', price: 7, assigneeIds: [] },
    ]
    const result = computeSplit([alex], items, 2, 0, 1)
    expect(result.unassignedItemIds).toEqual(['i2'])
    expect(result.unassignedAmount).toBe(7)
    expect(result.people[0].itemsSubtotal).toBe(10)
    expect(result.people[0].serviceShare).toBe(1)
    expect(result.people[0].taxShare).toBe(2)
    expect(result.people[0].total).toBe(13)
    expect(result.grandTotal).toBe(20) // 17 items + 1 svc + 2 tax
  })

  it('splits tax/tip evenly when all subtotals are zero', () => {
    const result = computeSplit([alex, sam], [], 10, 5)
    expect(result.people[0].total).toBe(0)
    expect(result.people[1].total).toBe(0)
  })
})

describe('formatMoney', () => {
  it('formats with currency symbol', () => {
    expect(formatMoney(12.5, '$')).toBe('$12.50')
    expect(formatMoney(0, '€')).toBe('€0.00')
  })
})
