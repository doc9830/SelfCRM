import { describe, expect, it } from 'vitest'
import type { Client, Order } from '../types'
import {
  applyOrderForm,
  assignMissingNumbers,
  canRepeatOrder,
  clientLabel,
  formatOrderNumber,
  nextOrderNumber,
  orderHeading,
  orderTitle,
  NO_CLIENT_ID,
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

describe('повтор заказа', () => {
  it('повторяются завершённый и отменённый заказы', () => {
    expect(canRepeatOrder(makeOrder({ status: 'done' }))).toBe(true)
    expect(canRepeatOrder(makeOrder({ status: 'cancelled' }))).toBe(true)
  })

  it('активные заказы не повторяются', () => {
    expect(canRepeatOrder(makeOrder({ status: 'new' }))).toBe(false)
    expect(canRepeatOrder(makeOrder({ status: 'in_progress' }))).toBe(false)
  })
})

describe('сборка заказа из формы', () => {
  it('берёт из формы позиции и правки, а платежи и напоминания сохраняет', () => {
    const initial = makeOrder({
      number: 42,
      status: 'done',
      items: [{ productId: 'p1', name: 'Товар', price: 100, qty: 1 }],
      payments: [{ id: 'pay1', amount: 100, date: new Date(2026, 8, 19).toISOString(), comment: '' }],
      reminders: [
        {
          id: 'rem1',
          kind: 'call',
          text: 'Позвонить',
          dueAt: new Date(2026, 8, 20, 9).toISOString(),
          createdAt: new Date(2026, 8, 19).toISOString(),
        },
      ],
    })

    const saved = applyOrderForm(initial, {
      clientId: 'c7',
      date: new Date(2026, 8, 21, 10).toISOString(),
      status: 'in_progress',
      comment: '  Уточнить размеры  ',
      items: [{ productId: 'p1', name: 'Товар', price: 120, qty: 2 }],
    })

    // Идентификатор и номер не меняются, а поля формы берутся из введённых значений.
    expect(saved.id).toBe(initial.id)
    expect(saved.number).toBe(42)
    expect(saved.clientId).toBe('c7')
    expect(saved.status).toBe('in_progress')
    expect(saved.items).toEqual([{ productId: 'p1', name: 'Товар', price: 120, qty: 2 }])
    // Платежи и напоминания форма не редактирует: они переезжают без изменений.
    expect(saved.payments).toEqual(initial.payments)
    expect(saved.reminders).toEqual(initial.reminders)
  })

  it('достраивает пустые списки, если их не было в старом заказе', () => {
    const saved = applyOrderForm(makeOrder(), {
      clientId: null,
      date: new Date(2026, 8, 21, 10).toISOString(),
      status: 'new',
      comment: '',
      items: [],
    })

    expect(saved.payments).toEqual([])
    expect(saved.reminders).toEqual([])
  })
})

describe('clientLabel — как клиент подписан в списках и отчёте', () => {
  const client = { id: 'c1', name: 'Иванов Иван', archived: false }

  it('обычный клиент — по имени', () => {
    expect(clientLabel(client as Client, 'c1')).toBe('Иванов Иван')
  })

  it('архивный клиент помечен', () => {
    expect(clientLabel({ ...client, archived: true } as Client, 'c1')).toBe('Иванов Иван (архив)')
  })

  it('заказ без клиента подписан словами', () => {
    expect(clientLabel(undefined, null)).toBe('Без клиента')
    expect(clientLabel(undefined, NO_CLIENT_ID)).toBe('Без клиента')
  })

  it('удалённый клиент не превращается в пустую строку', () => {
    expect(clientLabel(undefined, 'gone')).toBe('Удалённый клиент')
  })
})
