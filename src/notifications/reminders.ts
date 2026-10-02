// Системные напоминания (Android): приложение просит систему показать уведомление в срок
// напоминания по заказу — даже когда SelfCRM закрыта. Планируются только те напоминания,
// которые создал пользователь (`db.getReminders()`): своих уведомлений приложение
// не придумывает.
//
// В браузере и в мини-приложении Telegram системных уведомлений нет: там функции ниже
// молчат, а сроки видны блоком «Напоминания» на главном экране (utils/reminders.ts).
// Плагин подгружается по требованию, поэтому в веб-версии его код в бандл не попадает.
import { Capacitor } from '@capacitor/core'
import { orderHeading } from '../utils/orders'
import { REMINDER_KIND_LABEL, type ReminderEntry } from '../utils/reminders'

// Канал уведомлений Android: без него на Android 8+ уведомление не показывается.
// Важность 4 (высокая) — напоминание появляется всплывающей плашкой и со звуком.
export const REMINDER_CHANNEL_ID = 'selfcrm-reminders'
export const REMINDER_CHANNEL_NAME = 'Напоминания по заказам'

// Метка «своих» уведомлений в системе: при синхронизации снимаются только они,
// чужие записи приложения (если появятся) остаются на месте.
export const REMINDER_NOTIFICATION_SOURCE = 'selfcrm-reminder'

export type ReminderPermission = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'

// Имя клиента по идентификатору — для подписи уведомления.
export type ClientNameLookup = (clientId: string | null) => string | undefined

export interface ReminderNotification {
  reminderId: string
  // Идентификатор уведомления в системе (Android принимает 32-битное число).
  id: number
  title: string
  body: string
  // Момент, когда система должна показать уведомление.
  at: Date
}

/**
 * Идентификатор уведомления в системе. Напоминание живёт со строковым id, а система ждёт
 * число, поэтому id сворачивается в 32-битное число. Свёртка детерминированная: одно и
 * то же напоминание всегда даёт одно число, поэтому перенос срока не плодит дубликатов.
 */
export function reminderNotificationId(reminderId: string): number {
  let hash = 5381
  for (let index = 0; index < reminderId.length; index += 1) {
    hash = (Math.imul(hash, 33) ^ reminderId.charCodeAt(index)) >>> 0
  }
  // Диапазон положительных 32-битных значений: ноль читался бы как «идентификатора нет».
  return (hash % 2_147_483_647) + 1
}

/**
 * Что показать системой: активные напоминания с будущим сроком.
 *
 * Просроченные не планируются: они уже в прошлом, и система вывалила бы их пачкой при
 * каждом запуске приложения. О просроченных напоминает сам экран — блоком «Просрочено»
 * на главной и подписью срока в карточке заказа.
 */
export function planReminderNotifications(
  entries: ReminderEntry[],
  now: Date = new Date(),
  clientName?: ClientNameLookup,
): ReminderNotification[] {
  return entries
    .filter((entry) => !entry.reminder.done)
    .map(({ order, reminder }) => ({
      reminderId: reminder.id,
      id: reminderNotificationId(reminder.id),
      title: orderHeading(order),
      body: [reminder.text || REMINDER_KIND_LABEL[reminder.kind], clientName?.(order.clientId)]
        .filter(Boolean)
        .join(' · '),
      at: new Date(reminder.dueAt),
    }))
    .filter((item) => !Number.isNaN(item.at.getTime()) && item.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())
}

/** Системные уведомления есть только в сборке приложения: в браузере и Telegram — нет. */
export function reminderNotificationsSupported(): boolean {
  return Capacitor.isNativePlatform()
}

type LocalNotificationsPlugin = (typeof import('@capacitor/local-notifications'))['LocalNotifications']

async function loadLocalNotifications(): Promise<LocalNotificationsPlugin> {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  return LocalNotifications
}

/** Текущее разрешение на уведомления. null — платформа их не поддерживает. */
export async function reminderNotificationPermission(): Promise<ReminderPermission | null> {
  if (!reminderNotificationsSupported()) return null
  const plugin = await loadLocalNotifications()
  const status = await plugin.checkPermissions()
  return status.display
}

/**
 * Просит разрешение на уведомления. Android 13+ спрашивает пользователя, на старых
 * версиях разрешение выдано заранее, поэтому повторный вызов просто вернёт «granted».
 */
export async function requestReminderNotifications(): Promise<ReminderPermission | null> {
  if (!reminderNotificationsSupported()) return null
  const plugin = await loadLocalNotifications()
  const status = await plugin.checkPermissions()
  if (status.display === 'granted') return 'granted'
  const asked = await plugin.requestPermissions()
  return asked.display
}

/** Разрешены ли точные напоминания (Android 12+): от этого зависит минута срабатывания. */
export async function reminderExactAlarmPermission(): Promise<ReminderPermission | null> {
  if (!reminderNotificationsSupported()) return null
  const plugin = await loadLocalNotifications()
  const status = await plugin.checkExactNotificationSetting()
  return status.exact_alarm
}

/** Открывает системный экран разрешения точных напоминаний. */
export async function openReminderExactAlarmSettings(): Promise<void> {
  if (!reminderNotificationsSupported()) return
  const plugin = await loadLocalNotifications()
  await plugin.changeExactNotificationSetting()
}

export interface ReminderSyncInput {
  entries: ReminderEntry[]
  clientName?: ClientNameLookup
  now?: Date
}

/**
 * Приводит расписание в системе в соответствие с базой: снимает ранее поставленные
 * уведомления приложения и ставит их заново по активным напоминаниям заказов.
 *
 * Полная пересборка выбрана намеренно: удалённое, перенесённое или выполненное
 * напоминание не должно оставлять в системе висящее уведомление, а сверять построенные
 * списки — лишний код без пользы: напоминаний у пользователя немного.
 */
export async function syncReminderNotifications(input: ReminderSyncInput): Promise<void> {
  if (!reminderNotificationsSupported()) return
  try {
    const plugin = await loadLocalNotifications()
    const planned = planReminderNotifications(
      input.entries,
      input.now ?? new Date(),
      input.clientName,
    )

    const pending = await plugin.getPending()
    const ours = pending.notifications.filter(
      (item) =>
        (item.extra as { source?: string } | null | undefined)?.source ===
        REMINDER_NOTIFICATION_SOURCE,
    )
    if (ours.length) {
      await plugin.cancel({ notifications: ours.map((item) => ({ id: item.id })) })
    }

    if (!planned.length) return
    const permission = await requestReminderNotifications()
    if (permission !== 'granted') return

    await plugin.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: REMINDER_CHANNEL_NAME,
      description: 'Напоминания по заказам SelfCRM',
      importance: 4,
      // Текст виден на экране блокировки, но система скрывает его, если устройство
      // защищено паролем: в уведомлении бывают имя клиента и номер заказа.
      visibility: 0,
      vibration: true,
    })

    await plugin.schedule({
      notifications: planned.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        channelId: REMINDER_CHANNEL_ID,
        // Точное время и работа в режиме энергосбережения: напоминание должно сработать
        // в срок, а не когда система решит разбудить приложение.
        schedule: { at: item.at, allowWhileIdle: true },
        extra: { source: REMINDER_NOTIFICATION_SOURCE, reminderId: item.reminderId },
      })),
    })
  } catch (error) {
    // Напоминания в системе — удобство, а не данные: сбой не должен ломать приложение,
    // поэтому ошибка только пишется в консоль, а напоминания остаются на экранах.
    console.warn('SelfCRM: не удалось обновить напоминания в системе', error)
  }
}
