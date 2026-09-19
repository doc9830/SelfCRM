// Номера заказов и подписи к ним.
//
// Нумерация сквозная: первый заказ — №1, дальше по порядку создания. Номер
// присваивается в `Database.createOrderDraft()` и больше не меняется — даже если
// пользователь поправит дату заказа. По номеру заказ находят в чеке, в переписке
// с клиентом и в истории склада («Заказ №42»).
import type { Order } from '../types'
import { formatDate } from './format'

function hasNumber(order: Order): boolean {
  return typeof order.number === 'number' && Number.isFinite(order.number)
}

// Следующий свободный номер: максимальный из существующих плюс один.
export function nextOrderNumber(orders: Order[]): number {
  let max = 0
  for (const order of orders) {
    if (hasNumber(order) && (order.number as number) > max) max = order.number as number
  }
  return max + 1
}

// Присваивает номера заказам, созданным до появления нумерации: они получают
// номера по возрастанию даты, чтобы история читалась в том порядке, в котором была.
// Функция изменяет переданные объекты и сообщает, изменились ли данные.
export function assignMissingNumbers(orders: Order[]): boolean {
  const missing = orders
    .filter((order) => !hasNumber(order))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  if (missing.length === 0) return false

  let next = nextOrderNumber(orders)
  for (const order of missing) order.number = next++
  return true
}

// «№42» или пустая строка, если номер ещё не присвоен.
export function formatOrderNumber(order: Order): string {
  return hasNumber(order) ? `№${order.number}` : ''
}

// «Заказ №42» — подпись заказа в списках и в истории склада.
export function orderTitle(order: Order): string {
  const number = formatOrderNumber(order)
  return number ? `Заказ ${number}` : 'Заказ'
}

// «Заказ №42 от 19.09.2026» — шапка карточки заказа и PDF-чека.
export function orderHeading(order: Order): string {
  return `${orderTitle(order)} от ${formatDate(order.date)}`
}
