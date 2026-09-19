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
}

export interface OrderItem {
  productId: string | null
  name: string
  price: number
  qty: number
}

export interface Order {
  id: string
  clientId: string | null
  date: string
  status: OrderStatus
  items: OrderItem[]
  comment: string
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
