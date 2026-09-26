import { describe, expect, it } from 'vitest'
import type { Order } from '../types'
import {
  PAYMENT_STATUS_LABEL,
  addPayment,
  dueSummary,
  orderPaid,
  orderPaymentState,
  ordersWithDue,
  paymentState,
  remainingToPay,
  removePayment,
} from './payments'

function makeOrder(partial: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    number: 1,
    clientId: null,
    date: new Date(2026, 8, 19, 12).toISOString(),
    status: 'new',
    items: [{ productId: null, name: 'Работа', price: 100, qty: 3 }],
    payments: [],
    comment: '',
    ...partial,
  }
}

describe('состояние оплаты', () => {
  it('без платежей заказ не оплачен', () => {
    const state = paymentState(300, 0)
    expect(state.status).toBe('unpaid')
    expect(state.percent).toBe(0)
    expect(state.remaining).toBe(300)
  })

  it('частичная оплата показывает процент и остаток', () => {
    const state = paymentState(300, 100)
    expect(state.status).toBe('partial')
    expect(state.percent).toBe(33)
    expect(state.remaining).toBe(200)
  })

  it('полная оплата закрывает остаток', () => {
    const state = paymentState(300, 300)
    expect(state.status).toBe('paid')
    expect(state.percent).toBe(100)
    expect(state.remaining).toBe(0)
  })

  it('переплата отмечается отдельным статусом', () => {
    const state = paymentState(300, 350)
    expect(state.status).toBe('overpaid')
    expect(state.percent).toBe(100)
    expect(state.remaining).toBe(0)
  })

  it('нулевой заказ без платежей не считается оплаченным', () => {
    expect(paymentState(0, 0).status).toBe('unpaid')
    expect(paymentState(0, 50).status).toBe('paid')
  })

  it('для каждого статуса есть подпись', () => {
    expect(PAYMENT_STATUS_LABEL.partial).toBe('Частично оплачен')
    expect(Object.keys(PAYMENT_STATUS_LABEL)).toHaveLength(4)
  })
})

describe('платежи по заказу', () => {
  it('сумма платежей — это «оплачено»', () => {
    const order = addPayment(addPayment(makeOrder(), 100, 'Предоплата'), 200, 'Доплата')
    expect(orderPaid(order)).toBe(300)
    expect(orderPaymentState(order).status).toBe('paid')
    expect(remainingToPay(order)).toBe(0)
  })

  it('добавляет комментарий и не меняет исходный заказ', () => {
    const order = makeOrder()
    const paid = addPayment(order, 50, '  Аванс  ')
    expect(order.payments).toHaveLength(0)
    expect(paid.payments?.[0].comment).toBe('Аванс')
    expect(orderPaid(paid)).toBe(50)
  })

  it('удаляет платёж по идентификатору', () => {
    const order = addPayment(makeOrder(), 100, 'Аванс')
    const paymentId = order.payments?.[0].id as string
    const withoutPayment = removePayment(order, paymentId)
    expect(withoutPayment.payments).toHaveLength(0)
    expect(orderPaid(withoutPayment)).toBe(0)
  })

  it('заказ без поля payments читается как неоплаченный', () => {
    const order = makeOrder()
    delete order.payments
    expect(orderPaid(order)).toBe(0)
    expect(remainingToPay(order)).toBe(300)
  })
})

describe('«К оплате» — список долгов', () => {
  const paid = (amount: number) => ({ id: `p-${amount}`, amount, date: new Date(2026, 8, 20, 12).toISOString(), comment: '' })

  it('без долгов список пуст', () => {
    const order = makeOrder({ payments: [paid(300)] })
    expect(ordersWithDue([order])).toEqual([])
    expect(dueSummary([order])).toEqual({ total: 0, count: 0, entries: [] })
  })

  it('полностью неоплаченный заказ — это долг на всю сумму', () => {
    const summary = dueSummary([makeOrder()])
    expect(summary.total).toBe(300)
    expect(summary.count).toBe(1)
    expect(summary.entries[0].state.remaining).toBe(300)
  })

  it('частичная оплата уменьшает долг', () => {
    const summary = dueSummary([makeOrder({ payments: [paid(100)] })])
    expect(summary.total).toBe(200)
  })

  it('несколько платежей складываются', () => {
    const order = makeOrder({ payments: [paid(100), paid(150)] })
    expect(dueSummary([order]).total).toBe(50)
  })

  it('переплата долга не создаёт', () => {
    const summary = dueSummary([makeOrder({ payments: [paid(400)] })])
    expect(summary.total).toBe(0)
    expect(summary.count).toBe(0)
  })

  it('отменённый заказ долгом не считается', () => {
    const summary = dueSummary([makeOrder({ status: 'cancelled' })])
    expect(summary.count).toBe(0)
  })

  it('несколько заказов: сначала самые большие долги, при равенстве — старые', () => {
    const big = makeOrder({
      id: 'big',
      items: [{ productId: null, name: 'Работа', price: 1000, qty: 1 }],
      date: new Date(2026, 8, 25, 12).toISOString(),
    })
    const old = makeOrder({ id: 'old', date: new Date(2026, 8, 1, 12).toISOString() })
    const young = makeOrder({ id: 'young', date: new Date(2026, 8, 20, 12).toISOString() })
    const summary = dueSummary([old, big, young])
    expect(summary.total).toBe(1600)
    expect(summary.count).toBe(3)
    expect(summary.entries.map((entry) => entry.order.id)).toEqual(['big', 'old', 'young'])
  })
})
