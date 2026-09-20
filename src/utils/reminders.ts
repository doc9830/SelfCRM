// Напоминания по заказам: подсказки текста, сроки («сегодня», «завтра», просрочено)
// и группировка для компактного блока на главном экране.
import type { Order, Reminder, ReminderKind } from '../types'
import { REMINDER_KINDS } from '../types'
import type { IconName } from '../components/Icons'
import { formatShortDate } from './format'

export const REMINDER_KIND_LABEL: Record<ReminderKind, string> = {
  call: 'Звонок',
  payment: 'Оплата',
  product: 'Товар',
  other: 'Другое',
}

export const REMINDER_KIND_ICON: Record<ReminderKind, IconName> = {
  call: 'phone',
  payment: 'wallet',
  product: 'box',
  other: 'edit',
}

// Подсказка текста по виду напоминания. Для «Другого» её нет: там текст вводит
// пользователь, и без него напоминание не сохраняется.
export const REMINDER_KIND_HINT: Record<ReminderKind, string> = {
  call: 'Позвонить клиенту',
  payment: 'Напомнить об оплате',
  product: 'Проверить наличие/получение товара',
  other: '',
}

export function reminderHintText(kind: ReminderKind): string {
  return REMINDER_KIND_HINT[kind]
}

// Текст считается подсказкой, если он пуст или совпадает с подсказкой любого вида:
// тогда смена вида переписывает его, а свой текст пользователя остаётся нетронутым.
export function isReminderHintText(text: string): boolean {
  const value = text.trim()
  if (!value) return true
  return REMINDER_KINDS.some((kind) => REMINDER_KIND_HINT[kind] === value)
}

/** Текст при переключении вида: свой текст сохраняем, подсказку заменяем новой. */
export function reminderTextForKind(kind: ReminderKind, current: string): string {
  return isReminderHintText(current) ? REMINDER_KIND_HINT[kind] : current
}

/** Ошибка текста: «Другое» без описания сохранить нельзя. */
export function reminderTextError(kind: ReminderKind, text: string): string {
  return kind === 'other' && !text.trim() ? 'Опишите, о чём напомнить' : ''
}

/** Начало суток в местном времени — по нему сравниваются «сегодня» и «завтра». */
export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export type ReminderGroupKey = 'overdue' | 'today' | 'tomorrow' | 'later'

export const REMINDER_GROUP_LABEL: Record<ReminderGroupKey, string> = {
  overdue: 'Просрочено',
  today: 'Сегодня',
  tomorrow: 'Завтра',
  later: 'Позже',
}

export const REMINDER_GROUP_ORDER: ReminderGroupKey[] = ['overdue', 'today', 'tomorrow', 'later']

/**
 * Группа напоминания. Просроченное показывается отдельно и раньше остальных —
 * даже если срок был сегодня утром: о нём нужно вспомнить в первую очередь.
 */
export function reminderGroupKey(dueAt: string, now: Date = new Date()): ReminderGroupKey {
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return 'later'
  if (due.getTime() < now.getTime()) return 'overdue'

  const days = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return 'later'
}

/** Время напоминания «чч:мм». */
export function reminderTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Подпись срока: «Сегодня, 18:00», «Завтра, 09:00», «19.09, 12:30». */
export function reminderWhenLabel(iso: string, now: Date = new Date()): string {
  const time = reminderTime(iso)
  if (!time) return ''

  const key = reminderGroupKey(iso, now)
  if (key === 'today') return `Сегодня, ${time}`
  if (key === 'tomorrow') return `Завтра, ${time}`
  return `${formatShortDate(iso, now)}, ${time}`
}

// Время для быстрых вариантов «Сегодня» и «Завтра»: ближайший круглый час, чтобы
// только что созданное напоминание не оказалось сразу просроченным.
export function defaultReminderDueAt(day: 'today' | 'tomorrow', now: Date = new Date()): string {
  const due = new Date(now)
  due.setMinutes(0, 0, 0)
  due.setHours(due.getHours() + 1)
  if (day === 'tomorrow') due.setDate(due.getDate() + 1)
  return due.toISOString()
}

/** Момент из полей «дата» и «время» окна напоминания (пустое время — полдень). */
export function reminderDueAtFromInputs(date: string, time: string, fallback: Date = new Date()): string {
  const parsed = new Date(`${date}T${time || '12:00'}:00`)
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString()
}

/** Напоминание вместе с заказом, которому оно принадлежит. */
export interface ReminderEntry {
  order: Order
  reminder: Reminder
}

export interface ReminderGroup {
  key: ReminderGroupKey
  label: string
  items: ReminderEntry[]
}

/** Ближайшие сверху. */
export function sortReminders(entries: ReminderEntry[]): ReminderEntry[] {
  return [...entries].sort(
    (a, b) => new Date(a.reminder.dueAt).getTime() - new Date(b.reminder.dueAt).getTime(),
  )
}

// В карточке заказа активные напоминания идут первыми по сроку, выполненные —
// ниже: они остаются как история, но перестают мешать.
export function sortOrderReminders(reminders: Reminder[]): Reminder[] {
  return [...reminders].sort((a, b) => {
    if (Boolean(a.done) !== Boolean(b.done)) return a.done ? 1 : -1
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
  })
}

/** Активные напоминания (без выполненных), сгруппированные по сроку. */
export function groupReminders(entries: ReminderEntry[], now: Date = new Date()): ReminderGroup[] {
  const groups = new Map<ReminderGroupKey, ReminderEntry[]>()
  for (const entry of sortReminders(entries)) {
    if (entry.reminder.done) continue
    const key = reminderGroupKey(entry.reminder.dueAt, now)
    const list = groups.get(key)
    if (list) list.push(entry)
    else groups.set(key, [entry])
  }

  return REMINDER_GROUP_ORDER.filter((key) => groups.has(key)).map((key) => {
    const items = groups.get(key) as ReminderEntry[]
    // Для дальних сроков вместо слова «Позже» показываем дату — так понятнее, когда ждать.
    const label =
      key === 'later' ? formatShortDate(items[0].reminder.dueAt, now) : REMINDER_GROUP_LABEL[key]
    return { key, label, items }
  })
}

// Главный экран — не планировщик: показываем несколько ближайших напоминаний,
// остальные живут в карточках заказов.
export const DASHBOARD_REMINDER_LIMIT = 5

export function limitReminderGroups(
  groups: ReminderGroup[],
  limit: number = DASHBOARD_REMINDER_LIMIT,
): { groups: ReminderGroup[]; hidden: number } {
  const result: ReminderGroup[] = []
  let shown = 0
  let hidden = 0

  for (const group of groups) {
    if (shown >= limit) {
      hidden += group.items.length
      continue
    }
    const free = limit - shown
    if (group.items.length <= free) {
      result.push(group)
      shown += group.items.length
    } else {
      result.push({ ...group, items: group.items.slice(0, free) })
      shown = limit
      hidden += group.items.length - free
    }
  }

  return { groups: result, hidden }
}
