export type OrderStatus = 'new' | 'in_progress' | 'done' | 'cancelled'

export interface Client {
  id: string
  name: string
  phone: string
  email: string
  comment: string
  address?: string
  cadastralNumber?: string
  latitude?: number
  longitude?: number
  createdAt: string
  // Клиент в архиве: скрыт из списка и из выбора при оформлении заказа, но его
  // заказы, суммы и история склада сохраняются. Поле опционально для совместимости
  // с данными, созданными до его появления.
  archived?: boolean
  // Дата отправки в архив — показывается в карточке архивного клиента.
  archivedAt?: string
}

export type ProductKind = 'product' | 'service'

export interface Product {
  id: string
  name: string
  sku: string
  price: number
  stock: number
  minStock: number
  description: string
  // Тип позиции: товар учитывается на складе, услуга — нет.
  // Поле опционально для совместимости с данными, созданными до его появления.
  kind?: ProductKind
  // Себестоимость единицы (закупочная цена). Нужна для расчёта прибыли.
  // Поле опционально для совместимости с данными, созданными до его появления.
  cost?: number
}

export interface OrderItem {
  productId: string | null
  name: string
  price: number
  qty: number
  // Себестоимость единицы на момент оформления заказа — снимок, как и цена:
  // изменение цены закупки в каталоге не переписывает историю.
  cost?: number
}

// Оплата по заказу: предоплата и последующие платежи.
export interface Payment {
  id: string
  amount: number
  date: string
  comment: string
}

// Вид напоминания: от него зависит подсказка текста и иконка.
export type ReminderKind = 'call' | 'payment' | 'product' | 'other'

export const REMINDER_KINDS: ReminderKind[] = ['call', 'payment', 'product', 'other']

// Напоминание живёт внутри заказа, а главный экран просто собирает ближайшие
// напоминания из всех заказов: отдельной сущности, которую нужно где-то искать, нет.
export interface Reminder {
  id: string
  kind: ReminderKind
  // Текст напоминания. Для вида «Другое» его вводит пользователь, для остальных
  // видов подставляется подсказка по умолчанию — её тоже можно изменить.
  text: string
  // Когда напомнить (ISO). Момент в прошлом — просроченное напоминание.
  dueAt: string
  createdAt: string
  // Выполненное напоминание остаётся в карточке заказа, но уходит из активных.
  done?: boolean
  doneAt?: string
}

export interface Order {
  id: string
  // Сквозной номер заказа. Присваивается при создании и не меняется.
  // Поле опционально для совместимости со старыми данными (номер присвоит миграция).
  number?: number
  clientId: string | null
  date: string
  status: OrderStatus
  items: OrderItem[]
  // Список платежей по заказу; сумма платежей — «оплачено».
  payments?: Payment[]
  // Напоминания по заказу. Поле опционально для совместимости со старыми данными
  // (пустой список достроит миграция).
  reminders?: Reminder[]
  comment: string
}

// Движение товара по складу: поступление, расход, корректировка и списание по заказу.
export type StockMoveKind = 'in' | 'out' | 'order' | 'adjustment'

// Ручные операции склада: движение «Заказ» создаётся само при оформлении заказа.
export type ManualStockMoveKind = Exclude<StockMoveKind, 'order'>

export const MANUAL_STOCK_MOVE_KINDS: ManualStockMoveKind[] = ['in', 'out', 'adjustment']

// Массовая операция: приход или списание сразу по нескольким позициям одной причиной.
// Корректировка в массовых не участвует — она всегда про одну позицию и её текущий остаток.
export type BulkStockMoveKind = Extract<ManualStockMoveKind, 'in' | 'out'>

// Подписи массовых операций: на экране склада это «Приход» и «Списание», а в истории
// позиции то же движение называется по виду («Поступление», «Расход») — см. STOCK_MOVE_LABEL.
export const BULK_STOCK_MOVE_LABEL: Record<BulkStockMoveKind, string> = {
  in: 'Приход',
  out: 'Списание',
}

export const STOCK_MOVE_LABEL: Record<StockMoveKind, string> = {
  in: 'Поступление',
  out: 'Расход',
  adjustment: 'Корректировка',
  order: 'Заказ',
}

export interface StockMove {
  id: string
  productId: string
  date: string
  // Изменение остатка: «+» — приход или возврат, «−» — расход или продажа.
  delta: number
  kind: StockMoveKind
  // Причина движения: «Заказ №42», комментарий пользователя или название операции.
  note: string
  // Остаток после операции — по нему видно, из чего сложилось текущее число.
  stockAfter: number
  // Заказ, к которому привязано движение (списание по заказу): по нему история склада
  // открывает сам заказ. В записях старых резервных копий поля нет — тогда заказ
  // находится по номеру в причине (см. `stockMoveOrder` в utils/stock.ts).
  orderId?: string
}

export interface Contractor {
  name: string
  inn: string
  ogrn: string
  kpp: string
  phone: string
  email: string
  address: string
}

export function emptyContractor(): Contractor {
  return { name: '', inn: '', ogrn: '', kpp: '', phone: '', email: '', address: '' }
}

export interface Settings {
  contractor?: Contractor
}

export interface DatabaseSnapshot {
  version: number
  clients: Client[]
  products: Product[]
  orders: Order[]
  // История движения товара. В старых резервных копиях поля нет — считается пустой.
  stockMoves?: StockMove[]
  settings: Settings
}

export const ORDER_STATUSES: OrderStatus[] = ['new', 'in_progress', 'done', 'cancelled']

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  done: 'Завершён',
  cancelled: 'Отменён',
}

export function isActiveStatus(status: OrderStatus): boolean {
  return status === 'new' || status === 'in_progress'
}

// Услуга не списывается со склада: она всегда доступна в заказе.
export function isService(product: Product): boolean {
  return product.kind === 'service'
}
