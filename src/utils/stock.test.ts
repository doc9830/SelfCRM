import { describe, expect, it } from 'vitest'
import type { StockMove } from '../types'
import { formatStockDelta, stockMoveTitle, stockMoveTone } from './stock'

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
