// Системные напоминания (Android): приложение просит систему показать уведомление в срок
// напоминания по заказу — даже когда SelfCRM закрыта. Планируются только те напоминания,
// которые создал пользователь (`db.getReminders()`): своих уведомлений приложение
// не придумывает.
//
// Разрешение система спрашивает сама: отдельного пункта в настройках нет. Диалог показывается
// один раз — когда есть напоминание с будущим сроком; стоит пользователю отказать, уведомлений
// не будет, и приложение говорит об этом подписью на главном экране (`reminderNotificationStatus`),
// а менять разрешение пользователь идёт в системные настройки.
//
// В браузере и в мини-приложении Telegram системных уведомлений нет: там функции ниже
// возвращают 'unsupported', а сроки видны блоком «Напоминания» на главном экране
// (utils/reminders.ts). Плагин подгружается по требованию, поэтому в веб-версии его код
// в бандл не попадает.
import { Capacitor } from '@capacitor/core'
import { orderHeading } from '../utils/orders'
import { REMINDER_KIND_LABEL, type ReminderEntry } from '../utils/reminders'

// Канал уведомлений Android: без него на Android 8+ уведомление не показывается.
// Важность 4 (высокая) — напоминание приходит всплывающей плашкой (heads-up), а не тихой
// строкой в шторке. Звук у канала не задаём: у канала без `setSound` система играет свой
// звук уведомления (`NotificationChannel.mSound` по умолчанию равен
// `Settings.System.DEFAULT_NOTIFICATION_URI`), поэтому напоминание звучит так, как настроено
// на телефоне, и молчит в беззвучном режиме. Своя мелодия из `res/raw` звучала бы в обход
// этих настроек, поэтому её в приложении нет.
export const REMINDER_CHANNEL_ID = 'selfcrm-reminders'
export const REMINDER_CHANNEL_NAME = 'Напоминания по заказам'

// Код отказа плагина «уведомления выключены в системе»: разрешение может быть выдано, а показ
// уведомлений для приложения выключен пользователем — тогда расписание не встаёт.
const NOTIFICATIONS_DISABLED_CODE = 'OS-PLUG-LNOT-0005'

// Метка «своих» уведомлений в системе: при синхронизации снимаются только они,
// чужие записи приложения (если появятся) остаются на месте.
export const REMINDER_NOTIFICATION_SOURCE = 'selfcrm-reminder'

// Состояние разрешения в системе — так же, как его отдаёт плагин: 'prompt' значит «система
// ещё не спрашивала».
type ReminderPermission = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'

/**
 * Чем закончилась последняя синхронизация расписания: по статусу видно, придут ли напоминания
 * уведомлениями. 'denied' — разрешение не выдано (или уведомления выключены для приложения):
 * о таком состоянии приложение говорит пользователю подписью на главном экране.
 */
export type ReminderSyncStatus = 'unsupported' | 'nothing' | 'scheduled' | 'denied' | 'failed'

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

// Последний итог синхронизации: экран читает его синхронно, а об обновлении узнаёт подпиской
// (React-хук `useSyncExternalStore`). Так подпись о том, что уведомления не разрешены, появляется
// сразу после того, как это выяснилось, без отдельного хранилища состояния.
let lastStatus: ReminderSyncStatus | null = null
const statusListeners = new Set<() => void>()

/** Итог последней синхронизации: null — она ещё не проходила. */
export function reminderNotificationStatus(): ReminderSyncStatus | null {
  return lastStatus
}

export function subscribeReminderNotificationStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

function setStatus(status: ReminderSyncStatus): ReminderSyncStatus {
  if (status !== lastStatus) {
    lastStatus = status
    for (const listener of statusListeners) listener()
  }
  return status
}

// Разрешение просим один раз за запуск приложения: синхронизация идёт после каждого изменения
// данных, и без этой защёлки диалог всплывал бы снова и снова после отказа.
let permissionAsked = false

/**
 * Проверяет разрешение и при необходимости показывает системный запрос. Android 13+ спрашивает
 * пользователя, на старых версиях разрешение выдано заранее, поэтому повторный вызов просто
 * вернёт «granted».
 */
async function askNotificationPermission(plugin: LocalNotificationsPlugin): Promise<boolean> {
  const current = await plugin.checkPermissions()
  if (current.display === 'granted') return true
  if (permissionAsked) return false
  permissionAsked = true
  const asked = await plugin.requestPermissions()
  return asked.display === 'granted'
}

/**
 * Разрешены ли точные будильники (Android 12+): от этого зависит, сработает напоминание
 * в назначенную минуту или с задержкой.
 */
async function reminderExactAlarmPermission(
  plugin: LocalNotificationsPlugin,
): Promise<ReminderPermission> {
  const status = await plugin.checkExactNotificationSetting()
  return status.exact_alarm
}

/**
 * Отказ плагина «уведомления выключены в системе». Проверяем и код, и текст: код числовой
 * (`OS-PLUG-LNOT-NNNN`) и может смениться при обновлении плагина.
 */
export function notificationsDisabled(error: unknown): boolean {
  const details = error as { code?: string; message?: string } | null | undefined
  return (
    details?.code === NOTIFICATIONS_DISABLED_CODE || /not enabled/i.test(details?.message ?? '')
  )
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
 *
 * Возвращает итог — по нему экран понимает, придут ли напоминания уведомлениями.
 */
export async function syncReminderNotifications(
  input: ReminderSyncInput,
): Promise<ReminderSyncStatus> {
  if (!reminderNotificationsSupported()) return setStatus('unsupported')
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

    if (!planned.length) return setStatus('nothing')
    if (!(await askNotificationPermission(plugin))) return setStatus('denied')

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

    // Точные будильники (Android 12+) — отдельное разрешение системы. Приложение его
    // не просит: не выдав разрешение, плагин сначала открывает системный экран
    // «Будильники и напоминания» и ставит расписание только после ответа — из-за этого
    // напоминания не встают вовсе. Поэтому точное время просим только когда оно уже
    // разрешено, иначе сразу ставим неточный будильник: он разбудит систему и в
    // энергосбережении (`allowWhileIdle`), но сработает с задержкой в несколько минут.
    const exact = (await reminderExactAlarmPermission(plugin)) === 'granted'

    await plugin.schedule({
      notifications: planned.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        channelId: REMINDER_CHANNEL_ID,
        schedule: { at: item.at, allowWhileIdle: true },
        isExactNotification: exact,
        extra: { source: REMINDER_NOTIFICATION_SOURCE, reminderId: item.reminderId },
      })),
    })
    return setStatus('scheduled')
  } catch (error) {
    // Уведомления могут быть выключены для приложения в системе (разрешение при этом выдано):
    // плагин отказывает кодом `OS-PLUG-LNOT-0005`. Это не сбой, а состояние, о котором нужно
    // сказать пользователю, — иначе напоминания молча не приходят.
    if (notificationsDisabled(error)) return setStatus('denied')
    // Остальное — сбой плагина: напоминания в системе удобство, а не данные, поэтому ошибка
    // только пишется в консоль, а напоминания остаются на экранах.
    console.warn('SelfCRM: не удалось обновить напоминания в системе', error)
    return setStatus('failed')
  }
}
