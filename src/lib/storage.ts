import type { Bill, LineItem, Person } from './types'

const STORAGE_KEY = 'splitbill.current'
const RECENT_KEY = 'splitbill.recent'

const MAX_PEOPLE = 40
const MAX_ITEMS = 200
const MAX_NAME = 160
const MAX_TITLE = 80
const MAX_MONEY = 1_000_000

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
  // Reject prototype-pollution vectors before reading fields
  if (Object.prototype.hasOwnProperty.call(value, '__proto__')) return null
  if (Object.prototype.hasOwnProperty.call(value, 'constructor')) return null
  return value as Record<string, unknown>
}

function clampMoney(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return 0
  return Math.min(MAX_MONEY, Math.round(n * 100) / 100)
}

function cleanText(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback
  // Strip control chars; React already escapes HTML on render
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max)
}

function sanitizePerson(raw: unknown): Person | null {
  const obj = asRecord(raw)
  if (!obj) return null
  const id = cleanText(obj.id, 64)
  const name = cleanText(obj.name, MAX_NAME)
  if (!id || !name) return null
  return { id, name }
}

function sanitizeItem(raw: unknown, peopleIds: Set<string>): LineItem | null {
  const obj = asRecord(raw)
  if (!obj) return null
  const id = cleanText(obj.id, 64)
  if (!id) return null
  const name = cleanText(obj.name, MAX_NAME)
  const price = clampMoney(obj.price)
  const assigneeRaw = Array.isArray(obj.assigneeIds) ? obj.assigneeIds : []
  const assigneeIds = assigneeRaw
    .filter((a): a is string => typeof a === 'string')
    .map((a) => cleanText(a, 64))
    .filter((a) => a && peopleIds.has(a))
    .slice(0, MAX_PEOPLE)
  return { id, name, price, assigneeIds }
}

/** Validate and normalize persisted bill data before trusting it in UI state. */
export function sanitizeBill(raw: unknown): Bill | null {
  const obj = asRecord(raw)
  if (!obj) return null

  const id = cleanText(obj.id, 64)
  if (!id) return null

  const people: Person[] = []
  const peopleIds = new Set<string>()
  if (Array.isArray(obj.people)) {
    for (const p of obj.people.slice(0, MAX_PEOPLE)) {
      const person = sanitizePerson(p)
      if (!person || peopleIds.has(person.id)) continue
      peopleIds.add(person.id)
      people.push(person)
    }
  }

  const items: LineItem[] = []
  if (Array.isArray(obj.items)) {
    for (const item of obj.items.slice(0, MAX_ITEMS)) {
      const line = sanitizeItem(item, peopleIds)
      if (line) items.push(line)
    }
  }

  const currency = cleanText(obj.currency, 4, '$') || '$'
  const updatedAt =
    typeof obj.updatedAt === 'string' && obj.updatedAt.length < 40
      ? obj.updatedAt
      : new Date().toISOString()

  return {
    id,
    title: cleanText(obj.title, MAX_TITLE, 'Dinner') || 'Dinner',
    people,
    items,
    tax: clampMoney(obj.tax),
    serviceCharge: clampMoney(obj.serviceCharge),
    tip: clampMoney(obj.tip),
    currency,
    updatedAt,
  }
}

export function loadBill(): Bill | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw || raw.length > 500_000) return null
    return sanitizeBill(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function saveBill(bill: Bill): void {
  const safe = sanitizeBill(bill)
  if (!safe) return
  const next = { ...safe, updatedAt: new Date().toISOString() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  pushRecent(next)
}

export function clearBill(): void {
  localStorage.removeItem(STORAGE_KEY)
}

function pushRecent(bill: Bill): void {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    const prior = Array.isArray(list)
      ? list.map(sanitizeBill).filter((b): b is Bill => b != null)
      : []
    const filtered = prior.filter((b) => b.id !== bill.id)
    const next = [bill, ...filtered].slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // ignore quota / parse errors
  }
}

export function loadRecent(): Bill[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw || raw.length > 1_000_000) return []
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return []
    return list.map(sanitizeBill).filter((b): b is Bill => b != null).slice(0, 5)
  } catch {
    return []
  }
}
