// Оплата заказа: предоплата и последующие платежи.
//
// Отдельного поля «статус оплаты» нет: он вычисляется из двух чисел — суммы
// заказа и суммы платежей. Так не бывает расхождений вида «оплачено, но сумма
// меньше», а история платежей остаётся полной.
import type { Order, Payment } from '../types'
import { round2 } from './format'
import { uid } from './id'
import { orderTotal } from './stats'

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid'

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Не оплачен',
  partial: 'Частично оплачен',
  paid: 'Оплачен',
  overpaid: 'Переплата',
}

export interface PaymentState {
  total: number
  paid: number
  remaining: number
  // Доля оплаты в процентах (0…100) — для полосы состояния.
  percent: number
  status: PaymentStatus
}

// Сколько уже внесено по заказу.
export function orderPaid(order: Order): number {
  return round2((order.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0))
}

// Состояние оплаты по сумме заказа и сумме платежей.
export function paymentState(total: number, paid: number): PaymentState {
  const sum = round2(total)
  const done = round2(paid)
  const remaining = round2(Math.max(sum - done, 0))

  let status: PaymentStatus = 'unpaid'
  if (done > 0) {
    if (sum <= 0) status = 'paid'
    else if (done < sum) status = 'partial'
    else if (done > sum) status = 'overpaid'
    else status = 'paid'
  }

  const percent = sum > 0 ? Math.min(Math.round((done / sum) * 100), 100) : done > 0 ? 100 : 0

  return { total: sum, paid: done, remaining, percent, status }
}

export function orderPaymentState(order: Order): PaymentState {
  return paymentState(orderTotal(order), orderPaid(order))
}

// Остаток к оплате — эту сумму подставляет кнопка «Полностью».
export function remainingToPay(order: Order): number {
  return orderPaymentState(order).remaining
}

// Заказ с остатком к оплате: сам заказ и его состояние платежей. Список «К оплате»
// на главном экране и лист «Сводка» отчёта показывают одни и те же числа.
export interface DueEntry {
  order: Order
  state: PaymentState
}

export interface DueSummary {
  // Общая сумма задолженности по всем заказам.
  total: number
  count: number
  entries: DueEntry[]
}

// Заказы, по которым осталось внести деньги: неоплаченные и частично оплаченные.
//
// Отменённые заказы долгом не считаются: работа по ним не выполняется (в статистике
// они так же не попадают ни в выручку, ни в прибыль). Полностью оплаченные заказы
// выпадают сами — остаток у них ноль, а формула остатка одна на всё приложение
// (`paymentState`).
export function ordersWithDue(orders: Order[]): DueEntry[] {
  return orders
    .filter((order) => order.status !== 'cancelled')
    .map((order) => ({ order, state: orderPaymentState(order) }))
    .filter((entry) => entry.state.remaining > 0)
    // Сначала самые большие долги; при равной сумме — более старые заказы: они
    // ждут оплаты дольше.
    .sort(
      (a, b) =>
        b.state.remaining - a.state.remaining ||
        new Date(a.order.date).getTime() - new Date(b.order.date).getTime(),
    )
}

// Сколько всего должны и сколько это заказов.
export function dueSummary(orders: Order[]): DueSummary {
  const entries = ordersWithDue(orders)
  return {
    total: round2(entries.reduce((sum, entry) => sum + entry.state.remaining, 0)),
    count: entries.length,
    entries,
  }
}

// Возвращает копию заказа с добавленным платежом.
export function addPayment(
  order: Order,
  amount: number,
  comment = '',
  date: string = new Date().toISOString(),
): Order {
  const payment: Payment = {
    id: uid(),
    amount: round2(amount),
    date,
    comment: comment.trim(),
  }
  return { ...order, payments: [...(order.payments ?? []), payment] }
}

// Возвращает копию заказа без указанного платежа.
export function removePayment(order: Order, paymentId: string): Order {
  return { ...order, payments: (order.payments ?? []).filter((payment) => payment.id !== paymentId) }
}
