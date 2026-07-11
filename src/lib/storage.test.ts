import { describe, expect, it } from 'vitest'
import { sanitizeBill } from './storage'

describe('sanitizeBill', () => {
  it('accepts a well-formed bill', () => {
    const bill = sanitizeBill({
      id: 'bill_1',
      title: 'Dinner',
      people: [{ id: 'p1', name: 'Alex' }],
      items: [{ id: 'i1', name: 'Fries', price: 14, assigneeIds: ['p1'] }],
      tax: 1.2,
      serviceCharge: 3,
      tip: 0,
      currency: '$',
      updatedAt: '2026-07-11T00:00:00.000Z',
    })
    expect(bill?.items[0]?.price).toBe(14)
    expect(bill?.serviceCharge).toBe(3)
  })

  it('drops prototype pollution keys and invalid assignees', () => {
    const polluted = JSON.parse('{"id":"bill_x","title":"x","people":[{"id":"p1","name":"A"}],"items":[{"id":"i1","name":"Soup","price":5,"assigneeIds":["p1","evil"]}],"tax":0,"tip":0,"currency":"$","updatedAt":"t","__proto__":{"admin":true}}')
    const bill = sanitizeBill(polluted)
    expect(bill).toBeNull()
  })

  it('clamps money and strips control characters from names', () => {
    const bill = sanitizeBill({
      id: 'bill_2',
      title: 'Ok',
      people: [{ id: 'p1', name: 'Al\u0000ex' }],
      items: [{ id: 'i1', name: 'Nachos', price: -5, assigneeIds: ['p1'] }],
      tax: Number.POSITIVE_INFINITY,
      serviceCharge: 1e12,
      tip: 'nope',
      currency: '$',
      updatedAt: 't',
    })
    expect(bill?.people[0]?.name).toBe('Alex')
    expect(bill?.items[0]?.price).toBe(0)
    expect(bill?.tax).toBe(0)
    expect(bill?.serviceCharge).toBe(1_000_000)
    expect(bill?.tip).toBe(0)
  })
})
