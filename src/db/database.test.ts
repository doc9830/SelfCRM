import { describe, expect, it, vi } from 'vitest'
import type { Client, Order, Product } from '../types'
import { Database } from './database'
import { MemoryStore, type KVStore } from './kvstore'

function setup() {
  const store = new MemoryStore()
  const db = new Database(store)
  return { db, store }
}

function makeProduct(partial: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Товар',
    sku: '',
    price: 100,
    stock: 10,
    minStock: 2,
    description: '',
    ...partial,
  }
}

describe('Database: клиенты и товары', () => {
  it('сохраняет и читает клиента', () => {
    const { db } = setup()
    const client: Client = {
      id: 'c1',
      name: 'Иван Петров',
      phone: '',
      email: '',
      comment: '',
      createdAt: new Date().toISOString(),
    }
    db.saveClient(client)
    expect(db.getClients()).toHaveLength(1)
    expect(db.getClient('c1')?.name).toBe('Иван Петров')
  })

  it('каскадно удаляет клиента вместе с его заказами и возвращает остатки', () => {
    const { db } = setup()
    db.saveClient({ id: 'c1', name: 'Иван', phone: '', email: '', comment: '', createdAt: '' })
    db.saveProduct(makeProduct({ id: 'p1', stock: 10 }))
    const order = db.createOrderDraft('c1')
    order.items = [{ productId: 'p1', name: 'Товар', price: 100, qty: 4 }]
    db.saveOrder(order)

    expect(db.getProduct('p1')?.stock).toBe(6)
    db.deleteClient('c1')
    expect(db.getClients()).toHaveLength(0)
    expect(db.getOrders()).toHaveLength(0)
    expect(db.getProduct('p1')?.stock).toBe(10)
  })

  it('удаляет товар и снимает ссылку с позиций заказов, сохраняя снимок', () => {
    const { db } = setup()
    db.saveProduct(makeProduct({ id: 'p1', name: 'Товар', price: 100 }))
    const order = db.createOrderDraft()
    order.items = [{ productId: 'p1', name: 'Товар', price: 100, qty: 2 }]
    db.saveOrder(order)

    db.deleteProduct('p1')

    expect(db.getProducts()).toHaveLength(0)
    const saved = db.getOrder(order.id)
    expect(saved?.items[0].productId).toBeNull()
    expect(saved?.items[0].name).toBe('Товар')
    expect(saved?.items[0].price).toBe(100)
  })
})

describe('Database: заказы и суммы', () => {
  it('считает сумму заказа', () => {
    const { db } = setup()
    const order: Order = {
      id: 'o1',
      clientId: null,
      date: new Date().toISOString(),
      status: 'new',
      items: [
        { productId: null, name: 'A', price: 100, qty: 2 },
        { productId: null, name: 'B', price: 50.5, qty: 3 },
      ],
      comment: '',
    }
    expect(db.getOrderTotal(order)).toBe(351.5)
  })

  it('сортирует заказы по дате (сначала новые)', () => {
    const { db } = setup()
    db.saveOrder(db.createOrderDraft())
    const later = db.createOrderDraft()
    later.date = new Date(Date.now() + 1000).toISOString()
    db.saveOrder(later)
    expect(db.getOrders()[0].id).toBe(later.id)
  })
})

describe('Database: движение склада', () => {
  it('списывает остаток при создании заказа и возвращает при отмене', () => {
    const { db } = setup()
    db.saveProduct(makeProduct({ stock: 10 }))
    const order = db.createOrderDraft()
    order.items = [{ productId: 'p1', name: 'Товар', price: 100, qty: 3 }]
    db.saveOrder(order)
    expect(db.getProduct('p1')?.stock).toBe(7)

    db.saveOrder({ ...order, status: 'cancelled' })
    expect(db.getProduct('p1')?.stock).toBe(10)
  })

  it('корректно пересчитывает остаток при изменении заказа', () => {
    const { db } = setup()
    db.saveProduct(makeProduct({ stock: 10 }))
    const order = db.createOrderDraft()
    order.items = [{ productId: 'p1', name: 'Товар', price: 100, qty: 3 }]
    db.saveOrder(order)
    expect(db.getProduct('p1')?.stock).toBe(7)

    order.items = [{ productId: 'p1', name: 'Товар', price: 100, qty: 1 }]
    db.saveOrder(order)
    expect(db.getProduct('p1')?.stock).toBe(9)
  })

  it('возвращает остаток при удалении заказа', () => {
    const { db } = setup()
    db.saveProduct(makeProduct({ stock: 5 }))
    const order = db.createOrderDraft()
    order.items = [{ productId: 'p1', name: 'Товар', price: 100, qty: 2 }]
    db.saveOrder(order)
    expect(db.getProduct('p1')?.stock).toBe(3)
    db.deleteOrder(order.id)
    expect(db.getProduct('p1')?.stock).toBe(5)
  })
})

describe('Database: резервные копии', () => {
  it('экспортирует и импортирует данные', () => {
    const { db } = setup()
    db.saveClient({ id: 'c1', name: 'Иван', phone: '', email: '', comment: '', createdAt: '' })
    const json = db.exportData()

    const second = new Database(new MemoryStore())
    second.importData(json)
    expect(second.getClients()).toHaveLength(1)
    expect(second.getClient('c1')?.name).toBe('Иван')
  })
})

describe('Database: сохранность данных', () => {
  it('повреждённое значение не затирается, а сохраняется в копию', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new MemoryStore()
    const broken = '{"clients": [{"id": "c1"'
    store.setItem('selfcrm:data', broken)

    const db = new Database(store)

    expect(db.getClients()).toEqual([])
    expect(db.getLoadWarning()).toBeTruthy()

    const copies = db.listCorruptedBackups()
    expect(copies).toHaveLength(1)
    expect(db.readCorruptedBackup(copies[0])).toBe(broken)

    warn.mockRestore()
  })

  it('значение неожиданного формата тоже сохраняется в копию', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new MemoryStore()
    store.setItem('selfcrm:data', '"это не база"')

    const db = new Database(store)

    expect(db.listCorruptedBackups()).toHaveLength(1)
    expect(db.getLoadWarning()).toContain('формат')
    warn.mockRestore()
  })

  it('предупреждение можно скрыть', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new MemoryStore()
    store.setItem('selfcrm:data', '{')

    const db = new Database(store)
    expect(db.getLoadWarning()).toBeTruthy()

    db.clearLoadWarning()
    expect(db.getLoadWarning()).toBeNull()
    warn.mockRestore()
  })

  it('импорт сохраняет копию состояния до замены базы', () => {
    const { db } = setup()
    db.saveClient({ id: 'c1', name: 'Иван', phone: '', email: '', comment: '', createdAt: '' })

    const replacement = new Database(new MemoryStore()).exportData()
    db.importData(replacement)

    expect(db.getClients()).toHaveLength(0)
    expect(db.hasPreImportBackup()).toBe(true)

    const previous = db.readPreImportBackup()
    expect(previous).toBeTruthy()
    const parsed = JSON.parse(previous as string) as { clients: Client[] }
    expect(parsed.clients[0].name).toBe('Иван')
  })

  it('сброс данных тоже сохраняет копию предыдущего состояния', () => {
    const { db } = setup()
    db.saveClient({ id: 'c1', name: 'Иван', phone: '', email: '', comment: '', createdAt: '' })

    db.reset()

    expect(db.getClients()).toHaveLength(0)
    expect(db.readPreImportBackup()).toContain('Иван')
  })

  it('для пустой базы копия перед импортом не создаётся', () => {
    const { db } = setup()
    db.importData(db.exportData())
    expect(db.hasPreImportBackup()).toBe(false)
  })

  it('хранит не более трёх копий предыдущего состояния', () => {
    // Обёртка над MemoryStore, чтобы видеть, какие ключи реально лежат в хранилище.
    const inner = new MemoryStore()
    const keys = new Set<string>()
    const tracking: KVStore = {
      getItem: (key) => inner.getItem(key),
      setItem: (key, value) => {
        keys.add(key)
        inner.setItem(key, value)
      },
      removeItem: (key) => {
        keys.delete(key)
        inner.removeItem(key)
      },
    }

    const db = new Database(tracking)
    db.saveClient({ id: 'c1', name: 'Иван', phone: '', email: '', comment: '', createdAt: '' })

    for (let i = 0; i < 5; i += 1) {
      db.importData(db.exportData())
    }

    const copies = [...keys].filter(
      (key) => key.startsWith('selfcrm:data:pre-import-') && key !== 'selfcrm:data:pre-import-index',
    )
    expect(copies.length).toBeLessThanOrEqual(3)
    expect(db.readPreImportBackup()).toContain('clients')
  })
})

describe('Database: услуги', () => {
  it('услуга не изменяет остаток ни при оформлении, ни при отмене заказа', () => {
    const { db } = setup()
    db.saveProduct(
      makeProduct({ id: 's1', name: 'Выезд мастера', price: 1500, stock: 0, minStock: 0, kind: 'service' }),
    )
    expect(db.getProduct('s1')?.kind).toBe('service')

    const order = db.createOrderDraft()
    order.items = [{ productId: 's1', name: 'Выезд мастера', price: 1500, qty: 2 }]
    db.saveOrder(order)
    expect(db.getProduct('s1')?.stock).toBe(0)

    db.saveOrder({ ...order, status: 'cancelled' })
    expect(db.getProduct('s1')?.stock).toBe(0)

    db.deleteOrder(order.id)
    expect(db.getProduct('s1')?.stock).toBe(0)
  })

  it('в заказе с товаром и услугой склад меняется только по товару', () => {
    const { db } = setup()
    db.saveProduct(makeProduct({ id: 'p1', stock: 10 }))
    db.saveProduct(
      makeProduct({ id: 's1', name: 'Услуга', price: 500, stock: 0, minStock: 0, kind: 'service' }),
    )

    const order = db.createOrderDraft()
    order.items = [
      { productId: 'p1', name: 'Товар', price: 100, qty: 4 },
      { productId: 's1', name: 'Услуга', price: 500, qty: 1 },
    ]
    db.saveOrder(order)

    expect(db.getProduct('p1')?.stock).toBe(6)
    expect(db.getProduct('s1')?.stock).toBe(0)
  })
})

