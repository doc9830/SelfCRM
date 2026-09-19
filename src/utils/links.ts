// Адреса экранов и разбор их параметров. Плашки на главном экране ведут на
// конкретный список заказов и на раздел статистики, поэтому параметры адреса —
// часть контракта экранов, а не разовая договорённость.
import { ORDER_STATUSES, isActiveStatus, type Order, type OrderStatus } from '../types'
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
