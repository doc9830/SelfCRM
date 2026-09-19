import { describe, expect, it } from 'vitest'
import type { Order } from '../types'
import {
  assignMissingNumbers,
  formatOrderNumber,
  nextOrderNumber,
  orderHeading,
  orderTitle,
} from './orders'

function makeOrder(partial: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    clientId: null,
    date: new Date(2026, 8, 19, 12).toISOString(),
    status: 'new',
    items: [],
    payments: [],
    comment: '',
    ...partial,
  }
}

describe('нумерация заказов', () => {
  it('следующий номер — максимум плюс один', () => {
    expect(nextOrderNumber([])).toBe(1)
    expect(nextOrderNumber([makeOrder({ number: 1 }), makeOrder({ number: 7 })])).toBe(8)
  })

  it('не учитывает заказы без номера', () => {
    expect(nextOrderNumber([makeOrder(), makeOrder({ number: 3 })])).toBe(4)
  })

  it('присваивает номера старым заказам по возрастанию даты', () => {
    const older = makeOrder({ id: 'older', date: new Date(2026, 8, 10).toISOString() })
    const newer = makeOrder({ id: 'newer', date: new Date(2026, 8, 15).toISOString() })
    const already = makeOrder({ id: 'already', number: 5, date: new Date(2026, 8, 16).toISOString() })

    expect(assignMissingNumbers([newer, older, already])).toBe(true)
    expect(older.number).toBe(6)
    expect(newer.number).toBe(7)
    expect(already.number).toBe(5)
  })

  it('сообщает, что менять нечего, когда номера есть у всех', () => {
    expect(assignMissingNumbers([makeOrder({ number: 1 })])).toBe(false)
  })
})

describe('подписи заказа', () => {
  it('показывает номер, заголовок и дату', () => {
    const order = makeOrder({ number: 42, date: new Date(2026, 8, 19, 12).toISOString() })
    expect(formatOrderNumber(order)).toBe('№42')
    expect(orderTitle(order)).toBe('Заказ №42')
    expect(orderHeading(order)).toBe('Заказ №42 от 19.09.2026')
  })

  it('без номера обходится общим названием', () => {
    expect(formatOrderNumber(makeOrder())).toBe('')
    expect(orderTitle(makeOrder())).toBe('Заказ')
  })
})
