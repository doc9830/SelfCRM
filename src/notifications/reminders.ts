// Системные напоминания (Android): приложение просит систему показать уведомление в срок
// напоминания по заказу — даже когда SelfCRM закрыта. Планируются только те напоминания,
// которые создал пользователь (`db.getReminders()`): своих уведомлений приложение
// не придумывает.
//
// Разрешение на уведомления система спрашивает сама — когда есть напоминание с будущим сроком;
// стоит пользователю отказать, уведомлений не будет, и приложение говорит об этом подписью на
// главном экране (`reminderNotificationStatus`). Точные будильники (Android 12+) у приложения
// есть изначально (`USE_EXACT_ALARM` в манифесте: система выдаёт его при установке), поэтому
// напоминание приходит в назначенную минуту, а не «когда-нибудь»: неточный будильник система
// сдвигает на неопределённый срок. Состояние разрешений, список запланированного и проверочное
// уведомление показывает «Настройки → Напоминания» (`readReminderSystemReport`,
// `sendTestReminderNotification`) — без них «напоминания не пришли» остаётся загадкой.
//
// В браузере и в мини-приложении Telegram системных уведомлений нет: там функции ниже
// возвращают 'unsupported' (а проверка — null), сроки видны блоком «Напоминания» на главном
// экране (utils/reminders.ts). Плагин подгружается по требованию, поэтому в веб-версии его код
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

// Предупреждение плагина «точный будильник не встал, поставили неточный»: разрешения на точные
// будильники нет, поэтому система вольна сдвинуть напоминание. О таком итоге экран говорит
// подписью, иначе задержка выглядит как «напоминание не пришло».
const SCHEDULED_INEXACT_CODE = 'OS-PLUG-LNOT-0017'

// Метка «своих» уведомлений в системе: при синхронизации снимаются только они,
// чужие записи приложения (если появятся) остаются на месте.
export const REMINDER_NOTIFICATION_SOURCE = 'selfcrm-reminder'

// Проверочное уведомление из настроек: своя метка, чтобы синхронизация расписания его не сняла,
// и свой фиксированный id, чтобы повторная проверка заменяла прежнюю, а не копила уведомления.
export const REMINDER_TEST_SOURCE = 'selfcrm-reminder-test'
export const REMINDER_TEST_DELAY_SECONDS = 15

// Состояние разрешения в системе — так же, как его отдаёт плагин: 'prompt' значит «система
// ещё не спрашивала».
type ReminderPermission = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'

// Состояние разрешения для экрана настроек: 'unknown' — система не ответила (старые версии
// Android, где таких разрешений нет вовсе).
export type ReminderPermissionState = 'granted' | 'denied' | 'unknown'

/**
 * Чем закончилась последняя синхронизация расписания: по статусу видно, придут ли напоминания
 * уведомлениями. 'denied' — разрешение не выдано (или уведомления выключены для приложения):
 * о таком состоянии приложение говорит пользователю подписью на главном экране. 'inexact' —
 * напоминание поставлено неточным будильником: система может задержать его на неопределённый
 * срок, поэтому экран предупреждает об этом и предлагает включить точные будильники.
 */
export type ReminderSyncStatus =
  | 'unsupported'
  | 'nothing'
  | 'scheduled'
  | 'inexact'
  | 'denied'
  | 'failed'

/**
 * Что видно про напоминания в системе — для «Настройки → Напоминания»: разрешения и список
 * запланированного. Состояния читаются у системы, а не угадываются, поэтому экран говорит о
 * том, что есть на самом деле (в браузере и Telegram отчёта нет — null).
 */
export interface ReminderSystemReport {
  notifications: ReminderPermissionState
  exact: ReminderPermissionState
  pending: ReminderNotification[]
}

/** Итог проверочного уведомления: 'sent' — поставлено, 'denied' — система не разрешает показ. */
export type ReminderTestStatus = 'sent' | 'denied' | 'unsupported' | 'failed'

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
// данных, и без этой защёлки диалог всплывал бы снова и снова после отказа. Кнопка «Разрешить»
// в настройках просит явно (`force`) — там пользователь сам решил показать диалог.
let permissionAsked = false

/**
 * Проверяет разрешение и при необходимости показывает системный запрос. Android 13+ спрашивает
 * пользователя, на старых версиях разрешение выдано заранее, поэтому повторный вызов просто
 * вернёт «granted».
 */
async function askNotificationPermission(
  plugin: LocalNotificationsPlugin,
  force = false,
): Promise<boolean> {
  const current = await plugin.checkPermissions()
  if (current.display === 'granted') return true
  if (permissionAsked && !force) return false
  permissionAsked = true
  const asked = await plugin.requestPermissions()
  return asked.display === 'granted'
}

/**
 * Разрешены ли точные будильники (Android 12+): от этого зависит, сработает напоминание
 * в назначенную минуту или с задержкой. На Android 13+ разрешение (`USE_EXACT_ALARM`) выдано
 * приложению при установке, поэтому система отвечает «granted» без действий пользователя.
 */
async function reminderExactAlarmPermission(
  plugin: LocalNotificationsPlugin,
): Promise<ReminderPermission> {
  const status = await plugin.checkExactNotificationSetting()
  return status.exact_alarm
}

/** Канал уведомлений создаётся перед постановкой: без него на Android 8+ уведомление не видно. */
async function createReminderChannel(plugin: LocalNotificationsPlugin): Promise<void> {
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
}

/** Метка уведомления в системе: по ней отличимы «свои» записи приложения от чужих. */
function notificationSource(item: { extra?: unknown }): string | undefined {
  return (item.extra as { source?: string } | null | undefined)?.source
}

/** Что из поставленного принадлежит приложению: напоминания или проверка. */
function ourNotifications<T extends { extra?: unknown }>(
  items: T[],
  source: string = REMINDER_NOTIFICATION_SOURCE,
): T[] {
  return items.filter((item) => notificationSource(item) === source)
}

/**
 * Дата из записи системы. Плагин хранит уведомление тем видом, в каком его получил, поэтому
 * срок приходит то датой, то строкой — приводим к дате здесь, а не в месте показа.
 */
function notificationDate(value: unknown): Date | null {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

/** Поставленные приложением напоминания — по сроку, как их показывает система. */
function pendingReminders(pending: {
  notifications: {
    id: number
    title: string
    body: string
    extra?: unknown
    schedule?: { at?: unknown }
  }[]
}): ReminderNotification[] {
  return ourNotifications(pending.notifications)
    .map((item) => ({
      reminderId: (item.extra as { reminderId?: string } | null | undefined)?.reminderId ?? '',
      id: item.id,
      title: item.title,
      body: item.body,
      at: notificationDate(item.schedule?.at),
    }))
    .filter((item): item is ReminderNotification => item.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
}

function permissionState(display: string): ReminderPermissionState {
  if (display === 'granted') return 'granted'
  if (display === 'denied') return 'denied'
  return 'unknown'
}

async function exactAlarmState(plugin: LocalNotificationsPlugin): Promise<ReminderPermissionState> {
  try {
    return (await reminderExactAlarmPermission(plugin)) === 'granted' ? 'granted' : 'denied'
  } catch (error) {
    console.warn('SelfCRM: система не сообщила состояние точных будильников', error)
    return 'unknown'
  }
}

/**
 * Состояние напоминаний в системе для «Настройки → Напоминания»: разрешения и список
 * запланированного. Разрешения читаются у системы, а не угадываются по итогу синхронизации,
 * поэтому экран говорит то, что есть на самом деле. В браузере и Telegram системных
 * уведомлений нет — отчёта тоже (null).
 */
export async function readReminderSystemReport(): Promise<ReminderSystemReport | null> {
  if (!reminderNotificationsSupported()) return null
  try {
    const plugin = await loadLocalNotifications()
    return {
      notifications: permissionState((await plugin.checkPermissions()).display),
      exact: await exactAlarmState(plugin),
      pending: pendingReminders(await plugin.getPending()),
    }
  } catch (error) {
    // Сбой чтения не ломает приложение: состояние — подсказка, а не данные.
    console.warn('SelfCRM: не удалось прочитать состояние напоминаний', error)
    return null
  }
}

/**
 * Кнопка «Разрешить» для уведомлений: показывает системный диалог явно, даже если приложение
 * уже спрашивало и получило отказ (пользователь мог передумать).
 */
export async function allowReminderNotifications(): Promise<boolean> {
  if (!reminderNotificationsSupported()) return false
  try {
    const plugin = await loadLocalNotifications()
    return await askNotificationPermission(plugin, true)
  } catch (error) {
    console.warn('SelfCRM: не удалось запросить разрешение на уведомления', error)
    return false
  }
}

/**
 * Кнопка «Разрешить» для точных будильников. У приложения они есть сразу (`USE_EXACT_ALARM`),
 * но если система их не выдала, плагин открывает системный экран «Будильники и напоминания»:
 * разрешение выдаёт пользователь, а вернувшись в приложение он увидит новый итог — расписание
 * пересобирается при возвращении в приложение.
 */
export async function allowExactReminderAlarms(): Promise<boolean> {
  if (!reminderNotificationsSupported()) return false
  try {
    const plugin = await loadLocalNotifications()
    const status = await plugin.changeExactNotificationSetting()
    return status.exact_alarm === 'granted'
  } catch (error) {
    console.warn('SelfCRM: не удалось запросить разрешение на точные будильники', error)
    return false
  }
}

/**
 * Проверка из настроек: ставит проверочное уведомление через `REMINDER_TEST_DELAY_SECONDS`
 * секунд — по нему видно, доходит ли уведомление, когда приложение свёрнуто. Срок считается от
 * `now`, поэтому тесты не зависят от реального времени.
 */
export async function sendTestReminderNotification(
  now: Date = new Date(),
): Promise<ReminderTestStatus> {
  if (!reminderNotificationsSupported()) return 'unsupported'
  try {
    const plugin = await loadLocalNotifications()

    // Прежняя проверка могла не сработать (уведомления не были разрешены): снимаем её,
    // чтобы новая не ждала в очереди за старой.
    const stale = ourNotifications((await plugin.getPending()).notifications, REMINDER_TEST_SOURCE)
    if (stale.length) {
      await plugin.cancel({ notifications: stale.map((item) => ({ id: item.id })) })
    }

    if (!(await askNotificationPermission(plugin, true))) return 'denied'
    await createReminderChannel(plugin)

    const at = new Date(now.getTime() + REMINDER_TEST_DELAY_SECONDS * 1000)
    const exact = (await reminderExactAlarmPermission(plugin)) === 'granted'
    await plugin.schedule({
      notifications: [
        {
          id: reminderNotificationId(REMINDER_TEST_SOURCE),
          title: 'Проверка напоминаний',
          body: 'Уведомления SelfCRM приходят. Проверка из настроек приложения.',
          channelId: REMINDER_CHANNEL_ID,
          schedule: { at, allowWhileIdle: true },
          isExactNotification: exact,
          extra: { source: REMINDER_TEST_SOURCE },
        },
      ],
    })
    return 'sent'
  } catch (error) {
    if (notificationsDisabled(error)) return 'denied'
    console.warn('SelfCRM: не удалось поставить проверочное уведомление', error)
    return 'failed'
  }
}

/**
 * Плагин предупреждает (`OS-PLUG-LNOT-0017`), что точный будильник не встал и расписание стало
 * неточным: проверяем и код, и текст — код числовой и может смениться при обновлении плагина.
 */
function scheduledInexact(result: unknown): boolean {
  const warning = (result as { warning?: { code?: string; message?: string } } | null | undefined)
    ?.warning
  return warning?.code === SCHEDULED_INEXACT_CODE || /inexact/i.test(warning?.message ?? '')
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
    const ours = ourNotifications(pending.notifications)
    if (ours.length) {
      await plugin.cancel({ notifications: ours.map((item) => ({ id: item.id })) })
    }

    if (!planned.length) return setStatus('nothing')
    if (!(await askNotificationPermission(plugin))) return setStatus('denied')

    await createReminderChannel(plugin)

    // Точные будильники (Android 12+). Разрешение есть у приложения изначально: на Android 13+
    // система выдаёт `USE_EXACT_ALARM` при установке, на Android 12 `SCHEDULE_EXACT_ALARM`
    // выдано по умолчанию, — поэтому напоминание приходит в назначенную минуту. Точное время
    // просим только когда разрешение выдано: иначе плагин сначала открыл бы системный экран
    // «Будильники и напоминания» и поставил расписание лишь после ответа — а неточный будильник
    // система сдвигает на неопределённый срок (в спящем телефоне — на часы), и напоминание
    // молча не приходит. Если точного разрешения всё-таки нет, ставим неточный будильник и
    // говорим об этом экрану ('inexact').
    const exact = (await reminderExactAlarmPermission(plugin)) === 'granted'

    const result = await plugin.schedule({
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
    // Плагин предупреждает, если точный будильник не встал: система вольна сдвинуть такое
    // напоминание, поэтому итог — 'inexact', а не 'scheduled'.
    return setStatus(exact && !scheduledInexact(result) ? 'scheduled' : 'inexact')
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
