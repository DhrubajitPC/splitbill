import type { Bill } from './types'

const STORAGE_KEY = 'splitbill.current'
const RECENT_KEY = 'splitbill.recent'

export function loadBill(): Bill | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Bill
    return {
      ...parsed,
      serviceCharge: parsed.serviceCharge ?? 0,
      tip: parsed.tip ?? 0,
      tax: parsed.tax ?? 0,
    }
  } catch {
    return null
  }
}

export function saveBill(bill: Bill): void {
  const next = { ...bill, updatedAt: new Date().toISOString() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  pushRecent(next)
}

export function clearBill(): void {
  localStorage.removeItem(STORAGE_KEY)
}

function pushRecent(bill: Bill): void {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const list: Bill[] = raw ? (JSON.parse(raw) as Bill[]) : []
    const filtered = list.filter((b) => b.id !== bill.id)
    const next = [bill, ...filtered].slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // ignore quota errors
  }
}

export function loadRecent(): Bill[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Bill[]
  } catch {
    return []
  }
}
