import { describe, expect, it } from 'vitest'
import type { Client, Order, Product } from '../types'
import { Database } from './database'
import { MemoryStore } from './kvstore'
import { checkClientLimit, checkOrderLimit } from './limits'

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

describe('Лимиты бесплатной версии', () => {
  it('ограничивает клиентов', () => {
    expect(checkClientLimit('FREE', 19).ok).toBe(true)
    expect(checkClientLimit('FREE', 20).ok).toBe(false)
    expect(checkClientLimit('FULL', 1000).ok).toBe(true)
  })

  it('ограничивает заказы', () => {
    expect(checkOrderLimit('FREE', 50).ok).toBe(false)
    expect(checkOrderLimit('FREE', 49).ok).toBe(true)
    expect(checkOrderLimit('FULL', 5000).ok).toBe(true)
  })
})
