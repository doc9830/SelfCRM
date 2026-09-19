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
