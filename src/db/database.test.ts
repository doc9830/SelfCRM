import { describe, expect, it, vi } from 'vitest'
import type { Client, Order, Product } from '../types'
import { addPayment, orderPaid } from '../utils/payments'
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

describe('Database: номера заказов, себестоимость и оплаты', () => {
  it('присваивает номер новому заказу и не меняет его при редактировании', () => {
    const { db } = setup()
    const first = db.createOrderDraft()
    expect(first.number).toBe(1)
    db.saveOrder(first)

    const second = db.createOrderDraft()
    expect(second.number).toBe(2)
    db.saveOrder(second)
    expect(db.createOrderDraft().number).toBe(3)

    // Правка даты не перенумеровывает заказ: номер закреплён за заказом.
    first.date = new Date(Date.now() + 5000).toISOString()
    db.saveOrder(first)
    expect(db.getOrder(first.id)?.number).toBe(1)
  })

  it('достраивает номера, себестоимость и оплаты в старой базе', () => {
    const store = new MemoryStore()
    store.setItem(
      'selfcrm:data',
      JSON.stringify({
        version: 1,
        clients: [],
        products: [
          {
            id: 'p1',
            name: 'Товар',
            sku: '',
            price: 100,
            stock: 10,
            minStock: 1,
            description: '',
            cost: 40,
          },
        ],
        orders: [
          {
            id: 'o2',
            clientId: null,
            date: new Date(2026, 8, 15).toISOString(),
            status: 'done',
            items: [{ productId: 'p1', name: 'Товар', price: 100, qty: 2 }],
            comment: '',
          },
          {
            id: 'o1',
            clientId: null,
            date: new Date(2026, 8, 10).toISOString(),
            status: 'done',
            items: [{ productId: 'p1', name: 'Товар', price: 100, qty: 1 }],
            comment: '',
          },
        ],
        settings: {},
      }),
    )

    const db = new Database(store)

    // Номера выдаются по возрастанию даты, следующий заказ продолжает нумерацию.
    expect(db.getOrder('o1')?.number).toBe(1)
    expect(db.getOrder('o2')?.number).toBe(2)
    expect(db.createOrderDraft().number).toBe(3)
    // Снимок себестоимости берётся из каталога, платежи появляются пустым списком.
    expect(db.getOrder('o1')?.items[0].cost).toBe(40)
    expect(db.getOrder('o1')?.payments).toEqual([])
  })

  it('хранит платежи по заказу', () => {
    const { db } = setup()
    db.saveProduct(makeProduct({ stock: 10 }))
    const order = db.createOrderDraft()
    order.items = [{ productId: 'p1', name: 'Товар', price: 100, qty: 2 }]
    db.saveOrder(order)

    db.saveOrder(addPayment(order, 100, 'Предоплата'))
    db.saveOrder(addPayment(db.getOrder(order.id) as Order, 100, 'Доплата'))

    const saved = db.getOrder(order.id) as Order
    expect(orderPaid(saved)).toBe(200)
    expect(saved.payments).toHaveLength(2)
    // Оплата не влияет на склад: списание по заказу остаётся единственным.
    expect(db.getProduct('p1')?.stock).toBe(8)
    expect(db.getStockMoves('p1')).toHaveLength(1)
  })
})

describe('Database: история движения товара', () => {
  it('записывает списание по заказу с его номером', () => {
    const { db } = setup()
    db.saveProduct(makeProduct({ stock: 10 }))
    const order = db.createOrderDraft()
    order.items = [{ productId: 'p1', name: 'Товар', price: 100, qty: 3 }]
    db.saveOrder(order)

    const moves = db.getStockMoves('p1')
    expect(moves).toHaveLength(1)
    expect(moves[0].delta).toBe(-3)
    expect(moves[0].kind).toBe('order')
    expect(moves[0].note).toBe(`Заказ №${order.number}`)
    expect(moves[0].stockAfter).toBe(7)
  })

  it('при редактировании заказа пишет одно движение на разницу', () => {
    const { db } = setup()
    db.saveProduct(makeProduct({ stock: 10 }))
    const order = db.createOrderDraft()
    order.items = [{ productId: 'p1', name: 'Товар', price: 100, qty: 3 }]
    db.saveOrder(order)

    order.items = [{ productId: 'p1', name: 'Товар', price: 100, qty: 1 }]
    db.saveOrder(order)

    const moves = db.getStockMoves('p1')
    expect(moves).toHaveLength(2)
    expect(moves[0].delta).toBe(2)
    expect(moves[0].stockAfter).toBe(9)
    expect(db.getProduct('p1')?.stock).toBe(9)
  })

  it('возвращает остаток при отмене заказа', () => {
    const { db } = setup()
    db.saveProduct(makeProduct({ stock: 10 }))
    const order = db.createOrderDraft()
    order.items = [{ productId: 'p1', name: 'Товар', price: 100, qty: 2 }]
    db.saveOrder(order)

    db.saveOrder({ ...order, status: 'cancelled' })

    expect(db.getProduct('p1')?.stock).toBe(10)
    expect(db.getStockMoves('p1')[0]).toMatchObject({
      delta: 2,
      note: `Заказ №${order.number} (отменён)`,
    })
  })

  it('возвращает остаток при удалении заказа', () => {
    const { db } = setup()
    db.saveProduct(makeProduct({ stock: 10 }))
    const order = db.createOrderDraft()
    order.items = [{ productId: 'p1', name: 'Товар', price: 100, qty: 2 }]
    db.saveOrder(order)

    db.deleteOrder(order.id)

    expect(db.getProduct('p1')?.stock).toBe(10)
    expect(db.getStockMoves('p1')[0].note).toBe(`Удаление заказа №${order.number}`)
  })

  it('поддерживает приход, расход и корректировку', () => {
    const { db } = setup()
    db.saveProduct(makeProduct({ stock: 15 }))

    expect(
      db.applyStockMove({ productId: 'p1', kind: 'in', value: 20, comment: 'Поставщик' }),
    ).toBe(true)
    expect(db.getProduct('p1')?.stock).toBe(35)

    expect(db.applyStockMove({ productId: 'p1', kind: 'out', value: 8 })).toBe(true)
    expect(db.getProduct('p1')?.stock).toBe(27)

    // Корректировка выставляет новый остаток: 27 уже стоит, поэтому движения нет.
    expect(db.applyStockMove({ productId: 'p1', kind: 'adjustment', value: 27 })).toBe(false)
    expect(db.applyStockMove({ productId: 'p1', kind: 'adjustment', value: 30 })).toBe(true)
    expect(db.getProduct('p1')?.stock).toBe(30)

    const moves = db.getStockMoves('p1')
    expect(moves.map((move) => move.delta)).toEqual([3, -8, 20])
    // Комментарий хранится как причина, название операции добавляет экран склада.
    expect(moves[2].note).toBe('Поставщик')
    expect(moves[2].stockAfter).toBe(35)
    expect(moves[1].note).toBe('Расход')
    expect(moves[0].kind).toBe('adjustment')
    expect(moves[0].note).toBe('Корректировка')
    expect(moves[0].stockAfter).toBe(30)
  })

  it('не двигает услуги и не пишет движение без изменений', () => {
    const { db } = setup()
    db.saveProduct(makeProduct({ id: 's1', name: 'Услуга', kind: 'service', stock: 0 }))
    db.saveProduct(makeProduct({ stock: 10 }))

    expect(db.applyStockMove({ productId: 's1', kind: 'in', value: 5 })).toBe(false)
    expect(db.applyStockMove({ productId: 'p1', kind: 'adjustment', value: 10 })).toBe(false)
    expect(db.applyStockMove({ productId: 'p1', kind: 'out', value: 0 })).toBe(false)
    expect(db.applyStockMove({ productId: 'нет такого', kind: 'in', value: 1 })).toBe(false)
    expect(db.getStockMoves()).toEqual([])
  })

  it('удаляет историю вместе с товаром', () => {
    const { db } = setup()
    db.saveProduct(makeProduct({ stock: 10 }))
    db.applyStockMove({ productId: 'p1', kind: 'in', value: 5 })
    expect(db.getStockMoves()).toHaveLength(1)

    db.deleteProduct('p1')
    expect(db.getStockMoves()).toEqual([])
  })

  it('переносит историю в резервную копию', () => {
    const { db } = setup()
    db.saveProduct(makeProduct({ stock: 10 }))
    db.applyStockMove({ productId: 'p1', kind: 'in', value: 5 })

    const second = new Database(new MemoryStore())
    second.importData(db.exportData())

    expect(second.getStockMoves('p1')).toHaveLength(1)
    expect(second.getProduct('p1')?.stock).toBe(15)
  })
})

