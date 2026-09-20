import { describe, expect, it } from 'vitest'
import type { Order, Reminder } from '../types'
import {
  DASHBOARD_REMINDER_LIMIT,
  defaultReminderDueAt,
  groupReminders,
  limitReminderGroups,
  reminderDueAtFromInputs,
  reminderGroupKey,
  reminderTextError,
  reminderTextForKind,
  reminderWhenLabel,
  sortOrderReminders,
  type ReminderEntry,
} from './reminders'

// Фиксированное «сейчас» — суббота 19 сентября 2026, 15:30 местного времени:
// тесты не зависят от реальных даты и времени запуска.
const NOW = new Date(2026, 8, 19, 15, 30)

function at(day: number, hour: number, minute = 0): string {
  return new Date(2026, 8, day, hour, minute).toISOString()
}

function makeReminder(partial: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r1',
    kind: 'call',
    text: 'Позвонить клиенту',
    dueAt: at(19, 18),
    createdAt: at(19, 12),
    ...partial,
  }
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

function entry(orderId: string, reminder: Reminder): ReminderEntry {
  return { order: makeOrder({ id: orderId }), reminder }
}

describe('Напоминания: текст по виду', () => {
  it('подставляет подсказку для пустого текста и заменяет чужую подсказку', () => {
    expect(reminderTextForKind('payment', '')).toBe('Напомнить об оплате')
    expect(reminderTextForKind('product', 'Позвонить клиенту')).toBe(
      'Проверить наличие/получение товара',
    )
  })

  it('сохраняет текст, который ввёл пользователь', () => {
    expect(reminderTextForKind('payment', 'Уточнить размеры и сроки')).toBe(
      'Уточнить размеры и сроки',
    )
  })

  it('требует текст только для «Другого»', () => {
    expect(reminderTextError('other', '   ')).toBe('Опишите, о чём напомнить')
    expect(reminderTextError('other', 'Забрать документы')).toBe('')
    expect(reminderTextError('call', '')).toBe('')
  })
})

describe('Напоминания: сроки', () => {
  it('делит напоминания на просроченные, сегодняшние, завтрашние и дальние', () => {
    expect(reminderGroupKey(at(19, 9), NOW)).toBe('overdue')
    expect(reminderGroupKey(at(19, 18), NOW)).toBe('today')
    expect(reminderGroupKey(at(20, 9), NOW)).toBe('tomorrow')
    expect(reminderGroupKey(at(25, 9), NOW)).toBe('later')
  })

  it('подписывает срок для окна создания', () => {
    expect(reminderWhenLabel(at(19, 18), NOW)).toBe('Сегодня, 18:00')
    expect(reminderWhenLabel(at(20, 9), NOW)).toBe('Завтра, 09:00')
    expect(reminderWhenLabel(at(25, 9, 5), NOW)).toBe('25.09, 09:05')
  })

  it('для «Сегодня» и «Завтра» берёт ближайший круглый час', () => {
    expect(defaultReminderDueAt('today', NOW)).toBe(new Date(2026, 8, 19, 16, 0).toISOString())
    expect(defaultReminderDueAt('tomorrow', NOW)).toBe(new Date(2026, 8, 20, 16, 0).toISOString())
  })

  it('собирает момент из полей даты и времени', () => {
    expect(reminderDueAtFromInputs('2026-09-25', '08:15')).toBe(
      new Date(2026, 8, 25, 8, 15).toISOString(),
    )
    expect(reminderDueAtFromInputs('', '')).not.toBe('')
  })
})

describe('Напоминания: список для главного экрана', () => {
  it('сортирует по сроку и группирует с заголовками', () => {
    const groups = groupReminders(
      [
        entry('o2', makeReminder({ id: 'r2', dueAt: at(20, 9), text: 'Проверить товар' })),
        entry('o1', makeReminder({ id: 'r1', dueAt: at(19, 18) })),
        entry('o3', makeReminder({ id: 'r3', dueAt: at(25, 9), kind: 'payment', text: 'Оплата' })),
      ],
      NOW,
    )

    expect(groups.map((g) => g.key)).toEqual(['today', 'tomorrow', 'later'])
    expect(groups[0].label).toBe('Сегодня')
    // Для дальних сроков вместо слова «Позже» показывается дата.
    expect(groups[2].label).toBe('25.09')
    expect(groups[1].items[0].order.id).toBe('o2')
  })

  it('выполненные напоминания в активный список не попадают', () => {
    const groups = groupReminders(
      [
        entry('o1', makeReminder({ id: 'r1', done: true, doneAt: at(19, 14) })),
        entry('o2', makeReminder({ id: 'r2', dueAt: at(20, 9) })),
      ],
      NOW,
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('tomorrow')
  })

  it('ограничивает число строк и считает скрытые', () => {
    const items = Array.from({ length: DASHBOARD_REMINDER_LIMIT + 2 }, (_, i) =>
      entry(`o${i}`, makeReminder({ id: `r${i}`, dueAt: at(20, 9 + (i % 8)) })),
    )
    const limited = limitReminderGroups(groupReminders(items, NOW))

    expect(limited.groups[0].items).toHaveLength(DASHBOARD_REMINDER_LIMIT)
    expect(limited.hidden).toBe(2)
  })
})

describe('Напоминания: список в карточке заказа', () => {
  it('ставит активные сверху по сроку, выполненные — ниже', () => {
    const sorted = sortOrderReminders([
      makeReminder({ id: 'done', dueAt: at(19, 9), done: true }),
      makeReminder({ id: 'late', dueAt: at(22, 9) }),
      makeReminder({ id: 'soon', dueAt: at(19, 18) }),
    ])

    expect(sorted.map((r) => r.id)).toEqual(['soon', 'late', 'done'])
  })
})
