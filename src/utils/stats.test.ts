import { describe, expect, it } from 'vitest'
import type { Order } from '../types'
import {
  filterOrdersByRange,
  groupItemRevenue,
  groupRevenue,
  orderTotal,
  periodRange,
  summarizeOrders,
} from './stats'

function makeOrder(partial: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    clientId: null,
    date: new Date(2026, 5, 15, 12).toISOString(),
    status: 'done',
    items: [{ productId: 'p1', name: 'Товар', price: 100, qty: 2 }],
    comment: '',
    ...partial,
  }
}

describe('periodRange', () => {
  const now = new Date(2026, 5, 15, 12, 0, 0) // 15 июня 2026

  it('«Сегодня» охватывает только текущий день', () => {
    const range = periodRange('today', now)
    const inside = makeOrder({ date: new Date(2026, 5, 15, 0, 30).toISOString() })
    const before = makeOrder({ date: new Date(2026, 5, 14, 23, 30).toISOString() })
    const after = makeOrder({ date: new Date(2026, 5, 16, 0, 30).toISOString() })
    expect(filterOrdersByRange([inside, before, after], range)).toEqual([inside])
  })

  it('«7 дней» включает сегодня и шесть предыдущих', () => {
    const range = periodRange('week', now)
    expect(new Date(range.from as number).getDate()).toBe(9)
    expect(new Date(range.to as number).getDate()).toBe(15)
  })

  it('«Месяц» начинается с первого числа', () => {
    const range = periodRange('month', now)
    expect(new Date(range.from as number).getMonth()).toBe(5)
    expect(new Date(range.from as number).getDate()).toBe(1)
  })

  it('«Квартал» начинается с первого месяца квартала', () => {
    const range = periodRange('quarter', now)
    expect(new Date(range.from as number).getMonth()).toBe(3)
    expect(new Date(range.from as number).getDate()).toBe(1)
  })

  it('«Год» начинается с 1 января', () => {
    const range = periodRange('year', now)
    expect(new Date(range.from as number).getMonth()).toBe(0)
    expect(new Date(range.from as number).getDate()).toBe(1)
  })

  it('«Всё время» не ограничивает диапазон', () => {
    expect(periodRange('all', now)).toEqual({ from: null, to: null })
  })

  it('произвольный период использует переданные даты', () => {
    const range = periodRange('custom', now, { from: '2026-06-01', to: '2026-06-10' })
    expect(new Date(range.from as number).getDate()).toBe(1)
    expect(new Date(range.to as number).getDate()).toBe(10)
  })
})

describe('summarizeOrders', () => {
  it('считает выручку и средний чек без отменённых заказов', () => {
    const orders = [
      makeOrder({ id: 'o1', status: 'done', items: [{ productId: 'p1', name: 'A', price: 100, qty: 2 }] }),
      makeOrder({ id: 'o2', status: 'new', items: [{ productId: 'p1', name: 'A', price: 50, qty: 2 }] }),
      makeOrder({ id: 'o3', status: 'cancelled', items: [{ productId: 'p1', name: 'A', price: 999, qty: 1 }] }),
    ]
    const summary = summarizeOrders(orders)
    expect(summary.count).toBe(3)
    expect(summary.revenue).toBe(300)
    expect(summary.average).toBe(150)
    expect(summary.byStatus).toEqual({ new: 1, in_progress: 0, done: 1, cancelled: 1 })
  })

  it('на пустом списке возвращает нули', () => {
    const summary = summarizeOrders([])
    expect(summary.count).toBe(0)
    expect(summary.revenue).toBe(0)
    expect(summary.average).toBe(0)
  })
})

describe('группировка выручки', () => {
  it('группирует заказы по ключу и сортирует по сумме', () => {
    const orders = [
      makeOrder({ id: 'o1', clientId: 'c1', items: [{ productId: 'p1', name: 'A', price: 100, qty: 2 }] }),
      makeOrder({ id: 'o2', clientId: 'c2', items: [{ productId: 'p1', name: 'A', price: 500, qty: 1 }] }),
      makeOrder({ id: 'o3', clientId: 'c1', items: [{ productId: 'p1', name: 'A', price: 100, qty: 1 }] }),
    ]
    const top = groupRevenue(orders, (o) => o.clientId)
    expect(top.map((entry) => entry.key)).toEqual(['c2', 'c1'])
    expect(top[0].total).toBe(500)
    expect(top[1].total).toBe(300)
    expect(top[1].qty).toBe(2)
  })

  it('группирует позиции заказов по товару и по названию', () => {
    const orders = [
      makeOrder({
        id: 'o1',
        items: [
          { productId: 'p1', name: 'A', price: 100, qty: 2 },
          { productId: 's1', name: 'Услуга', price: 1500, qty: 1 },
        ],
      }),
      makeOrder({
        id: 'o2',
        items: [
          { productId: 'p1', name: 'A', price: 100, qty: 3 },
          { productId: null, name: 'Вручную', price: 200, qty: 1 },
        ],
      }),
    ]
    const items = groupItemRevenue(orders)
    expect(items.map((entry) => entry.key)).toEqual(['s1', 'p1', 'name:Вручную'])
    const product = items.find((entry) => entry.key === 'p1')
    expect(product?.qty).toBe(5)
    expect(product?.total).toBe(500)
    expect(items.find((entry) => entry.key === 's1')?.total).toBe(1500)
    expect(items.find((entry) => entry.key === 'name:Вручную')?.qty).toBe(1)
  })

  it('orderTotal суммирует позиции с учётом количества', () => {
    const order = makeOrder({ items: [{ productId: null, name: 'A', price: 10.1, qty: 3 }] })
    expect(orderTotal(order)).toBe(30.3)
  })
})
