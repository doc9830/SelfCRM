// Подписи движений товара для истории склада.
import { STOCK_MOVE_LABEL, type Order, type StockMove } from '../types'

// «+20» / «−3» — со знаком, чтобы приход и расход различались с первого взгляда.
export function formatStockDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta)
}

// Название операции: «Поступление», «Заказ №42», «Корректировка · инвентаризация».
export function stockMoveTitle(move: StockMove): string {
  const label = STOCK_MOVE_LABEL[move.kind]
  const note = (move.note ?? '').trim()
  if (!note) return label
  // Для списаний по заказу причина и есть название («Заказ №42» / «Удаление заказа №42»).
  if (move.kind === 'order' || note === label || note.startsWith(`${label} `)) return note
  return `${label} · ${note}`
}

// Тон записи: приход (зелёный) или расход (красный).
export function stockMoveTone(delta: number): 'in' | 'out' {
  return delta >= 0 ? 'in' : 'out'
}

// Заказ, к которому привязано движение: у списаний по заказу причина — «Заказ №42».
// Связь берём из `orderId` (её пишет сохранение заказа), а у записей из старых резервных
// копий поля нет — тогда заказ находим по номеру в причине. Номера заказов не повторяются,
// поэтому номер из «Удаление заказа №42» не совпадёт с другим заказом: удалённого заказа
// в списке уже нет, и ссылки у такой записи не будет.
export function stockMoveOrder(move: StockMove, orders: Order[]): Order | undefined {
  if (move.kind !== 'order') return undefined
  const byId = move.orderId ? orders.find((order) => order.id === move.orderId) : undefined
  if (byId) return byId

  const number = orderNumberFromNote(move.note)
  return number === null ? undefined : orders.find((order) => order.number === number)
}

// Номер заказа из причины движения: «Заказ №42», «Заказ №42 (отменён)», «Удаление заказа №42».
function orderNumberFromNote(note: string): number | null {
  const match = /№\s*(\d+)/.exec(note ?? '')
  return match ? Number(match[1]) : null
}
