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
// Система может и промолчать: Capacitor ловит исключение из метода плагина, пишет его в лог и
// оставляет вызов без ответа, поэтому обещание в JavaScript повисает. Из-за этого экран настроек
// вечно показывал «Проверяем состояние…», а синхронизация не доходила до постановки расписания.
// Поэтому каждый вызов системы ждём ограниченное время (`askSystem`), а причину сбоя показываем
// словами: и в строках состояния, и подписью «Не удалось поставить расписание» в настройках
// (`reminderNotificationProblem`).
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

// Предел ожидания ответа системы. Вызов плагина может не ответить вовсе: Capacitor ловит
// исключение из метода плагина, пишет его в лог и оставляет вызов без ответа, а ещё бывает,
// что экземпляр плагина вообще не создался. Обещание в JavaScript тогда повисает навсегда —
// из-за этого «Настройки → Напоминания» вечно показывали «Проверяем состояние…», а
// синхронизация не доходила до постановки расписания, и напоминания молча не вставали.
// Поэтому у каждого вызова есть предел ожидания: не ответила система — считаем состояние
// неизвестным и идём дальше.
const READ_TIMEOUT_MS = 5_000
// Действия, в которых участвует пользователь: система показывает свой экран или диалог,
// поэтому времени на ответ даём больше.
const ACTION_TIMEOUT_MS = 60_000

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
 * Что прочитать не удалось и почему. Строки состояния показывают это под собой: без причины
 * «Проверяем состояние…» остаётся вечной загадкой, а «напоминания не приходят» — тем более.
 */
export interface ReminderProblem {
  what: 'notifications' | 'exact' | 'pending'
  text: string
}

/**
 * Что видно про напоминания в системе — для «Настройки → Напоминания»: разрешения и список
 * запланированного. Состояния читаются у системы, а не угадываются, поэтому экран говорит о
 * том, что есть на самом деле (в браузере и Telegram отчёта нет — null).
 */
export interface ReminderSystemReport {
  notifications: ReminderPermissionState
  exact: ReminderPermissionState
  pending: ReminderNotification[]
  // Пусто — состояние прочитано целиком.
  problems: ReminderProblem[]
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

// Итог вызова системы: либо ответ, либо причина, по которой его нет (ошибка плагина или
// молчание — повисший вызов). Причина показывается словами, поэтому тип у неё строковый;
// сама ошибка тоже сохраняется — по коду видно, отказ это системы («уведомления выключены
// для приложения») или настоящий сбой.
type PluginAnswer<T> =
  | { ok: true; value: T }
  | { ok: false; problem: string; error?: unknown }

/** Ошибка плагина словами: код отказа и текст — по ним видно, что именно не сработало. */
function pluginErrorText(error: unknown): string {
  const code = (error as { code?: string } | null | undefined)?.code
  const message = error instanceof Error ? error.message : String(error ?? '')
  return [code, message].filter(Boolean).join(' ') || 'ошибка без описания'
}

/**
 * Вызов системы с пределом ожидания: возвращает ответ или причину («система не ответила за
 * N с» либо текст ошибки плагина). Без предела ожидания повисший вызов останавливал бы
 * навсегда и экран состояния, и постановку расписания. Что именно спрашивали — видно в
 * предупреждении консоли, а причина в ответе короткая: экран подставляет её в готовую фразу.
 */
async function askSystem<T>(
  call: () => Promise<T>,
  timeoutMs: number,
  what: string,
): Promise<PluginAnswer<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const promise = Promise.resolve().then(call)
  try {
    return await Promise.race([
      promise.then((value) => ({ ok: true as const, value })),
      new Promise<{ ok: false; problem: string }>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              ok: false,
              problem: `система не ответила за ${Math.round(timeoutMs / 1000)} с (${what})`,
            }),
          timeoutMs,
        )
      }),
    ])
  } catch (error) {
    console.warn(`SelfCRM: система ответила ошибкой — ${what}`, error)
    return { ok: false, problem: `система ответила ошибкой: ${pluginErrorText(error)}`, error }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    // Повисший вызов может ответить позже: его итог уже никому не нужен, а необработанная
    // ошибка всплыла бы в консоли чужой строкой.
    void promise.catch(() => undefined)
  }
}

// Последний итог синхронизации: экран читает его синхронно, а об обновлении узнаёт подпиской
// (React-хук `useSyncExternalStore`). Так подпись о том, что уведомления не разрешены, появляется
// сразу после того, как это выяснилось, без отдельного хранилища состояния.
let lastStatus: ReminderSyncStatus | null = null
// Причина последнего сбоя синхронизации: «напоминания не встали» без причины ничего не
// объясняет, поэтому экран настроек показывает её словами.
let lastProblem: string | null = null
const statusListeners = new Set<() => void>()

/** Итог последней синхронизации: null — она ещё не проходила. */
export function reminderNotificationStatus(): ReminderSyncStatus | null {
  return lastStatus
}

/** Причина последнего сбоя синхронизации: null — сбоя не было. */
export function reminderNotificationProblem(): string | null {
  return lastProblem
}

export function subscribeReminderNotificationStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

function notifyStatusListeners(): void {
  for (const listener of statusListeners) listener()
}

function setStatus(status: ReminderSyncStatus): ReminderSyncStatus {
  if (status !== lastStatus) {
    lastStatus = status
    notifyStatusListeners()
  }
  return status
}

function setProblem(problem: string | null): void {
  if (problem !== lastProblem) {
    lastProblem = problem
    notifyStatusListeners()
  }
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
  const current = await askSystem(
    () => plugin.checkPermissions(),
    READ_TIMEOUT_MS,
    'разрешение на уведомления',
  )
  if (current.ok && current.value.display === 'granted') return true
  if (permissionAsked && !force) return false
  permissionAsked = true
  const asked = await askSystem(
    () => plugin.requestPermissions(),
    ACTION_TIMEOUT_MS,
    'запрос разрешения на уведомления',
  )
  return asked.ok && asked.value.display === 'granted'
}

/**
 * Разрешены ли точные будильники (Android 12+): от этого зависит, сработает напоминание
 * в назначенную минуту или с задержкой. На Android 13+ разрешение (`USE_EXACT_ALARM`) выдано
 * приложению при установке, поэтому система отвечает «granted» без действий пользователя.
 * Молчание системы считаем отказом: неточное напоминание лучше, чем никакого.
 */
async function exactAlarmsGranted(plugin: LocalNotificationsPlugin): Promise<boolean> {
  const answer = await askSystem(
    () => plugin.checkExactNotificationSetting(),
    READ_TIMEOUT_MS,
    'точные будильники',
  )
  return answer.ok && answer.value.exact_alarm === 'granted'
}

/**
 * Канал уведомлений создаётся перед постановкой: без него на Android 8+ уведомление не видно.
 * Сбой канала расписание не отменяет: канал создан прошлыми запусками, а лишиться напоминания
 * из-за него хуже, чем поставить напоминание молча.
 */
async function createReminderChannel(plugin: LocalNotificationsPlugin): Promise<void> {
  const answer = await askSystem(
    () =>
      plugin.createChannel({
        id: REMINDER_CHANNEL_ID,
        name: REMINDER_CHANNEL_NAME,
        description: 'Напоминания по заказам SelfCRM',
        importance: 4,
        // Текст виден на экране блокировки, но система скрывает его, если устройство
        // защищено паролем: в уведомлении бывают имя клиента и номер заказа.
        visibility: 0,
        vibration: true,
      }),
    READ_TIMEOUT_MS,
    'канал уведомлений',
  )
  if (!answer.ok) console.warn(`SelfCRM: канал уведомлений не создан — ${answer.problem}`)
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

/**
 * Поставленные приложением напоминания — по сроку, как их показывает система. Список может
 * прийти неполным (или не прийти вовсе): тогда это пустой список, а не сбой чтения — о сбое
 * скажет вызывающий.
 */
function pendingReminders(pending: {
  notifications?: {
    id: number
    title: string
    body: string
    extra?: unknown
    schedule?: { at?: unknown }
  }[]
}): ReminderNotification[] {
  const items = Array.isArray(pending.notifications) ? pending.notifications : []
  return ourNotifications(items)
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

/**
 * Разрешение на уведомления глазами системы: 'unknown' — система его не назвала (отказ или
 * молчание). Сбой одного чтения не скрывает остальные: строка состояния сообщает о себе сама.
 */
async function notificationState(
  plugin: LocalNotificationsPlugin,
  problems: ReminderProblem[],
): Promise<ReminderPermissionState> {
  const answer = await askSystem(
    () => plugin.checkPermissions(),
    READ_TIMEOUT_MS,
    'разрешение на уведомления',
  )
  if (!answer.ok) {
    problems.push({ what: 'notifications', text: answer.problem })
    return 'unknown'
  }
  return permissionState(answer.value.display)
}

/** Точные будильники глазами системы: 'unknown' — система не назвала состояние. */
async function exactAlarmState(
  plugin: LocalNotificationsPlugin,
  problems: ReminderProblem[],
): Promise<ReminderPermissionState> {
  const answer = await askSystem(
    () => plugin.checkExactNotificationSetting(),
    READ_TIMEOUT_MS,
    'точные будильники',
  )
  if (!answer.ok) {
    problems.push({ what: 'exact', text: answer.problem })
    return 'unknown'
  }
  return answer.value.exact_alarm === 'granted' ? 'granted' : 'denied'
}

/** Список запланированного глазами системы: пусто, если система его не отдала. */
async function pendingState(
  plugin: LocalNotificationsPlugin,
  problems: ReminderProblem[],
): Promise<ReminderNotification[]> {
  const answer = await askSystem(
    () => plugin.getPending(),
    READ_TIMEOUT_MS,
    'список запланированного',
  )
  if (!answer.ok) {
    problems.push({ what: 'pending', text: answer.problem })
    return []
  }
  return pendingReminders(answer.value)
}

/**
 * Состояние напоминаний в системе для «Настройки → Напоминания»: разрешения и список
 * запланированного. Каждое состояние читается отдельно и со своим пределом ожидания, поэтому
 * сбой или молчание системы в одном пункте не прячет остальные — раньше общий отказ превращал
 * весь отчёт в null, а экран показывал «Проверяем состояние…» и ни слова о причине.
 * Разрешения читаются у системы, а не угадываются по итогу синхронизации, поэтому экран
 * говорит то, что есть на самом деле. В браузере и Telegram системных уведомлений нет —
 * отчёта тоже (null).
 */
export async function readReminderSystemReport(): Promise<ReminderSystemReport | null> {
  if (!reminderNotificationsSupported()) return null
  let plugin: LocalNotificationsPlugin
  try {
    plugin = await loadLocalNotifications()
  } catch (error) {
    // Плагин не загрузился — системных напоминаний нет вовсе. Это тоже состояние, о котором
    // нужно сказать словами: по вечному «Проверяем состояние…» понять что-либо нельзя.
    console.warn('SelfCRM: не удалось загрузить плагин напоминаний', error)
    const text = pluginErrorText(error)
    return {
      notifications: 'unknown',
      exact: 'unknown',
      pending: [],
      problems: [
        { what: 'notifications', text },
        { what: 'exact', text },
        { what: 'pending', text },
      ],
    }
  }
  const problems: ReminderProblem[] = []
  // Читаем все три состояния сразу: они независимы, а при замолчавшей системе ожидание подряд
  // сложилось бы втрое — «Проверяем состояние…» висело бы пятнадцать секунд вместо пяти.
  const [notifications, exact, pending] = await Promise.all([
    notificationState(plugin, problems),
    exactAlarmState(plugin, problems),
    pendingState(plugin, problems),
  ])
  return { notifications, exact, pending, problems }
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
    const answer = await askSystem(
      () => plugin.changeExactNotificationSetting(),
      ACTION_TIMEOUT_MS,
      'запрос точных будильников',
    )
    return answer.ok && answer.value.exact_alarm === 'granted'
  } catch (error) {
    console.warn('SelfCRM: не удалось запросить разрешение на точные будильники', error)
    return false
  }
}

/**
 * Проверка из настроек: ставит проверочное уведомление через `REMINDER_TEST_DELAY_SECONDS`
 * секунд — по нему видно, доходит ли уведомление, когда приложение свёрнуто. Срок считается от
 * `now`, поэтому тесты не зависят от реального времени. Сбой на любом шаге даёт свой итог, а не
 * повисшую кнопку «Отправка…».
 */
export async function sendTestReminderNotification(
  now: Date = new Date(),
): Promise<ReminderTestStatus> {
  if (!reminderNotificationsSupported()) return 'unsupported'
  try {
    const plugin = await loadLocalNotifications()
    setProblem(null)

    // Прежняя проверка могла не сработать (уведомления не были разрешены): снимаем её,
    // чтобы новая не ждала в очереди за старой. Список не отдала система — просто ставим
    // новую проверку: у неё тот же id, поэтому прежняя заменится сама.
    const pending = await askSystem(
      () => plugin.getPending(),
      READ_TIMEOUT_MS,
      'список запланированного',
    )
    if (pending.ok) {
      const stale = ourNotifications(pending.value.notifications, REMINDER_TEST_SOURCE)
      if (stale.length) {
        await askSystem(
          () => plugin.cancel({ notifications: stale.map((item) => ({ id: item.id })) }),
          READ_TIMEOUT_MS,
          'снятие прежней проверки',
        )
      }
    } else {
      console.warn(`SelfCRM: прежняя проверка не снята — ${pending.problem}`)
    }

    if (!(await askNotificationPermission(plugin, true))) return 'denied'
    await createReminderChannel(plugin)

    const at = new Date(now.getTime() + REMINDER_TEST_DELAY_SECONDS * 1000)
    const exact = await exactAlarmsGranted(plugin)
    const scheduled = await askSystem(
      () =>
        plugin.schedule({
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
        }),
      ACTION_TIMEOUT_MS,
      'постановка проверочного уведомления',
    )
    if (!scheduled.ok) {
      // Уведомления выключены для приложения в системе: экран говорит об этом словами
      // «не разрешены» — это состояние, а не сбой.
      if (notificationsDisabled(scheduled.error)) return 'denied'
      console.warn(`SelfCRM: проверочное уведомление не поставлено — ${scheduled.problem}`)
      setProblem(scheduled.problem)
      return 'failed'
    }
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
 * Снятие прежнего расписания — удобство, а не условие работы: список запланированного может
 * не прийти (система молчит), и тогда расписание ставится без снятия. Раньше молчание системы
 * на этом шаге останавливало синхронизацию целиком — напоминания не вставали вовсе, и на экране
 * не было ни слова о причине.
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

    const pending = await askSystem(
      () => plugin.getPending(),
      READ_TIMEOUT_MS,
      'список запланированного',
    )
    if (pending.ok) {
      const ours = ourNotifications(pending.value.notifications)
      if (ours.length) {
        const cancelled = await askSystem(
          () => plugin.cancel({ notifications: ours.map((item) => ({ id: item.id })) }),
          READ_TIMEOUT_MS,
          'снятие прежнего расписания',
        )
        // Не беда: у напоминания тот же id, поэтому новый вызов заменяет прежний.
        if (!cancelled.ok) console.warn(`SelfCRM: прежнее расписание не снято — ${cancelled.problem}`)
      }
    } else {
      console.warn(`SelfCRM: расписание пересобрано без снятия прежнего — ${pending.problem}`)
    }

    if (!planned.length) {
      setProblem(null)
      return setStatus('nothing')
    }
    if (!(await askNotificationPermission(plugin))) {
      setProblem(null)
      return setStatus('denied')
    }

    await createReminderChannel(plugin)

    // Точные будильники (Android 12+). Разрешение есть у приложения изначально: на Android 13+
    // система выдаёт `USE_EXACT_ALARM` при установке, на Android 12 `SCHEDULE_EXACT_ALARM`
    // выдано по умолчанию, — поэтому напоминание приходит в назначенную минуту. Точное время
    // просим только когда разрешение выдано: иначе плагин сначала открыл бы системный экран
    // «Будильники и напоминания» и поставил расписание лишь после ответа — а неточный будильник
    // система сдвигает на неопределённый срок (в спящем телефоне — на часы), и напоминание
    // молча не приходит. Если точного разрешения всё-таки нет, ставим неточный будильник и
    // говорим об этом экрану ('inexact').
    const exact = await exactAlarmsGranted(plugin)

    const scheduled = await askSystem(
      () =>
        plugin.schedule({
          notifications: planned.map((item) => ({
            id: item.id,
            title: item.title,
            body: item.body,
            channelId: REMINDER_CHANNEL_ID,
            schedule: { at: item.at, allowWhileIdle: true },
            isExactNotification: exact,
            extra: { source: REMINDER_NOTIFICATION_SOURCE, reminderId: item.reminderId },
          })),
        }),
      ACTION_TIMEOUT_MS,
      'постановка расписания',
    )
    if (!scheduled.ok) {
      // Отказ «уведомления выключены для приложения в системе» — не сбой, а состояние:
      // экран говорит о нём подписью «не разрешены», а не «не удалось поставить».
      if (notificationsDisabled(scheduled.error)) {
        setProblem(null)
        return setStatus('denied')
      }
      console.warn(`SelfCRM: расписание не поставлено — ${scheduled.problem}`)
      setProblem(scheduled.problem)
      return setStatus('failed')
    }
    setProblem(null)
    // Плагин предупреждает, если точный будильник не встал: система вольна сдвинуть такое
    // напоминание, поэтому итог — 'inexact', а не 'scheduled'.
    return setStatus(exact && !scheduledInexact(scheduled.value) ? 'scheduled' : 'inexact')
  } catch (error) {
    // Уведомления могут быть выключены для приложения в системе (разрешение при этом выдано):
    // плагин отказывает кодом `OS-PLUG-LNOT-0005`. Это не сбой, а состояние, о котором нужно
    // сказать пользователю, — иначе напоминания молча не приходят.
    if (notificationsDisabled(error)) {
      setProblem(null)
      return setStatus('denied')
    }
    // Остальное — сбой плагина: напоминания в системе удобство, а не данные, поэтому ошибка
    // только пишется в консоль, а напоминания остаются на экранах.
    console.warn('SelfCRM: не удалось обновить напоминания в системе', error)
    setProblem(pluginErrorText(error))
    return setStatus('failed')
  }
}
