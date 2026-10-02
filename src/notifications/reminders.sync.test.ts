// Синхронизация расписания в системе: когда приложение спрашивает разрешение, с каким
// будильником ставит напоминание и какой итог видит экран. Плагин и платформа подменяются:
// настоящие уведомления в тестах поставить нечем, а проверить нужно именно решения приложения —
// из-за них напоминания не приходили: постановка зависела от разрешения «точных будильников»
// (неточный будильник система сдвигает на неопределённый срок), а сама необходимость этого
// разрешения видна только в «Настройки → Напоминания».
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Order, Reminder } from '../types'
import type { ReminderEntry } from '../utils/reminders'

interface ScheduledNotification {
  id: number
  title: string
  body: string
  channelId: string
  schedule: { at: Date; allowWhileIdle: boolean }
  isExactNotification: boolean
  extra: { source: string; reminderId: string }
}

const plugin = vi.hoisted(() => ({
  native: true,
  // Разрешение на уведомления: состояние и ответ системы подменяются в каждом тесте.
  checkPermissions: vi.fn(async () => ({ display: 'prompt' as string })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' as string })),
  // Разрешение на «точные будильники» (Android 12+): по умолчанию система его не даёт.
  checkExactNotificationSetting: vi.fn(async () => ({ exact_alarm: 'denied' as string })),
  getPending: vi.fn(async () => ({ notifications: [] as { id: number; extra?: unknown }[] })),
  cancel: vi.fn(async (_options: { notifications: { id: number }[] }) => undefined),
  createChannel: vi.fn(async (_options: Record<string, unknown>) => undefined),
  schedule: vi.fn(
    async (_options: { notifications: ScheduledNotification[] }) =>
      ({ notifications: [] as { id: number }[] }) as {
        notifications: { id: number }[]
        warning?: { code?: string; message?: string }
      },
  ),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => plugin.native } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: plugin }))

// Фиксированное «сейчас» — суббота 19 сентября 2026, 15:30 местного времени.
const NOW = new Date(2026, 8, 19, 15, 30)

function at(day: number, hour: number): string {
  return new Date(2026, 8, day, hour).toISOString()
}

function entry(order: Partial<Order> = {}, reminder: Partial<Reminder> = {}): ReminderEntry {
  return {
    order: {
      id: 'o1',
      number: 42,
      clientId: null,
      date: at(18, 10),
      status: 'new',
      items: [],
      payments: [],
      reminders: [],
      comment: '',
      ...order,
    },
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

/** Синхронизация берётся заново: у модуля есть состояние (спрошенное разрешение, итог). */
async function sync(entries: ReminderEntry[]) {
  const { syncReminderNotifications } = await import('./reminders')
  return syncReminderNotifications({ entries, now: NOW })
}

/**
 * Двигает время, пока обещание не выполнится: подгрузка плагина и каждое обращение к системе —
 * это отдельные задачи, поэтому одного сдвига времени мало. Реальные секунды предела ожидания
 * в тестах не выжидаем.
 */
async function waitForTimers<T>(work: Promise<T>): Promise<T> {
  let settled = false
  void work.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  while (!settled) await vi.advanceTimersByTimeAsync(60_000)
  return work
}

function scheduled(): ScheduledNotification[] {
  const calls = plugin.schedule.mock.calls
  return calls.length ? calls[calls.length - 1][0].notifications : []
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  plugin.native = true
  plugin.checkPermissions.mockResolvedValue({ display: 'prompt' })
  plugin.requestPermissions.mockResolvedValue({ display: 'granted' })
  // Точные будильники разрешены по умолчанию: на Android 13+ разрешение (`USE_EXACT_ALARM`)
  // система выдаёт приложению при установке — напоминание приходит в назначенную минуту.
  plugin.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' })
  plugin.getPending.mockResolvedValue({ notifications: [] })
  plugin.schedule.mockResolvedValue({ notifications: [] })
})

describe('Напоминания в системе: где системных уведомлений нет', () => {
  it('в браузере и мини-приложении Telegram плагин не трогается вовсе', async () => {
    plugin.native = false

    expect(await sync([entry()])).toBe('unsupported')
    expect(plugin.checkPermissions).not.toHaveBeenCalled()
    expect(plugin.schedule).not.toHaveBeenCalled()
  })

  it('без будущих напоминаний ставить нечего', async () => {
    expect(await sync([])).toBe('nothing')
    expect(plugin.schedule).not.toHaveBeenCalled()
  })
})

describe('Напоминания в системе: постановка уведомления', () => {
  it('ставит напоминание в свой канал точным будильником', async () => {
    expect(await sync([entry()])).toBe('scheduled')

    const [notification] = scheduled()
    expect(notification.id).toBeGreaterThan(0)
    expect(notification.title).toBe('Заказ №42 от 18.09.2026')
    expect(notification.body).toBe('Позвонить клиенту')
    expect(notification.channelId).toBe('selfcrm-reminders')
    expect(notification.schedule.at.toISOString()).toBe(at(19, 18))
    expect(notification.schedule.allowWhileIdle).toBe(true)
    // Разрешение на точные будильники выдано системе при установке приложения — иначе система
    // сдвинула бы неточный будильник на неопределённый срок, и напоминание молчало бы.
    expect(notification.isExactNotification).toBe(true)
    expect(notification.extra).toEqual({ source: 'selfcrm-reminder', reminderId: 'r1' })
    expect(plugin.createChannel).toHaveBeenCalledTimes(1)
  })

  it('без разрешения на точные будильники ставит неточный и говорит об этом экрану', async () => {
    plugin.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' })

    // Итог 'inexact', а не 'scheduled': система вольна сдвинуть такое напоминание, и подпись
    // на главном экране говорит, что включить. Не поставить расписание вовсе — хуже.
    expect(await sync([entry()])).toBe('inexact')
    expect(scheduled()[0].isExactNotification).toBe(false)
  })

  it('предупреждение плагина о неточном будильнике тоже видно экрану', async () => {
    // Разрешение выдано, но плагин предупредил, что точный будильник не встал: доверяем
    // предупреждению — система сдвинет напоминание.
    plugin.schedule.mockResolvedValue({
      notifications: [],
      warning: { code: 'OS-PLUG-LNOT-0017', message: 'Scheduled as an inexact alarm instead.' },
    })

    expect(await sync([entry()])).toBe('inexact')
  })

  it('снимает свои прежние уведомления и не трогает чужие', async () => {
    plugin.getPending.mockResolvedValue({
      notifications: [
        { id: 11, extra: { source: 'selfcrm-reminder', reminderId: 'r-stale' } },
        { id: 22, extra: { source: 'другое' } },
      ],
    })

    expect(await sync([entry()])).toBe('scheduled')
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 11 }] })
  })
})

describe('Напоминания в системе: разрешение на уведомления', () => {
  it('система спрашивает разрешение сама и только один раз за запуск', async () => {
    expect(await sync([entry()])).toBe('scheduled')
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1)

    // Пользователь разрешил в диалоге: проверка видит «granted», второго запроса нет.
    plugin.checkPermissions.mockResolvedValue({ display: 'granted' })

    expect(await sync([entry()])).toBe('scheduled')
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1)
  })

  it('отказ пользователя виден экрану: напоминание не ставится', async () => {
    plugin.requestPermissions.mockResolvedValue({ display: 'denied' })

    expect(await sync([entry()])).toBe('denied')
    expect(plugin.schedule).not.toHaveBeenCalled()
  })

  it('выключенные в системе уведомления — не сбой, а состояние: экран узнаёт о них', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    plugin.schedule.mockRejectedValue({
      code: 'OS-PLUG-LNOT-0005',
      message: 'Notifications are not enabled on this device.',
    })
    const { reminderNotificationStatus, subscribeReminderNotificationStatus } = await import(
      './reminders'
    )
    const listener = vi.fn()
    const unsubscribe = subscribeReminderNotificationStatus(listener)

    expect(await sync([entry()])).toBe('denied')
    expect(reminderNotificationStatus()).toBe('denied')
    expect(listener).toHaveBeenCalled()
    unsubscribe()
    warn.mockRestore()
  })

  it('сбой плагина не ломает приложение — статус и предупреждение в консоли', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    plugin.schedule.mockRejectedValue(new Error('плагин упал'))

    expect(await sync([entry()])).toBe('failed')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('Напоминания в системе: молчание системы', () => {
  it('список запланированного не пришёл — расписание всё равно ставится', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    plugin.getPending.mockRejectedValue(new Error('плагин упал'))

    // Снятие прежнего расписания — удобство, а не условие работы. Раньше сбой на этом шаге
    // останавливал синхронизацию целиком: расписание не вставало, и на экране не было ни
    // слова о причине — «напоминания молча не приходят».
    expect(await sync([entry()])).toBe('scheduled')
    expect(plugin.cancel).not.toHaveBeenCalled()
    expect(scheduled()).toHaveLength(1)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('система промолчала на постановке — экран узнаёт причину, а не ждёт вечно', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    plugin.schedule.mockImplementation(
      () => new Promise<{ notifications: { id: number }[] }>(() => undefined),
    )
    const { reminderNotificationProblem } = await import('./reminders')

    const status = sync([entry()])
    // Подгрузка плагина и обращения к системе — это отдельные задачи: двигаем время, пока итог
    // не будет готов, и только потом проверяем причину.
    await waitForTimers(status)

    expect(await status).toBe('failed')
    expect(reminderNotificationProblem()).toContain('не ответила за 60 с')
    vi.useRealTimers()
    warn.mockRestore()
  })
})
