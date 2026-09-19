import type {
  Client,
  DatabaseSnapshot,
  Order,
  OrderItem,
  Product,
  Settings,
} from '../types'
import { emptyContractor, isService } from '../types'
import { round2 } from '../utils/format'
import { uid } from '../utils/id'
import { localStorageStore, type KVStore } from './kvstore'

const STORAGE_KEY = 'selfcrm:data'
const SCHEMA_VERSION = 1

// Копии, которые сохраняются рядом с базой:
//   corrupt-*    — нечитаемые данные (испорченный localStorage), чтобы их можно было выгрузить;
//   pre-import-* — состояние базы перед последним импортом резервной копии.
const CORRUPT_KEY_PREFIX = 'selfcrm:data:corrupt-'
const CORRUPT_INDEX_KEY = 'selfcrm:data:corrupt-index'
const PRE_IMPORT_KEY_PREFIX = 'selfcrm:data:pre-import-'
const PRE_IMPORT_INDEX_KEY = 'selfcrm:data:pre-import-index'
const MAX_CORRUPT_COPIES = 5
const MAX_PRE_IMPORT_COPIES = 3

function backupStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

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
  // Предупреждение о проблемах при чтении базы (например, повреждённый localStorage).
  private loadWarning: string | null = null

  constructor(store: KVStore = localStorageStore) {
    this.store = store
    this.data = this.load()
  }

  // ----- загрузка / сохранение -----

  private load(): DatabaseSnapshot {
    const raw = this.store.getItem(STORAGE_KEY)
    if (!raw) return emptySnapshot()

    let parsed: DatabaseSnapshot | null = null
    try {
      parsed = JSON.parse(raw) as DatabaseSnapshot
    } catch {
      this.quarantineCorrupted(raw, 'файл данных не читается')
      return emptySnapshot()
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.quarantineCorrupted(raw, 'неизвестный формат данных')
      return emptySnapshot()
    }

    return {
      version: SCHEMA_VERSION,
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      products: Array.isArray(parsed.products) ? parsed.products : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      settings: parsed.settings ?? { contractor: emptyContractor() },
    }
  }

  private persist(): void {
    this.store.setItem(STORAGE_KEY, JSON.stringify(this.data))
  }

  // ----- сохранность данных -----

  // Испорченное значение не затираем: сохраняем его под отдельным ключом,
  // чтобы пользователь мог скачать файл и восстановить данные вручную.
  private quarantineCorrupted(raw: string, reason: string): void {
    const key = `${CORRUPT_KEY_PREFIX}${backupStamp()}`
    let saved = false
    try {
      this.store.setItem(key, raw)
      this.rememberBackupKey(CORRUPT_INDEX_KEY, key, MAX_CORRUPT_COPIES)
      saved = true
    } catch {
      saved = false
    }

    if (saved) {
      // Копия сохранена, поэтому исходный ключ освобождаем: иначе при следующем
      // запуске тех же данных появилась бы ещё одна копия.
      try {
        this.store.removeItem(STORAGE_KEY)
      } catch {
        // Ничего страшного: основное значение будет перезаписано при первом сохранении.
      }
    }

    this.loadWarning =
      `Данные не загружены: ${reason}. ` +
      (saved
        ? 'Исходный файл сохранён — его можно скачать в разделе «Резервная копия».'
        : 'Сохранить копию не удалось. Если есть резервная копия в файле — восстановите данные из неё.')
    console.warn(`SelfCRM: ${reason}; копия данных: ${saved ? key : 'не сохранена'}`)
  }

  // Запоминает ключ новой копии в индексе (от новых к старым) и удаляет лишние.
  private rememberBackupKey(indexKey: string, key: string, limit: number): void {
    const previous = this.readBackupKeys(indexKey)
    const keys = [key, ...previous.filter((item) => item !== key)].slice(0, limit)
    const dropped = previous.filter((item) => !keys.includes(item))

    this.store.setItem(indexKey, JSON.stringify(keys))
    for (const old of dropped) {
      try {
        this.store.removeItem(old)
      } catch {
        // Не критично: старая копия просто останется в хранилище.
      }
    }
  }

  private readBackupKeys(indexKey: string): string[] {
    const raw = this.store.getItem(indexKey)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : []
    } catch {
      return []
    }
  }

  // Копия текущих данных перед импортом: импорт полностью заменяет базу, и без копии
  // ошибка в файле означала бы потерю всех данных.
  private savePreImportCopy(): void {
    const isEmpty =
      this.data.clients.length === 0 && this.data.products.length === 0 && this.data.orders.length === 0
    if (isEmpty) return

    const key = `${PRE_IMPORT_KEY_PREFIX}${backupStamp()}`
    try {
      this.store.setItem(key, JSON.stringify(this.data))
      this.rememberBackupKey(PRE_IMPORT_INDEX_KEY, key, MAX_PRE_IMPORT_COPIES)
    } catch {
      // Нет места в хранилище — импорт всё равно выполняем.
    }
  }

  /** Предупреждение о проблемах при чтении базы данных или null, если всё в порядке. */
  getLoadWarning(): string | null {
    return this.loadWarning
  }

  /** Скрывает предупреждение (пользователь его прочитал). */
  clearLoadWarning(): void {
    this.loadWarning = null
  }

  /** Ключи сохранённых копий нечитаемых данных (от новых к старым). */
  listCorruptedBackups(): string[] {
    return this.readBackupKeys(CORRUPT_INDEX_KEY)
  }

  /** Сырое содержимое сохранённой копии нечитаемых данных. */
  readCorruptedBackup(key: string): string | null {
    return this.listCorruptedBackups().includes(key) ? this.store.getItem(key) : null
  }

  /** Есть ли копия данных, сделанная перед последним импортом. */
  hasPreImportBackup(): boolean {
    return this.readBackupKeys(PRE_IMPORT_INDEX_KEY).length > 0
  }

  /** JSON данных до последнего импорта — можно сохранить в файл и восстановить прежнее состояние. */
  readPreImportBackup(): string | null {
    const [key] = this.readBackupKeys(PRE_IMPORT_INDEX_KEY)
    return key ? this.store.getItem(key) : null
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
      if (product && !isService(product)) product.stock += amount
    }
  }

  private commitStock(order: Order): void {
    const qty = this.committedQty(order)
    for (const [productId, amount] of qty) {
      const product = this.data.products.find((p) => p.id === productId)
      if (product && !isService(product)) product.stock -= amount
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
    // Импорт полностью заменяет базу, поэтому сначала сохраняем текущее состояние:
    // его можно скачать и вернуть всё назад.
    this.savePreImportCopy()
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
    this.savePreImportCopy()
    this.data = emptySnapshot()
    this.persist()
  }

  // ----- вспомогательное -----

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

