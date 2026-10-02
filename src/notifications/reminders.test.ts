// Проверки системных напоминаний: что планируется в системе и как считается id уведомления.
import { describe, expect, it } from 'vitest'
import type { Order, Reminder } from '../types'
import type { ReminderEntry } from '../utils/reminders'
import { planReminderNotifications, reminderNotificationId } from './reminders'

// Фиксированное «сейчас» — суббота 19 сентября 2026, 15:30 местного времени:
// тесты не зависят от реальных даты и времени запуска.
const NOW = new Date(2026, 8, 19, 15, 30)
function at(day: number, hour: number): string {
  return new Date(2026, 8, day, hour).toISOString()
}

function makeOrder(partial: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    number: 42,
    clientId: null,
    date: at(18, 10),
    status: 'new',
    items: [],
    payments: [],
    reminders: [],
    comment: '',
    ...partial,
  }
}

function entry(order: Partial<Order>, reminder: Partial<Reminder>): ReminderEntry {
  return {
    order: makeOrder(order),
    reminder: {
      id: 'r1',
      kind: 'call',
      text: 'Позвонить клиенту',
      dueAt: at(19, 18),
      createdAt: at(19, 12),
      ...reminder,
    },
  }
}

describe('Напоминания в системе: идентификатор уведомления', () => {
  it('одинаковый для одного напоминания и разный для разных', () => {
    expect(reminderNotificationId('r1')).toBe(reminderNotificationId('r1'))
    expect(reminderNotificationId('r1')).not.toBe(reminderNotificationId('r2'))
  })

  it('остаётся в диапазоне положительных 32-битных чисел Android', () => {
    const ids = ['r1', 'напоминание-42', '', 'x'.repeat(200)]
    for (const id of ids) {
      const value = reminderNotificationId(id)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThan(0)
      expect(value).toBeLessThanOrEqual(2_147_483_647)
    }
  })
})

describe('Напоминания в системе: что планируется', () => {
  it('берёт активные напоминания с будущим сроком', () => {
    const planned = planReminderNotifications([entry({}, {})], NOW)

    expect(planned).toHaveLength(1)
    expect(planned[0].title).toBe('Заказ №42 от 18.09.2026')
    expect(planned[0].body).toBe('Позвонить клиенту')
    expect(planned[0].at.toISOString()).toBe(at(19, 18))
  })

  it('подписывает уведомление именем клиента', () => {
    const planned = planReminderNotifications(
      [entry({ clientId: 'c1' }, { kind: 'payment', text: 'Напомнить об оплате' })],
      NOW,
      (id) => (id === 'c1' ? 'Иван Петров' : undefined),
    )

    expect(planned[0].body).toBe('Напомнить об оплате · Иван Петров')
  })

  it('не планирует просроченные: о них напоминает сам экран', () => {
    const planned = planReminderNotifications(
      [entry({}, { id: 'late', dueAt: at(19, 9) })],
      NOW,
    )

    expect(planned).toEqual([])
  })

  it('не планирует выполненные напоминания', () => {
    const planned = planReminderNotifications(
      [entry({}, { id: 'done', done: true, doneAt: at(19, 14) })],
      NOW,
    )

    expect(planned).toEqual([])
  })

  it('сортирует по сроку: система получит список по возрастанию времени', () => {
    const planned = planReminderNotifications(
      [
        entry({ id: 'o2' }, { id: 'r2', dueAt: at(20, 9) }),
        entry({ id: 'o1' }, { id: 'r1', dueAt: at(19, 18) }),
      ],
      NOW,
    )

    expect(planned.map((item) => item.reminderId)).toEqual(['r1', 'r2'])
  })
})
