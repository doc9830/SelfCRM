import type { Order, OrderStatus } from '../types'
import { round2 } from './format'

export type PeriodKey = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom'

// Единый список периодов: используется чипами на экране статистики и разбором
// параметра period из адреса (utils/links.ts).
export const PERIOD_KEYS: PeriodKey[] = [
  'today',
  'week',
  'month',
  'quarter',
  'year',
  'all',
  'custom',
]

// Границы периода в миллисекундах; null означает «без ограничения».
export interface DateRange {
  from: number | null
  to: number | null
}

export interface RevenueEntry {
  key: string
  label: string
  qty: number
  total: number
}

export interface OrderSummary {
  count: number
  revenue: number
  average: number
  byStatus: Record<OrderStatus, number>
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function range(from: Date | null, to: Date | null): DateRange {
  return { from: from ? from.getTime() : null, to: to ? to.getTime() : null }
}

// Возвращает границы периода для фильтрации заказов по дате.
export function periodRange(
  period: PeriodKey,
  now: Date = new Date(),
  custom?: { from?: string; to?: string },
): DateRange {
  const today = startOfDay(now)
  switch (period) {
    case 'today':
      return range(today, endOfDay(now))
    case 'week': {
      // Последние 7 дней, включая сегодняшний.
      const from = new Date(today)
      from.setDate(from.getDate() - 6)
      return range(from, endOfDay(now))
    }
    case 'month':
      return range(new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(now))
    case 'quarter':
      return range(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1), endOfDay(now))
    case 'year':
      return range(new Date(now.getFullYear(), 0, 1), endOfDay(now))
    case 'all':
      return { from: null, to: null }
    case 'custom': {
      const from = custom?.from ? startOfDay(new Date(`${custom.from}T00:00:00`)) : null
      const to = custom?.to ? endOfDay(new Date(`${custom.to}T00:00:00`)) : null
      return range(from, to)
    }
  }
}

export function orderTotal(order: Order): number {
  return round2(order.items.reduce((sum, item) => sum + item.price * item.qty, 0))
}

export function isWithinRange(iso: string, bounds: DateRange): boolean {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return false
  if (bounds.from !== null && time < bounds.from) return false
  if (bounds.to !== null && time > bounds.to) return false
  return true
}

export function filterOrdersByRange(orders: Order[], bounds: DateRange): Order[] {
  return orders.filter((order) => isWithinRange(order.date, bounds))
}

// Отменённые заказы не попадают в выручку, средний чек и топы.
export function summarizeOrders(orders: Order[]): OrderSummary {
  const byStatus: Record<OrderStatus, number> = { new: 0, in_progress: 0, done: 0, cancelled: 0 }
  let revenue = 0
  let payable = 0
  for (const order of orders) {
    byStatus[order.status] += 1
    if (order.status === 'cancelled') continue
    revenue = round2(revenue + orderTotal(order))
    payable += 1
  }
  return {
    count: orders.length,
    revenue,
    average: payable ? round2(revenue / payable) : 0,
    byStatus,
  }
}

export function groupRevenue(
  orders: Order[],
  getKey: (order: Order) => string | null,
): RevenueEntry[] {
  const map = new Map<string, RevenueEntry>()
  for (const order of orders) {
    if (order.status === 'cancelled') continue
    const key = getKey(order)
    if (!key) continue
    const entry = map.get(key) ?? { key, label: key, qty: 0, total: 0 }
    entry.qty += 1
    entry.total = round2(entry.total + orderTotal(order))
    map.set(key, entry)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export function groupItemRevenue(orders: Order[]): RevenueEntry[] {
  const map = new Map<string, RevenueEntry>()
  for (const order of orders) {
    if (order.status === 'cancelled') continue
    for (const item of order.items) {
      const key = item.productId ?? `name:${item.name}`
      const entry = map.get(key) ?? { key, label: item.name, qty: 0, total: 0 }
      entry.qty += item.qty
      entry.total = round2(entry.total + item.price * item.qty)
      map.set(key, entry)
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}
