// «Настройки → Напоминания»: что экран видит про напоминания в системе (разрешения и список
// запланированного), как работают кнопки разрешений и проверочное уведомление. Плагин и платформа
// подменяются: настоящие уведомления в тестах поставить нечем, а проверить нужно решения
// приложения — из-за них «поставил напоминание, закрыл приложение — тишина».
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReminderEntry } from '../utils/reminders'

interface ScheduledNotification {
  id: number
  title: string
  body: string
  channelId: string
  schedule: { at: Date; allowWhileIdle: boolean }
  isExactNotification: boolean
  extra: { source: string }
}

const plugin = vi.hoisted(() => ({
  native: true,
  checkPermissions: vi.fn(async () => ({ display: 'granted' as string })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' as string })),
  checkExactNotificationSetting: vi.fn(async () => ({ exact_alarm: 'granted' as string })),
  changeExactNotificationSetting: vi.fn(async () => ({ exact_alarm: 'granted' as string })),
  getPending: vi.fn(async () => ({ notifications: [] as unknown[] })),
  cancel: vi.fn(async (_options: { notifications: { id: number }[] }) => undefined),
  createChannel: vi.fn(async (_options: Record<string, unknown>) => undefined),
  schedule: vi.fn(async (_options: { notifications: ScheduledNotification[] }) => ({
    notifications: [] as { id: number }[],
  })),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => plugin.native } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: plugin }))

// Фиксированное «сейчас» — суббота 19 сентября 2026, 15:30 местного времени.
const NOW = new Date(2026, 8, 19, 15, 30)

/** Напоминание с будущим сроком: срок считается от реального времени, поэтому он в будущем. */
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
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      createdAt: NOW.toISOString(),
    },
  }
}

function scheduled(): ScheduledNotification[] {
  const calls = plugin.schedule.mock.calls
  return calls.length ? calls[calls.length - 1][0].notifications : []
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  plugin.native = true
  plugin.checkPermissions.mockResolvedValue({ display: 'granted' })
  plugin.requestPermissions.mockResolvedValue({ display: 'granted' })
  plugin.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' })
  plugin.changeExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' })
  plugin.getPending.mockResolvedValue({ notifications: [] })
  plugin.schedule.mockResolvedValue({ notifications: [] })
})

describe('Напоминания в системе: состояние для экрана настроек', () => {
  it('в браузере и мини-приложении Telegram отчёта нет', async () => {
    plugin.native = false
    const { readReminderSystemReport } = await import('./reminders')

    expect(await readReminderSystemReport()).toBeNull()
    expect(plugin.checkPermissions).not.toHaveBeenCalled()
  })

  it('показывает разрешения системы и запланированное приложением', async () => {
    const { readReminderSystemReport } = await import('./reminders')
    plugin.getPending.mockResolvedValue({
      notifications: [
        // Срок приходит строкой: плагин помнит уведомление тем видом, в каком его получил.
        {
          id: 7,
          title: 'Заказ №42 от 18.09.2026',
          body: 'Позвонить клиенту',
          extra: { source: 'selfcrm-reminder', reminderId: 'r1' },
          schedule: { at: '2026-09-19T18:00:00.000Z' },
        },
        {
          id: 8,
          title: 'Проверка напоминаний',
          body: 'Уведомления SelfCRM приходят.',
          extra: { source: 'selfcrm-reminder-test' },
          schedule: { at: '2026-09-19T15:30:15.000Z' },
        },
        { id: 9, title: 'Чужое', body: 'Другое приложение', extra: { source: 'другое' } },
      ],
    })

    const report = await readReminderSystemReport()

    expect(report?.notifications).toBe('granted')
    expect(report?.exact).toBe('granted')
    // Проверочное уведомление не выдаётся за напоминание по заказу.
    expect(report?.pending).toEqual([
      {
        reminderId: 'r1',
        id: 7,
        title: 'Заказ №42 от 18.09.2026',
        body: 'Позвонить клиенту',
        at: new Date('2026-09-19T18:00:00.000Z'),
      },
    ])
  })

  it('запланированное показывается по сроку, а не в порядке системы', async () => {
    const { readReminderSystemReport } = await import('./reminders')
    plugin.getPending.mockResolvedValue({
      notifications: [
        {
          id: 1,
          title: 'Позже',
          body: '',
          extra: { source: 'selfcrm-reminder', reminderId: 'late' },
          schedule: { at: '2026-09-20T09:00:00.000Z' },
        },
        {
          id: 2,
          title: 'Раньше',
          body: '',
          extra: { source: 'selfcrm-reminder', reminderId: 'early' },
          schedule: { at: '2026-09-19T18:00:00.000Z' },
        },
      ],
    })

    const report = await readReminderSystemReport()

    expect(report?.pending.map((item) => item.reminderId)).toEqual(['early', 'late'])
  })

  it('состояния, которых система не назвала, — «неизвестно», и это не сбой', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { readReminderSystemReport } = await import('./reminders')
    plugin.checkPermissions.mockResolvedValue({ display: 'prompt' })
    plugin.checkExactNotificationSetting.mockRejectedValue(new Error('нет метода'))

    const report = await readReminderSystemReport()

    expect(report).toMatchObject({ notifications: 'unknown', exact: 'unknown', pending: [] })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('сбой чтения не ломает экран — предупреждение в консоли вместо отчёта', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { readReminderSystemReport } = await import('./reminders')
    plugin.getPending.mockRejectedValue(new Error('плагин упал'))

    expect(await readReminderSystemReport()).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('Напоминания в системе: разрешения по кнопке', () => {
  it('кнопка «Разрешить» показывает диалог, даже если приложение уже отказывалось', async () => {
    const { allowReminderNotifications, syncReminderNotifications } = await import('./reminders')
    // Приложение уже просило разрешение при синхронизации и получило отказ.
    plugin.checkPermissions.mockResolvedValue({ display: 'prompt' })
    plugin.requestPermissions.mockResolvedValue({ display: 'denied' })
    expect(await syncReminderNotifications({ entries: [entry()] })).toBe('denied')

    // Пользователь передумал: кнопка в настройках просит явно, без защёлки «уже спрашивали».
    plugin.requestPermissions.mockResolvedValue({ display: 'granted' })
    expect(await allowReminderNotifications()).toBe(true)
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(2)
  })

  it('кнопка точных будильников открывает системный экран и сообщает его итог', async () => {
    const { allowExactReminderAlarms } = await import('./reminders')

    expect(await allowExactReminderAlarms()).toBe(true)
    expect(plugin.changeExactNotificationSetting).toHaveBeenCalledTimes(1)

    plugin.changeExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' })
    expect(await allowExactReminderAlarms()).toBe(false)
  })

  it('сбой плагина виден как «не разрешено», а не как падение экрана', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { allowReminderNotifications, allowExactReminderAlarms } = await import('./reminders')
    // Система ещё не спрашивала разрешение — без этого плагин не пошёл бы в систему вовсе.
    plugin.checkPermissions.mockResolvedValue({ display: 'prompt' })
    plugin.requestPermissions.mockRejectedValue(new Error('плагин упал'))
    plugin.changeExactNotificationSetting.mockRejectedValue(new Error('плагин упал'))

    expect(await allowReminderNotifications()).toBe(false)
    expect(await allowExactReminderAlarms()).toBe(false)
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('в браузере и Telegram кнопки разрешений ничего не делают', async () => {
    plugin.native = false
    const { allowReminderNotifications, allowExactReminderAlarms } = await import('./reminders')

    expect(await allowReminderNotifications()).toBe(false)
    expect(await allowExactReminderAlarms()).toBe(false)
    expect(plugin.requestPermissions).not.toHaveBeenCalled()
    expect(plugin.changeExactNotificationSetting).not.toHaveBeenCalled()
  })
})

describe('Напоминания в системе: проверочное уведомление', () => {
  it('ставит проверку через 15 секунд точным будильником в свой канал', async () => {
    const { REMINDER_TEST_DELAY_SECONDS, sendTestReminderNotification } = await import(
      './reminders'
    )

    expect(await sendTestReminderNotification(NOW)).toBe('sent')

    const [notification] = scheduled()
    expect(notification.id).toBeGreaterThan(0)
    expect(notification.title).toBe('Проверка напоминаний')
    expect(notification.channelId).toBe('selfcrm-reminders')
    expect(notification.schedule.at.getTime()).toBe(
      NOW.getTime() + REMINDER_TEST_DELAY_SECONDS * 1000,
    )
    expect(notification.schedule.allowWhileIdle).toBe(true)
    expect(notification.isExactNotification).toBe(true)
    // Своя метка: иначе синхронизация расписания сняла бы проверку вместе с напоминаниями.
    expect(notification.extra).toEqual({ source: 'selfcrm-reminder-test' })
    expect(plugin.createChannel).toHaveBeenCalledTimes(1)
  })

  it('снимает прежнюю проверку, но не трогает напоминания по заказам', async () => {
    const { sendTestReminderNotification } = await import('./reminders')
    plugin.getPending.mockResolvedValue({
      notifications: [
        { id: 5, extra: { source: 'selfcrm-reminder-test' } },
        { id: 6, extra: { source: 'selfcrm-reminder', reminderId: 'r1' } },
      ],
    })

    expect(await sendTestReminderNotification(NOW)).toBe('sent')
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 5 }] })
  })

  it('без разрешения на уведомления проверка не ставится', async () => {
    const { sendTestReminderNotification } = await import('./reminders')
    // Система ещё не спрашивала, пользователь отвечает отказом: уведомления не появятся.
    plugin.checkPermissions.mockResolvedValue({ display: 'prompt' })
    plugin.requestPermissions.mockResolvedValue({ display: 'denied' })

    expect(await sendTestReminderNotification(NOW)).toBe('denied')
    expect(plugin.schedule).not.toHaveBeenCalled()
  })

  it('в браузере и Telegram проверки нет', async () => {
    plugin.native = false
    const { sendTestReminderNotification } = await import('./reminders')

    expect(await sendTestReminderNotification(NOW)).toBe('unsupported')
    expect(plugin.schedule).not.toHaveBeenCalled()
  })

  it('сбой плагина не ломает экран — проверка сообщает об ошибке', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { sendTestReminderNotification } = await import('./reminders')
    plugin.schedule.mockRejectedValue(new Error('плагин упал'))

    expect(await sendTestReminderNotification(NOW)).toBe('failed')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
