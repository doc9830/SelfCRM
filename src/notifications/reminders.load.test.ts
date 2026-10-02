// Загрузка плагина напоминаний: плагин Capacitor — это Proxy со свойством `then`, поэтому он
// выглядит как «обещание». Если `async`-функция возвращает плагин напрямую (так было раньше),
// `await` зовёт `LocalNotifications.then`, метода `then` у плагина нет, система отвечает ошибкой,
// а само обещание остаётся без ответа навсегда. На телефоне это выглядело так: «Настройки →
// Напоминания» вечно показывали «Проверяем состояние…», а расписание не вставало — напоминания
// молча не приходили. Тест повторяет ловушку: у подменённого плагина есть незавершающийся `then`,
// а чтение состояния и синхронизация обязаны завершиться.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReminderEntry } from '../utils/reminders'

const plugin = vi.hoisted(() => ({
  native: true,
  checkPermissions: vi.fn(async () => ({ display: 'granted' as string })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' as string })),
  checkExactNotificationSetting: vi.fn(async () => ({ exact_alarm: 'granted' as string })),
  getPending: vi.fn(async () => ({ notifications: [] as unknown[] })),
  cancel: vi.fn(async (_options: { notifications: { id: number }[] }) => undefined),
  createChannel: vi.fn(async (_options: Record<string, unknown>) => undefined),
  schedule: vi.fn(async (_options: Record<string, unknown>) => ({
    notifications: [] as { id: number }[],
  })),
  // Так выглядит плагин Capacitor: свойство `then` есть, но системы на такой вызов нет —
  // обещание, которое ждёт `then`, не выполняется никогда.
  then: () => new Promise(() => undefined),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => plugin.native } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: plugin }))

// Фиксированное «сейчас» — суббота 19 сентября 2026, 15:30 местного времени.
const NOW = new Date(2026, 8, 19, 15, 30)

/** Напоминание с будущим сроком: срок считается от `NOW`, поэтому он в будущем. */
function entry(): ReminderEntry {
  return {
    order: {
      id: 'o1',
      number: 42,
      clientId: null,
      date: NOW.toISOString(),
      status: 'new',
      items: [],
      payments: [],
      reminders: [],
      comment: '',
    },
    reminder: {
      id: 'r1',
      kind: 'call',
      text: 'Позвонить клиенту',
      dueAt: new Date(NOW.getTime() + 3_600_000).toISOString(),
      createdAt: NOW.toISOString(),
    },
  }
}

/**
 * Ждём итог не дольше секунды. Повисшее обещание не разбудить подменой времени — оно не завершится
 * никогда, поэтому отказ теста должен быть по реальному сроку, а не бесконечным ожиданием.
 */
async function settled<T>(work: Promise<T>): Promise<T | undefined> {
  return Promise.race([
    work,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1_000)),
  ])
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  plugin.native = true
  plugin.checkPermissions.mockResolvedValue({ display: 'granted' })
  plugin.requestPermissions.mockResolvedValue({ display: 'granted' })
  plugin.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' })
  plugin.getPending.mockResolvedValue({ notifications: [] })
  plugin.schedule.mockResolvedValue({ notifications: [] })
})

describe('Напоминания в системе: плагин, который выглядит как обещание', () => {
  it('чтение состояния завершается отчётом, а не повисает', async () => {
    const { readReminderSystemReport } = await import('./reminders')

    const report = await settled(readReminderSystemReport())

    expect(report).toBeDefined()
    expect(report?.notifications).toBe('granted')
    expect(report?.exact).toBe('granted')
    expect(report?.pending).toEqual([])
    expect(report?.problems).toEqual([])
  })

  it('синхронизация ставит напоминание в систему', async () => {
    const { syncReminderNotifications } = await import('./reminders')

    const status = await settled(syncReminderNotifications({ entries: [entry()], now: NOW }))

    expect(status).toBe('scheduled')
    expect(plugin.schedule).toHaveBeenCalledTimes(1)
    expect(plugin.createChannel).toHaveBeenCalledTimes(1)
  })
})
