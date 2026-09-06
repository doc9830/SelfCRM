import type {
  Client,
  DatabaseSnapshot,
  Order,
  OrderItem,
  Product,
  Settings,
} from '../types'
import { emptyContractor } from '../types'
import { round2 } from '../utils/format'
import { uid } from '../utils/id'
import { localStorageStore, type KVStore } from './kvstore'

const STORAGE_KEY = 'selfcrm:data'
const SCHEMA_VERSION = 1

function emptySnapshot(): DatabaseSnapshot {
  return {
    version: SCHEMA_VERSION,
    clients: [],
    products: [],
    orders: [],
    settings: { contractor: emptyContractor() },
  }
}

export class Database {
  private store: KVStore
  private data: DatabaseSnapshot

  constructor(store: KVStore = localStorageStore) {
    this.store = store
    this.data = this.load()
  }

  // ----- загрузка / сохранение -----

  private load(): DatabaseSnapshot {
    const raw = this.store.getItem(STORAGE_KEY)
    if (!raw) return emptySnapshot()
    try {
      const parsed = JSON.parse(raw) as DatabaseSnapshot
      if (!parsed || typeof parsed !== 'object') return emptySnapshot()
      return {
        version: SCHEMA_VERSION,
        clients: Array.isArray(parsed.clients) ? parsed.clients : [],
        products: Array.isArray(parsed.products) ? parsed.products : [],
        orders: Array.isArray(parsed.orders) ? parsed.orders : [],
        settings: parsed.settings ?? { contractor: emptyContractor() },
      }
    } catch {
      return emptySnapshot()
    }
  }

  private persist(): void {
    this.store.setItem(STORAGE_KEY, JSON.stringify(this.data))
  }

  private cloneClient(c: Client): Client {
    return { ...c }
  }

  private cloneProduct(p: Product): Product {
    return { ...p }
  }

  private cloneOrder(o: Order): Order {
    return { ...o, items: o.items.map((it) => ({ ...it })) }
  }

  // ----- клиенты -----

  getClients(): Client[] {
    return this.data.clients.map((c) => this.cloneClient(c)).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }

  getClient(id: string): Client | undefined {
    const found = this.data.clients.find((c) => c.id === id)
    return found ? this.cloneClient(found) : undefined
  }

  saveClient(client: Client): Client {
    const existing = this.data.clients.find((c) => c.id === client.id)
    if (existing) {
      Object.assign(existing, client)
    } else {
      this.data.clients.push(this.cloneClient({ ...client, createdAt: client.createdAt || new Date().toISOString() }))
    }
    this.persist()
    return client
  }

  deleteClient(id: string): void {
    // Каскадно удаляем заказы клиента, чтобы не оставлять «висячих» ссылок.
    const ordersToDelete = this.data.orders.filter((o) => o.clientId === id)
    for (const order of ordersToDelete) {
      this.restoreStock(order)
    }
    this.data.orders = this.data.orders.filter((o) => o.clientId !== id)
    this.data.clients = this.data.clients.filter((c) => c.id !== id)
    this.persist()
  }

  // ----- товары -----

  getProducts(): Product[] {
    return this.data.products.map((p) => this.cloneProduct(p)).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }

  getProduct(id: string): Product | undefined {
    const found = this.data.products.find((p) => p.id === id)
    return found ? this.cloneProduct(found) : undefined
  }

  saveProduct(product: Product): Product {
    const existing = this.data.products.find((p) => p.id === product.id)
    if (existing) {
      Object.assign(existing, product)
    } else {
      this.data.products.push(this.cloneProduct(product))
    }
    this.persist()
    return product
  }

  deleteProduct(id: string): void {
    // Заказы сохраняют «снимок» позиции (название/цена), связь с товаром сбрасываем.
    for (const order of this.data.orders) {
      for (const item of order.items) {
        if (item.productId === id) item.productId = null
      }
    }
    this.data.products = this.data.products.filter((p) => p.id !== id)
    this.persist()
  }

  // ----- заказы -----

  getOrders(): Order[] {
    return this.data.orders
      .map((o) => this.cloneOrder(o))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }

  getOrder(id: string): Order | undefined {
    const found = this.data.orders.find((o) => o.id === id)
    return found ? this.cloneOrder(found) : undefined
  }

  getOrdersByClient(clientId: string): Order[] {
    return this.getOrders().filter((o) => o.clientId === clientId)
  }

  saveOrder(order: Order): Order {
    const existing = this.data.orders.find((o) => o.id === order.id)
    if (existing) {
      // Возвращаем на склад всё, что было зафиксировано в старой версии заказа.
      this.restoreStock(existing)
      Object.assign(existing, this.cloneOrder(order))
    } else {
      this.data.orders.push(this.cloneOrder(order))
    }
    // Списываем со склада то, что зафиксировано в новой версии.
    this.commitStock(order)
    this.persist()
    return order
  }

  deleteOrder(id: string): void {
    const existing = this.data.orders.find((o) => o.id === id)
    if (existing) this.restoreStock(existing)
    this.data.orders = this.data.orders.filter((o) => o.id !== id)
    this.persist()
  }

  // ----- склад (движение товара) -----

  private committedQty(order: Order): Map<string, number> {
    const map = new Map<string, number>()
    if (order.status === 'cancelled') return map
    for (const item of order.items) {
      if (!item.productId) continue
      map.set(item.productId, (map.get(item.productId) ?? 0) + item.qty)
    }
    return map
  }

  private restoreStock(order: Order): void {
    const qty = this.committedQty(order)
    for (const [productId, amount] of qty) {
      const product = this.data.products.find((p) => p.id === productId)
      if (product) product.stock += amount
    }
  }

  private commitStock(order: Order): void {
    const qty = this.committedQty(order)
    for (const [productId, amount] of qty) {
      const product = this.data.products.find((p) => p.id === productId)
      if (product) product.stock -= amount
    }
  }

  // ----- суммы -----

  getOrderTotal(order: Order): number {
    return round2(order.items.reduce((sum, item) => sum + item.price * item.qty, 0))
  }

  // ----- настройки -----

  getSettings(): Settings {
    return {
      ...this.data.settings,
      contractor: { ...emptyContractor(), ...(this.data.settings.contractor ?? {}) },
    }
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.data.settings = { ...this.data.settings, ...patch }
    this.persist()
    return this.getSettings()
  }

  // ----- резервное копирование -----

  exportData(): string {
    return JSON.stringify(this.data, null, 2)
  }

  importData(json: string): void {
    const parsed = JSON.parse(json) as DatabaseSnapshot
    if (!parsed || !Array.isArray(parsed.clients) || !Array.isArray(parsed.orders)) {
      throw new Error('Некорректный файл резервной копии')
    }
    this.data = {
      version: SCHEMA_VERSION,
      clients: parsed.clients ?? [],
      products: parsed.products ?? [],
      orders: parsed.orders ?? [],
      settings: parsed.settings ?? { contractor: emptyContractor() },
    }
    this.persist()
  }

  reset(): void {
    this.data = emptySnapshot()
    this.persist()
  }

  // ----- вспомогательное -----

  createOrderDraft(clientId: string | null = null): Order {
    return {
      id: uid(),
      clientId,
      date: new Date().toISOString(),
      status: 'new',
      items: [],
      comment: '',
    }
  }

  createEmptyItem(): OrderItem {
    return { productId: null, name: '', price: 0, qty: 1 }
  }
}

