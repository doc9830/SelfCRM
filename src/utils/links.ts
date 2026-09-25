// Адреса экранов и разбор их параметров. Плашки на главном экране ведут на
// конкретный список заказов и на раздел статистики, поэтому параметры адреса —
// часть контракта экранов, а не разовая договорённость.
import { ORDER_STATUSES, isActiveStatus, type Order, type OrderStatus } from '../types'
import { FEEDBACK_TOPICS, type FeedbackTopic } from './feedback'
import { PERIOD_KEYS, type PeriodKey } from './stats'

// Фильтр списка заказов. «Активные» — это группа статусов (новый + в работе),
// а не отдельный статус заказа.
export type OrderFilter = 'all' | 'active' | OrderStatus

export const ORDER_FILTERS: OrderFilter[] = ['all', 'active', ...ORDER_STATUSES]

export const ORDER_FILTER_LABEL: Record<OrderFilter, string> = {
  all: 'Все',
  active: 'Активные',
  new: 'Новые',
  in_progress: 'В работе',
  done: 'Завершённые',
  cancelled: 'Отменённые',
}

// Ссылки для плашек на главном экране.
export const ACTIVE_ORDERS_LINK = '/orders?filter=active'

export function statisticsLink(period: PeriodKey): string {
  return `/statistics?period=${period}`
}

export function matchesOrderFilter(order: Order, filter: OrderFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'active') return isActiveStatus(order.status)
  return order.status === filter
}

// Значение параметра filter из адреса. Пустое или неизвестное значение — «Все».
export function orderFilterFromQuery(value: string | null): OrderFilter {
  const normalized = (value ?? '').trim().toLowerCase()
  return (ORDER_FILTERS as string[]).includes(normalized) ? (normalized as OrderFilter) : 'all'
}

// Значение параметра period из адреса. null — параметр не задан или некорректен,
// тогда экран статистики оставляет свой период по умолчанию.
export function statisticsPeriodFromQuery(value: string | null): PeriodKey | null {
  const normalized = (value ?? '').trim().toLowerCase()
  return (PERIOD_KEYS as string[]).includes(normalized) ? (normalized as PeriodKey) : null
}

// Вид списка клиентов. Архив — это тот же `/clients` с параметром archive, поэтому
// состояние переключателя живёт в адресе, а не в памяти экрана.
export const CLIENTS_ARCHIVE_LINK = '/clients?archive=1'

// Значение параметра archive из адреса: «1»/«true» — архив, всё остальное — активные.
export function clientsArchiveFromQuery(value: string | null): boolean {
  const normalized = (value ?? '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true'
}

// Ссылка переключателя в шапке: включённый архив открывает архив, выключенный — активных.
export function clientsLink(archived: boolean): string {
  return archived ? CLIENTS_ARCHIVE_LINK : '/clients'
}

// Метка «пришли из архива» в адресе карточки клиента.
export const CLIENTS_FROM_ARCHIVE = 'archive'

// Ссылка на карточку: архивный клиент помнит, что возврат должен вести в архив.
export function clientLink(id: string, archived = false): string {
  return archived ? `/clients/${id}?from=${CLIENTS_FROM_ARCHIVE}` : `/clients/${id}`
}

// Куда ведёт кнопка «Назад» из карточки клиента.
export function clientCardBackFromQuery(value: string | null): string {
  const normalized = (value ?? '').trim().toLowerCase()
  return normalized === CLIENTS_FROM_ARCHIVE ? CLIENTS_ARCHIVE_LINK : '/clients'
}

// «Повторить заказ»: форма нового заказа, заранее заполненная по образцу
// завершённого или отменённого заказа. Как и `?client=`, образец живёт в адресе —
// так ссылку можно открыть заново, а кнопка «Назад» ведёт к старому заказу.
export function repeatOrderLink(orderId: string): string {
  return `/orders/new?repeat=${orderId}`
}

// Значение параметра repeat из адреса. Пустая строка и пробелы — «не повтор».
export function repeatOrderFromQuery(value: string | null): string | null {
  const id = (value ?? '').trim()
  return id || null
}

// Экран обратной связи: «Написать разработчику» открывает форму без темы, «Сообщить
// об ошибке» — с уже отмеченной темой. Вид обращения живёт в адресе, как фильтры и
// периоды, поэтому ссылку можно открыть заново, а кнопка «Назад» вернёт в настройки.
export function feedbackLink(topic?: FeedbackTopic): string {
  return topic ? `/feedback?topic=${topic}` : '/feedback'
}

// Значение параметра topic из адреса. Пустое или неизвестное значение — null:
// тогда экран оставляет выбранной тему по умолчанию.
export function feedbackTopicFromQuery(value: string | null): FeedbackTopic | null {
  const normalized = (value ?? '').trim().toLowerCase()
  return (FEEDBACK_TOPICS as string[]).includes(normalized) ? (normalized as FeedbackTopic) : null
}
