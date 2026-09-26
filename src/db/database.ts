import type {
  BulkStockMoveKind,
  Client,
  DatabaseSnapshot,
  ManualStockMoveKind,
  Order,
  OrderItem,
  Product,
  Reminder,
  ReminderKind,
  Settings,
  StockMove,
  StockMoveKind,
} from '../types'
import { STOCK_MOVE_LABEL, emptyContractor, isService } from '../types'
import { round2 } from '../utils/format'
import { uid } from '../utils/id'
import { assignMissingNumbers, formatOrderNumber, nextOrderNumber, orderTitle } from '../utils/orders'
import {
  reminderHintText,
  sortOrderReminders,
  sortReminders,
  type ReminderEntry,
} from '../utils/reminders'
import { localStorageStore, type KVStore } from './kvstore'
import { parseBackupJson } from './backupText'

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
    stockMoves: [],
    settings: { contractor: emptyContractor() },
  }
}

// Разбор текста резервной копии. Копия приходит файлом или из облака, а значит по пути
// могла получить BOM и мусор по краям (см. db/backupText.ts); сообщение об ошибке должно
// объяснять причину — техническое «Unexpected token» пользователю ничего не говорит.
function parseSnapshot(json: string): DatabaseSnapshot {
  const value = parseBackupJson(json)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Некорректный файл резервной копии')
  }
  return value as DatabaseSnapshot
}

export class Database {
  private store: KVStore
  private data: DatabaseSnapshot
  // Предупреждение о проблемах при чтении базы (например, повреждённый localStorage).
  private loadWarning: string | null = null

  constructor(store: KVStore = localStorageStore) {
    this.store = store
    this.data = this.load()
    this.migrate()
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
      stockMoves: Array.isArray(parsed.stockMoves) ? parsed.stockMoves : [],
      settings: parsed.settings ?? { contractor: emptyContractor() },
    }
  }

  // ----- миграция старых данных -----

  // Данные, созданные до появления нумерации заказов, себестоимости и оплат,
  // достраиваются один раз при загрузке — дальше это обычные поля базы.
  private migrate(): void {
    let changed = assignMissingNumbers(this.data.orders)

    for (const order of this.data.orders) {
      if (!Array.isArray(order.payments)) {
        order.payments = []
        changed = true
      }
      // До появления напоминаний поля в заказе не было — считаем список пустым.
      if (!Array.isArray(order.reminders)) {
        order.reminders = []
        changed = true
      }
      for (const item of order.items) {
        if (typeof item.cost === 'number' && Number.isFinite(item.cost)) continue
        // Снимок себестоимости из каталога: до появления поля её негде было взять.
        const product = item.productId
          ? this.data.products.find((p) => p.id === item.productId)
          : undefined
        item.cost = typeof product?.cost === 'number' && Number.isFinite(product.cost) ? product.cost : 0
        changed = true
      }
    }

    if (changed) this.persist()
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
    return {
      ...o,
      items: o.items.map((it) => ({ ...it })),
      payments: (o.payments ?? []).map((payment) => ({ ...payment })),
      reminders: (o.reminders ?? []).map((reminder) => ({ ...reminder })),
    }
  }

  // ----- клиенты -----

  /**
   * Клиенты по алфавиту. По умолчанию архив скрыт: он показывается отдельной вкладкой,
   * а архивный клиент нельзя выбрать при оформлении нового заказа.
   */
  getClients(includeArchived = false): Client[] {
    return this.data.clients
      .filter((c) => includeArchived || !c.archived)
      .map((c) => this.cloneClient(c))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }

  /** Клиенты в архиве: заказы и история склада остаются в базе, клиент скрыт из списков. */
  getArchivedClients(): Client[] {
    return this.getClients(true).filter((c) => c.archived)
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

  // Архив вместо удаления: заказы, выручка и история склада остаются на месте,
  // клиент просто исчезает из списков и из выбора при оформлении заказа.
  archiveClient(id: string): void {
    const client = this.data.clients.find((c) => c.id === id)
    if (!client) return
    client.archived = true
    client.archivedAt = new Date().toISOString()
    this.persist()
  }

  // Возврат из архива: клиент снова доступен в списках и при создании заказа.
  restoreClient(id: string): void {
    const client = this.data.clients.find((c) => c.id === id)
    if (!client) return
    delete client.archived
    delete client.archivedAt
    this.persist()
  }

  // Окончательное удаление — доступно из архива: каскадно удаляем заказы клиента,
  // чтобы не оставлять «висячих» ссылок, и возвращаем товары на склад.
  deleteClient(id: string): void {
    for (const order of this.data.orders.filter((o) => o.clientId === id)) {
      this.applyOrderStock(order, null, this.orderRemovalNote(order))
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
    // История движения нужна только вместе с товаром — удаляем её вместе с ним.
    this.data.stockMoves = (this.data.stockMoves ?? []).filter((move) => move.productId !== id)
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
    const saved = this.cloneOrder(order)
    // Номер заказа присваивается при создании; если его почему-то нет — выдаём сейчас.
    if (typeof saved.number !== 'number' || !Number.isFinite(saved.number)) {
      saved.number = nextOrderNumber(this.data.orders.filter((o) => o.id !== order.id))
    }

    const cancelled = saved.status === 'cancelled' && existing?.status !== 'cancelled'
    const note = cancelled ? `${orderTitle(saved)} (отменён)` : orderTitle(saved)

    if (existing) {
      // Остаток пересчитывается по разнице версий заказа и одной записью в истории,
      // а не двумя («вернули старое» + «списали новое»).
      this.applyOrderStock(existing, saved, note, saved.id)
      Object.assign(existing, saved)
    } else {
      this.data.orders.push(saved)
      this.applyOrderStock(null, saved, note, saved.id)
    }
    this.persist()
    return order
  }

  deleteOrder(id: string): void {
    const existing = this.data.orders.find((o) => o.id === id)
    // У удаления заказа связи нет: сам заказ в базе не остаётся, и вести ссылку некуда,
    // поэтому в истории склада причина «Удаление заказа №42» остаётся обычным текстом.
    if (existing) this.applyOrderStock(existing, null, this.orderRemovalNote(existing))
    this.data.orders = this.data.orders.filter((o) => o.id !== id)
    this.persist()
  }

  // ----- напоминания по заказам -----

  /** Напоминания заказа: активные сверху по сроку, выполненные — ниже как история. */
  getOrderReminders(orderId: string): Reminder[] {
    const order = this.data.orders.find((o) => o.id === orderId)
    return sortOrderReminders((order?.reminders ?? []).map((reminder) => ({ ...reminder })))
  }

  /**
   * Активные напоминания по всем заказам вместе с самими заказами, ближайшие сверху:
   * из этого списка главный экран собирает свои группы. Отменённые заказы пропускаем —
   * по ним уже ничего не нужно делать.
   */
  getReminders(): ReminderEntry[] {
    return sortReminders(
      this.data.orders
        .filter((order) => order.status !== 'cancelled')
        .flatMap((order) =>
          (order.reminders ?? [])
            .filter((reminder) => !reminder.done)
            .map((reminder) => ({ order: this.cloneOrder(order), reminder: { ...reminder } })),
        ),
    )
  }

  /**
   * Добавляет напоминание к заказу. Пустой текст заменяется подсказкой по виду —
   * кроме «Другого», где текст вводит пользователь (проверяется в окне создания).
   * Возвращает null, если заказ не найден.
   */
  addReminder(orderId: string, input: { kind: ReminderKind; text: string; dueAt: string }): Reminder | null {
    const order = this.data.orders.find((o) => o.id === orderId)
    if (!order) return null

    if (!Array.isArray(order.reminders)) order.reminders = []
    const reminder: Reminder = {
      id: uid(),
      kind: input.kind,
      text: input.text.trim() || reminderHintText(input.kind),
      dueAt: input.dueAt,
      createdAt: new Date().toISOString(),
    }
    order.reminders.push(reminder)
    this.persist()
    return { ...reminder }
  }

  /** Отмечает напоминание выполненным и обратно (тап по чекбоксу). */
  toggleReminder(orderId: string, reminderId: string): void {
    const reminder = this.findReminder(orderId, reminderId)
    if (!reminder) return

    if (reminder.done) {
      reminder.done = false
      delete reminder.doneAt
    } else {
      reminder.done = true
      reminder.doneAt = new Date().toISOString()
    }
    this.persist()
  }

  deleteReminder(orderId: string, reminderId: string): void {
    const order = this.data.orders.find((o) => o.id === orderId)
    if (!order || !Array.isArray(order.reminders)) return
    order.reminders = order.reminders.filter((reminder) => reminder.id !== reminderId)
    this.persist()
  }

  private findReminder(orderId: string, reminderId: string): Reminder | undefined {
    return this.data.orders
      .find((order) => order.id === orderId)
      ?.reminders?.find((reminder) => reminder.id === reminderId)
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

  private orderRemovalNote(order: Order): string {
    const number = formatOrderNumber(order)
    return number ? `Удаление заказа ${number}` : 'Удаление заказа'
  }

  // Изменение остатка с записью в историю товара. Услуги на складе не учитываются.
  // `orderId` — заказ, к которому привязано движение: по нему история склада открывает
  // сам заказ (ссылка на «Заказ №42»).
  private applyStockDelta(
    productId: string,
    delta: number,
    kind: StockMoveKind,
    note: string,
    orderId?: string,
  ): void {
    if (!delta) return
    const product = this.data.products.find((p) => p.id === productId)
    if (!product || isService(product)) return

    product.stock += delta
    if (!Array.isArray(this.data.stockMoves)) this.data.stockMoves = []
    this.data.stockMoves.push({
      id: uid(),
      productId,
      date: new Date().toISOString(),
      delta,
      kind,
      note,
      stockAfter: product.stock,
      // У ручных операций заказа нет — поле остаётся пустым и в файл не попадает.
      orderId,
    })
  }

  // Остаток меняется на разницу между «до» и «после»: при редактировании заказа
  // в историю попадает одно движение, а не возврат и повторное списание.
  private applyOrderStock(
    previous: Order | null,
    next: Order | null,
    note: string,
    orderId?: string,
  ): void {
    const before = previous ? this.committedQty(previous) : new Map<string, number>()
    const after = next ? this.committedQty(next) : new Map<string, number>()
    const productIds = new Set([...before.keys(), ...after.keys()])
    for (const productId of productIds) {
      const delta = (before.get(productId) ?? 0) - (after.get(productId) ?? 0)
      this.applyStockDelta(productId, delta, 'order', note, orderId)
    }
  }

  // ----- история движения товара -----

  /** Движения товара, новые сверху. Без `productId` — история по всем товарам. */
  getStockMoves(productId?: string): StockMove[] {
    return (this.data.stockMoves ?? [])
      .map((move, index) => ({ move, index }))
      .filter(({ move }) => !productId || move.productId === productId)
      // Движения одной операции могут совпасть по времени: тогда порядок задаёт
      // номер записи, поэтому последнее движение всегда оказывается первым.
      .sort(
        (a, b) =>
          new Date(b.move.date).getTime() - new Date(a.move.date).getTime() || b.index - a.index,
      )
      .map(({ move }) => ({ ...move }))
  }

  /**
   * Ручное движение: «Поступление» и «Расход» — количество, «Корректировка» — новый остаток.
   * Возвращает false, если позиция не найдена, является услугой или остаток не изменился.
   */
  applyStockMove(input: {
    productId: string
    kind: ManualStockMoveKind
    value: number
    comment?: string
  }): boolean {
    const product = this.data.products.find((p) => p.id === input.productId)
    if (!product || isService(product)) return false

    const value = Math.round(input.value)
    const delta =
      input.kind === 'adjustment' ? value - product.stock : input.kind === 'in' ? value : -value
    if (!delta) return false

    this.applyStockDelta(
      product.id,
      delta,
      input.kind,
      (input.comment ?? '').trim() || STOCK_MOVE_LABEL[input.kind],
    )
    this.persist()
    return true
  }

  /**
   * Массовое движение: приход или списание сразу по нескольким позициям одной причиной.
   * Причина одна на всю операцию — она попадает в историю каждой позиции («Поступление ·
   * По накладной №128»), поэтому по складу видно, откуда взялись числа.
   *
   * Услуги, неизвестные позиции и нулевые количества пропускаются: они не создают движений.
   * Возвращает число позиций, у которых остаток изменился (0 — менять нечего).
   */
  applyBulkStockMove(input: {
    kind: BulkStockMoveKind
    items: Array<{ productId: string; value: number }>
    comment?: string
  }): number {
    const note = (input.comment ?? '').trim() || STOCK_MOVE_LABEL[input.kind]
    let applied = 0

    for (const item of input.items) {
      const product = this.data.products.find((p) => p.id === item.productId)
      if (!product || isService(product)) continue

      const value = Math.round(item.value)
      if (!value) continue

      this.applyStockDelta(product.id, input.kind === 'in' ? value : -value, input.kind, note)
      applied += 1
    }

    // Запись в хранилище одна на всю операцию — как при сохранении заказа, где движений
    // тоже может быть много: положение на диске меняется один раз.
    if (applied) this.persist()
    return applied
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
    const parsed = parseSnapshot(json)
    if (!Array.isArray(parsed.clients) || !Array.isArray(parsed.orders)) {
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
      stockMoves: Array.isArray(parsed.stockMoves) ? parsed.stockMoves : [],
      settings: parsed.settings ?? { contractor: emptyContractor() },
    }
    // Копия могла быть сделана старой версией: достраиваем номера и себестоимость.
    this.migrate()
    this.persist()
  }

  reset(): void {
    this.savePreImportCopy()
    this.data = emptySnapshot()
    this.persist()
  }

  // ----- вспомогательное -----

  createOrderDraft(clientId: string | null = null): Order {
    return {
      id: uid(),
      number: nextOrderNumber(this.data.orders),
      clientId,
      date: new Date().toISOString(),
      status: 'new',
      items: [],
      payments: [],
      reminders: [],
      comment: '',
    }
  }

  /**
   * Черновик нового заказа по образцу старого — основа кнопки «Повторить заказ».
   * Переносится только сделка: тот же клиент и те же позиции со снимком цен,
   * количеств и себестоимости на момент старого заказа. Номер выдаётся новый,
   * дата — текущая, статус — «Новый», комментарий пустой.
   *
   * Данные прошлой сделки не переносятся: оплаты и статус оплаты, напоминания,
   * статус, история склада и чек относятся к тому заказу. Прежний заказ не меняется —
   * функция только читает его. Остатки склада списываются при сохранении нового
   * заказа, как у любого заказа, созданного вручную (`saveOrder`).
   */
  createRepeatDraft(source: Order): Order {
    return {
      ...this.createOrderDraft(source.clientId),
      items: source.items.map((item) => ({ ...item })),
    }
  }

  createEmptyItem(product?: Product): OrderItem {
    return {
      productId: product?.id ?? null,
      name: product?.name ?? '',
      price: product?.price ?? 0,
      // Снимок себестоимости: по нему считается прибыль по заказу.
      cost: product?.cost ?? 0,
      qty: 1,
    }
  }
}

