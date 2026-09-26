// Проверки сборки данных отчёта: числа должны совпадать с экраном статистики,
// а долги — считаться той же формулой, что в карточке заказа.
import { describe, expect, it } from 'vitest'
import type { Client, Order, Payment } from '../types'
import {
  REPORT_PERIOD_LABEL,
  buildReportData,
  rangeLabel,
  rangeText,
  reportBounds,
  reportMessage,
  reportPeriod,
} from './report'

function makeClient(partial: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    name: 'Иванов Иван',
    phone: '',
    email: '',
    comment: '',
    createdAt: new Date(2026, 0, 1).toISOString(),
    ...partial,
  }
}

function makeOrder(partial: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    number: 1,
    clientId: 'c1',
    date: new Date(2026, 8, 10, 12).toISOString(),
    status: 'done',
    items: [{ productId: 'p1', name: 'Плитка', price: 1000, qty: 2, cost: 600 }],
    payments: [],
    comment: '',
    ...partial,
  }
}

function payment(amount: number, day = 10): Payment {
  return { id: `pay-${amount}-${day}`, amount, date: new Date(2026, 8, day, 12).toISOString(), comment: '' }
}

// Период «всё время»: в тестах он не зависит от текущей даты.
const ALL_TIME = reportPeriod('all')

describe('периоды отчёта', () => {
  it('у каждого периода есть подпись', () => {
    expect(REPORT_PERIOD_LABEL.month).toBe('Месяц')
    expect(Object.keys(REPORT_PERIOD_LABEL)).toHaveLength(7)
  })

  it('произвольный период берёт границы из полей «с» и «по»', () => {
    const period = reportPeriod(
      'custom',
      { from: '2026-09-01', to: '2026-09-26' },
      new Date(2026, 8, 26, 15),
    )
    const bounds = reportBounds(period)
    expect(new Date(bounds.from as number).getDate()).toBe(1)
    expect(new Date(bounds.to as number).getDate()).toBe(26)
    expect(rangeText(bounds)).toBe(`${'01.09.2026'} — ${'26.09.2026'}`)
    expect(period.label).toBe('Произвольный период')
  })

  it('«всё время» не ограничено датами', () => {
    expect(reportBounds(ALL_TIME)).toEqual({ from: null, to: null })
    expect(rangeLabel(reportBounds(ALL_TIME))).toBe('Период: за всё время')
  })

  it('месяц начинается с первого числа', () => {
    const period = reportPeriod('month', {}, new Date(2026, 8, 26, 15))
    const bounds = reportBounds(period)
    expect(new Date(bounds.from as number).getDate()).toBe(1)
    expect(new Date(bounds.to as number).getDate()).toBe(26)
    expect(rangeLabel(bounds)).toBe('Период: 01.09.2026 — 26.09.2026')
  })

  it('подпись отчёта называет период', () => {
    const data = buildReportData({ orders: [], clients: [], period: ALL_TIME })
    expect(reportMessage(data)).toBe('Отчёт SelfCRM: за всё время')
  })
})

describe('отчёт: пустая база', () => {
  it('листы пустые, но сводка корректная', () => {
    const data = buildReportData({ orders: [], clients: [], period: ALL_TIME })
    expect(data.summary.count).toBe(0)
    expect(data.summary.revenue).toBe(0)
    expect(data.summary.average).toBe(0)
    expect(data.summary.paid).toBe(0)
    expect(data.summary.due).toBe(0)
    expect(data.orders).toHaveLength(0)
    expect(data.positions).toHaveLength(0)
    expect(data.clients).toHaveLength(0)

describe('отчёт: заказы и оплата', () => {
  it('один заказ: продажа, себестоимость и прибыль', () => {
    const data = buildReportData({ orders: [makeOrder()], clients: [makeClient()], period: ALL_TIME })
    expect(data.summary.count).toBe(1)
    expect(data.summary.byStatus.done).toBe(1)
    expect(data.summary.revenue).toBe(2000)
    expect(data.summary.cost).toBe(1200)
    expect(data.summary.profit).toBe(800)
    expect(data.summary.average).toBe(2000)
    expect(data.summary.paid).toBe(0)
    expect(data.summary.due).toBe(2000)
    expect(data.orders).toHaveLength(1)
    expect(data.orders[0]).toMatchObject({
      number: '№1',
      client: 'Иванов Иван',
      status: 'done',
      total: 2000,
      paid: 0,
      due: 2000,
      cost: 1200,
      profit: 800,
    })
  })

  it('несколько платежей одного заказа складываются в «оплачено»', () => {
    const order = makeOrder({ payments: [payment(500), payment(700, 12)] })
    const data = buildReportData({ orders: [order], clients: [makeClient()], period: ALL_TIME })
    expect(data.summary.paid).toBe(1200)
    expect(data.summary.due).toBe(800)
    expect(data.orders[0].paid).toBe(1200)
    expect(data.orders[0].due).toBe(800)
  })

  it('частично оплаченный заказ остаётся в списке к оплате', () => {
    const order = makeOrder({ payments: [payment(1500)] })
    const data = buildReportData({ orders: [order], clients: [makeClient()], period: ALL_TIME })
    expect(data.summary.due).toBe(500)
    expect(data.orders[0].due).toBe(500)
  })

  it('полностью оплаченный заказ долга не даёт', () => {
    const order = makeOrder({ payments: [payment(2000)] })
    const data = buildReportData({ orders: [order], clients: [makeClient()], period: ALL_TIME })
    expect(data.summary.paid).toBe(2000)
    expect(data.summary.due).toBe(0)
    expect(data.orders[0].due).toBe(0)
  })

  it('отменённый заказ не продажа и не долг', () => {
    const cancelled = makeOrder({ id: 'o2', number: 2, status: 'cancelled' })
    const data = buildReportData({ orders: [cancelled], clients: [makeClient()], period: ALL_TIME })
    // В сводке заказ виден числом, но ни выручки, ни строк в продажах не даёт.
    expect(data.summary.count).toBe(1)
    expect(data.summary.byStatus.cancelled).toBe(1)
    expect(data.summary.revenue).toBe(0)
    expect(data.summary.due).toBe(0)
    expect(data.orders).toHaveLength(0)
    expect(data.positions).toHaveLength(0)
  })

  it('несколько заказов: выручка только по завершённым, «в работе» отдельно', () => {
    const data = buildReportData({
      orders: [
        makeOrder(),
        makeOrder({ id: 'o2', number: 2, status: 'in_progress', payments: [payment(300)] }),
        makeOrder({ id: 'o3', number: 3, status: 'new' }),
      ],
      clients: [makeClient()],
      period: ALL_TIME,
    })
    expect(data.summary.count).toBe(3)
    expect(data.summary.revenue).toBe(2000)
    expect(data.summary.inWork).toBe(4000)
    expect(data.summary.average).toBe(2000)
    // Оплата и долг считаются по всем неотменённым заказам периода.
    expect(data.summary.paid).toBe(300)
    expect(data.summary.due).toBe(5700)
    expect(data.orders).toHaveLength(3)
  })

  it('заказ без клиента и с удалённым клиентом подписан словами', () => {
    const data = buildReportData({
      orders: [makeOrder({ clientId: null }), makeOrder({ id: 'o2', number: 2, clientId: 'gone' })],
      clients: [],
      period: ALL_TIME,
    })
    expect(data.orders.map((row) => row.client)).toEqual(['Без клиента', 'Удалённый клиент'])
  })

  it('архивный клиент помечен в отчёте', () => {
    const data = buildReportData({
      orders: [makeOrder()],
      clients: [makeClient({ archived: true })],
      period: ALL_TIME,
    })
    expect(data.orders[0].client).toBe('Иванов Иван (архив)')
  })
})

    expect(data.products).toHaveLength(0)
  })

describe('отчёт: позиции, клиенты и товары', () => {
  it('позиции: себестоимость и прибыль считаются построчно', () => {
    const order = makeOrder({
      items: [
        { productId: 'p1', name: 'Плитка', price: 1000, qty: 2, cost: 600 },
        { productId: null, name: 'Укладка', price: 3000, qty: 1 },
      ],
    })
    const data = buildReportData({ orders: [order], clients: [makeClient()], period: ALL_TIME })
    expect(data.positions).toHaveLength(2)
    const [tile, laying] = data.positions
    expect(tile).toMatchObject({
      name: 'Плитка',
      qty: 2,
      price: 1000,
      cost: 1200,
      total: 2000,
      profit: 800,
    })
    // У услуги себестоимости нет: вся стоимость — прибыль.
    expect(laying).toMatchObject({ name: 'Укладка', qty: 1, cost: 0, total: 3000, profit: 3000 })
    expect(tile.orderNumber).toBe('№1')
    expect(tile.client).toBe('Иванов Иван')
  })

  it('клиенты: количество заказов, выручка и средний чек', () => {
    const data = buildReportData({
      orders: [
        makeOrder({ id: 'o1', number: 1 }),
        makeOrder({
          id: 'o2',
          number: 2,
          items: [{ productId: 'p1', name: 'Плитка', price: 1000, qty: 1, cost: 600 }],
        }),
        makeOrder({ id: 'o3', number: 3, clientId: 'c2' }),
        makeOrder({ id: 'o4', number: 4, status: 'new' }),
      ],
      clients: [makeClient(), makeClient({ id: 'c2', name: 'Петров Пётр' })],
      period: ALL_TIME,
    })
    // Считаются завершённые заказы: как и в топе клиентов на экране статистики.
    expect(data.clients).toEqual([
      { client: 'Иванов Иван', orders: 2, revenue: 3000, average: 1500 },
      { client: 'Петров Пётр', orders: 1, revenue: 2000, average: 2000 },
    ])
  })

  it('товары: продано, выручка, себестоимость и прибыль', () => {
    const data = buildReportData({
      orders: [
        makeOrder(),
        makeOrder({
          id: 'o2',
          number: 2,
          items: [
            { productId: 'p1', name: 'Плитка', price: 1000, qty: 1, cost: 600 },
            { productId: 'p2', name: 'Клей', price: 500, qty: 3, cost: 300 },
          ],
        }),
      ],
      clients: [makeClient()],
      period: ALL_TIME,
    })
    expect(data.products).toEqual([
      { name: 'Плитка', qty: 3, revenue: 3000, cost: 1800, profit: 1200 },
      { name: 'Клей', qty: 3, revenue: 1500, cost: 900, profit: 600 },
    ])
  })
})

describe('отчёт: периоды', () => {
  const orders = [
    makeOrder({ id: 'aug', number: 1, date: new Date(2026, 7, 15, 12).toISOString() }),
    makeOrder({ id: 'sep', number: 2, date: new Date(2026, 8, 10, 12).toISOString() }),
  ]

  it('заказы вне периода в отчёт не попадают', () => {
    const period = reportPeriod('month', {}, new Date(2026, 8, 26, 15))
    const data = buildReportData({ orders, clients: [makeClient()], period })
    expect(data.summary.count).toBe(1)
    expect(data.orders.map((row) => row.number)).toEqual(['№2'])
  })

  it('произвольный период берёт только свои дни', () => {
    const period = reportPeriod('custom', { from: '2026-08-01', to: '2026-08-31' })
    const data = buildReportData({ orders, clients: [makeClient()], period })
    expect(data.orders.map((row) => row.number)).toEqual(['№1'])
  })

  it('«всё время» собирает все заказы', () => {
    const data = buildReportData({ orders, clients: [makeClient()], period: ALL_TIME })
    expect(data.summary.count).toBe(2)
    expect(data.summary.revenue).toBe(4000)
  })
})

})
