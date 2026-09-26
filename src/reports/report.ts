// Данные отчёта: одна сборка чисел для всех выгрузок.
//
// Excel-отчёт (reports/xlsx.ts) — не вторая система расчёта статистики, а её
// продолжение: выручка, себестоимость, прибыль и состав топов считаются теми же
// функциями `utils/stats.ts`, что и на экране статистики (в выручку попадают только
// завершённые заказы), а «оплачено» и «к оплате» — функциями `utils/payments.ts`.
// Поэтому цифры отчёта и цифры экранов не могут разойтись: правила живут в одном месте.
//
// Отменённые заказы не считаются продажами: их нет ни в выручке, ни в списках продаж,
// позиций, клиентов и товаров — как и в статистике. В сводке они видны числом
// (byStatus.cancelled), чтобы расхождение «заказов всего» и «строк в продажах» было
// объяснимым.
import type { Client, Order, OrderStatus } from '../types'
import { formatDate, round2 } from '../utils/format'
import { NO_CLIENT_ID, clientLabel, formatOrderNumber } from '../utils/orders'
import { orderPaid, orderPaymentState } from '../utils/payments'
import {
  filterOrdersByRange,
  groupItemRevenue,
  groupRevenue,
  orderCost,
  orderProfit,
  orderTotal,
  periodRange,
  summarizeOrders,
  type DateRange,
  type OrderSummary,
  type PeriodKey,
} from '../utils/stats'

// Подписи периодов — те же, что на чипах экрана статистики.
export const REPORT_PERIOD_LABEL: Record<PeriodKey, string> = {
  today: 'Сегодня',
  week: '7 дней',
  month: 'Месяц',
  quarter: 'Квартал',
  year: 'Год',
  all: 'Всё время',
  custom: 'Произвольный период',
}

// Выбранный пользователем период отчёта. Границы — ISO-строки (null — без границы),
// чтобы имя файла и лист «Сводка» строились из одних и тех же значений.
export interface ReportPeriod {
  key: PeriodKey
  label: string
  from: string | null
  to: string | null
}

export function reportPeriod(
  period: PeriodKey,
  custom: { from?: string; to?: string } = {},
  now: Date = new Date(),
): ReportPeriod {
  const bounds = periodRange(period, now, custom)
  return {
    key: period,
    label: REPORT_PERIOD_LABEL[period],
    from: bounds.from === null ? null : new Date(bounds.from).toISOString(),
    to: bounds.to === null ? null : new Date(bounds.to).toISOString(),
  }
}

// Границы периода в миллисекундах — по ним отбираются заказы.
export function reportBounds(period: { from: string | null; to: string | null }): DateRange {
  return {
    from: period.from ? new Date(period.from).getTime() : null,
    to: period.to ? new Date(period.to).getTime() : null,
  }
}

// Текст периода без вводного слова: «01.09.2026 — 26.09.2026», «за всё время».
export function rangeText(bounds: DateRange): string {
  const from = bounds.from !== null ? formatDate(new Date(bounds.from).toISOString()) : null
  const to = bounds.to !== null ? formatDate(new Date(bounds.to).toISOString()) : null
  if (from && to) return `${from} — ${to}`
  if (from) return `с ${from}`
  if (to) return `по ${to}`
  return 'за всё время'
}

// Подпись периода на экране статистики и на листе «Сводка».
export function rangeLabel(bounds: DateRange): string {
  return `Период: ${rangeText(bounds)}`
}


// Итоги периода: те же показатели, что на экране статистики, плюс деньги по платежам.
export interface ReportSummary extends OrderSummary {
  // Сколько уже внесено по заказам периода (без отменённых).
  paid: number
  // Осталось к оплате — сумма остатков по тем же заказам.
  due: number
}

// Строка листа «Продажи»: один заказ.
export interface ReportOrderRow {
  date: string
  number: string
  client: string
  status: OrderStatus
  total: number
  paid: number
  due: number
  cost: number
  profit: number
}

// Строка листа «Позиции»: одна позиция заказа.
export interface ReportPositionRow {
  orderDate: string
  orderNumber: string
  client: string
  name: string
  qty: number
  price: number
  // Себестоимость позиции целиком (за единицу × количество) — тогда
  // «Сумма − Себестоимость = Прибыль» сходится построчно.
  cost: number
  total: number
  profit: number
}

// Строка листа «Клиенты».
export interface ReportClientRow {
  client: string
  orders: number
  revenue: number
  average: number
}

// Строка листа «Товары»: товар или услуга.
export interface ReportProductRow {
  name: string
  qty: number
  revenue: number
  cost: number
  profit: number
}

export interface ReportData {
  period: ReportPeriod
  range: DateRange
  // Подпись периода: «01.09.2026 — 26.09.2026».
  periodText: string
  summary: ReportSummary
  orders: ReportOrderRow[]
  positions: ReportPositionRow[]
  clients: ReportClientRow[]
  products: ReportProductRow[]
}

export interface ReportInput {
  orders: Order[]
  clients: Client[]
  period: ReportPeriod
}

// Сборка всех листов отчёта за выбранный период.
export function buildReportData({ orders, clients, period }: ReportInput): ReportData {
  const range = reportBounds(period)
  const inRange = filterOrdersByRange(orders, range)
  const summary = summarizeOrders(inRange)

  const clientsById = new Map(clients.map((client) => [client.id, client]))
  const nameOf = (order: Order): string =>
    clientLabel(order.clientId ? clientsById.get(order.clientId) : undefined, order.clientId)

  // Продажи, позиции и долги считаются по заказам периода, кроме отменённых:
  // отменённый заказ — не продажа и не долг (см. шапку файла).
  const sales = inRange.filter((order) => order.status !== 'cancelled')

  const orderRows: ReportOrderRow[] = sales.map((order) => {
    const state = orderPaymentState(order)
    return {
      date: order.date,
      number: formatOrderNumber(order),
      client: nameOf(order),
      status: order.status,
      total: state.total,
      paid: state.paid,
      due: state.remaining,
      cost: orderCost(order),
      profit: orderProfit(order),
    }
  })

  const positionRows: ReportPositionRow[] = sales.flatMap((order) =>
    order.items.map((item) => {
      const unitCost = typeof item.cost === 'number' && Number.isFinite(item.cost) ? item.cost : 0
      const cost = round2(unitCost * item.qty)
      const total = round2(item.price * item.qty)
      return {
        orderDate: order.date,
        orderNumber: formatOrderNumber(order),
        client: nameOf(order),
        name: item.name,
        qty: item.qty,
        price: item.price,
        cost,
        total,
        profit: round2(total - cost),
      }
    }),
  )

  // Клиенты и товары — те же функции группировки, что и в топах статистики: выручка
  // и счёт считаются по завершённым заказам, поэтому топы и отчёт совпадают.
  const clientRows: ReportClientRow[] = groupRevenue(
    inRange,
    (order) => order.clientId ?? NO_CLIENT_ID,
  ).map((entry) => ({
    client: clientLabel(clientsById.get(entry.key), entry.key),
    orders: entry.qty,
    revenue: entry.total,
    average: entry.qty ? round2(entry.total / entry.qty) : 0,
  }))

  const productRows: ReportProductRow[] = groupItemRevenue(inRange).map((entry) => ({
    name: entry.label,
    qty: entry.qty,
    revenue: entry.total,
    // Прибыль по позициям считается от цены и себестоимости, значит себестоимость —
    // это выручка без прибыли. Отдельного поля для неё в статистике нет и не нужно.
    cost: round2(entry.total - entry.profit),
    profit: entry.profit,
  }))

  const paid = round2(sales.reduce((sum, order) => sum + orderPaid(order), 0))
  const due = round2(sales.reduce((sum, order) => sum + orderPaymentState(order).remaining, 0))

  return {
    period,
    range,
    periodText: rangeText(range),
    summary: { ...summary, paid, due },
    orders: orderRows,
    positions: positionRows,
    clients: clientRows,
    products: productRows,
  }
}

// Подпись отчёта для системного меню «Поделиться» и для сообщения в чате.
export function reportMessage(data: ReportData): string {
  return `Отчёт SelfCRM: ${data.periodText}`
}
