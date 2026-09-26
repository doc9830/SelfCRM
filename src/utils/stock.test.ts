import { describe, expect, it } from 'vitest'
import type { Order, StockMove } from '../types'
import { formatStockDelta, stockMoveOrder, stockMoveTitle, stockMoveTone } from './stock'

function makeMove(partial: Partial<StockMove> = {}): StockMove {
  return {
    id: 'm1',
    productId: 'p1',
    date: new Date(2026, 8, 19, 12).toISOString(),
    delta: 1,
    kind: 'in',
    note: '',
    stockAfter: 1,
    ...partial,
  }
}

function makeOrder(partial: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    number: 42,
    clientId: null,
    date: new Date(2026, 8, 19, 12).toISOString(),
    status: 'new',
    items: [],
    comment: '',
    ...partial,
  }
}

describe('подписи движений склада', () => {
  it('показывает знак изменения', () => {
    expect(formatStockDelta(20)).toBe('+20')
    expect(formatStockDelta(-3)).toBe('-3')
  })

  it('определяет приход и расход', () => {
    expect(stockMoveTone(5)).toBe('in')
    expect(stockMoveTone(-5)).toBe('out')
  })

  it('называет операцию, если комментария нет', () => {
    expect(stockMoveTitle(makeMove({ kind: 'in' }))).toBe('Поступление')
    expect(stockMoveTitle(makeMove({ kind: 'adjustment' }))).toBe('Корректировка')
  })

  it('добавляет комментарий к названию операции', () => {
    expect(stockMoveTitle(makeMove({ kind: 'in', note: 'от поставщика' }))).toBe(
      'Поступление · от поставщика',
    )
    expect(stockMoveTitle(makeMove({ kind: 'adjustment', note: 'инвентаризация' }))).toBe(
      'Корректировка · инвентаризация',
    )
  })

  it('для движений по заказу причину не дублирует', () => {
    expect(stockMoveTitle(makeMove({ kind: 'order', note: 'Заказ №42' }))).toBe('Заказ №42')
    expect(stockMoveTitle(makeMove({ kind: 'order', note: 'Удаление заказа №42' }))).toBe(
      'Удаление заказа №42',
    )
  })
})

describe('ссылка на заказ из истории склада', () => {
  it('находит заказ по сохранённой связи', () => {
    const order = makeOrder({ id: 'o1', number: 42 })
    const move = makeMove({ kind: 'order', note: 'Заказ №42', orderId: 'o1' })

    expect(stockMoveOrder(move, [order])).toBe(order)
  })

  it('в записях без связи ищет заказ по номеру из причины', () => {
    const order = makeOrder({ id: 'o1', number: 42 })

    expect(stockMoveOrder(makeMove({ kind: 'order', note: 'Заказ №42' }), [order])).toBe(order)
    expect(stockMoveOrder(makeMove({ kind: 'order', note: 'Заказ №42 (отменён)' }), [order])).toBe(
      order,
    )
  })

  it('не даёт ссылки, если заказ удалён', () => {
    // «Удаление заказа №42»: самого заказа в базе уже нет, а номера не переиспользуются —
    // поэтому искать по номеру нечего.
    expect(
      stockMoveOrder(makeMove({ kind: 'order', note: 'Удаление заказа №42' }), []),
    ).toBeUndefined()
  })

  it('не даёт ссылки на заказ, которого нет в базе', () => {
    const move = makeMove({ kind: 'order', note: '', orderId: 'нет-такого' })

    expect(stockMoveOrder(move, [makeOrder({ id: 'o1' })])).toBeUndefined()
  })

  it('не даёт ссылки у ручных движений', () => {
    const orders = [makeOrder()]

    expect(stockMoveOrder(makeMove({ kind: 'in', note: 'Поставщик №7' }), orders)).toBeUndefined()
    expect(
      stockMoveOrder(makeMove({ kind: 'adjustment', note: 'Заказ №42' }), orders),
    ).toBeUndefined()
  })
})
