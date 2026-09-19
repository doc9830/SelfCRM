// Подписи движений товара для истории склада.
import { STOCK_MOVE_LABEL, type StockMove } from '../types'

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
