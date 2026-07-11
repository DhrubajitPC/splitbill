export type PersonId = string
export type ItemId = string

export interface Person {
  id: PersonId
  name: string
}

export interface LineItem {
  id: ItemId
  name: string
  price: number
  assigneeIds: PersonId[]
}

export interface Bill {
  id: string
  title: string
  people: Person[]
  items: LineItem[]
  tax: number
  /** Service charge (e.g. 10% on consumption) — split like tax. */
  serviceCharge: number
  tip: number
  currency: string
  updatedAt: string
}

export type Step = 'people' | 'scan' | 'review' | 'assign' | 'totals'

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

export function createEmptyBill(): Bill {
  return {
    id: createId('bill'),
    title: 'Dinner',
    people: [],
    items: [],
    tax: 0,
    serviceCharge: 0,
    tip: 0,
    currency: '$',
    updatedAt: new Date().toISOString(),
  }
}
