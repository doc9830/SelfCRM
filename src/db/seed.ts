import type { Client, Order, Product } from '../types'
import { uid } from '../utils/id'
import type { Database } from './database'

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

// Демо-данные для быстрой проверки интерфейса. Вызываются только вручную (в dev-режиме).
export function seedDemo(db: Database): void {
  const client = (name: string, phone: string, email: string, comment = ''): Client => ({
    id: uid(),
    name,
    phone,
    email,
    comment,
    createdAt: daysAgo(20),
  })

  const c1 = client('Иван Петров', '+7 900 111-22-33', 'ivan@example.com', 'Постоянный клиент')
  const c2 = client('Мария Смирнова', '+7 900 444-55-66', 'maria@example.com')
  const c3 = client('ООО «Ромашка»', '+7 812 333-44-55', 'info@romashka.ru', 'Оптовый заказчик')
  const c4 = client('Алексей Кузнецов', '+7 921 777-88-99', 'alex@example.com')
  const c5 = client('Светлана Орлова', '+7 903 222-11-00', 'svetlana@example.com')

  const product = (
    name: string,
    sku: string,
    price: number,
    stock: number,
    minStock: number,
    kind?: Product['kind'],
  ): Product => ({
    id: uid(),
    name,
    sku,
    price,
    stock,
    minStock,
    description: '',
    kind,
  })

  const p1 = product('Кофе в зёрнах 1 кг', 'COF-01', 1200, 14, 5)
  const p2 = product('Молоко 3,2% 1 л', 'MLK-01', 95, 40, 10)
  const p3 = product('Круассан', 'BAK-01', 110, 6, 8)
  const p4 = product('Чай листовой 100 г', 'TEA-01', 350, 25, 10)
  const p5 = product('Стаканчик бумажный (уп. 50)', 'CUP-01', 250, 3, 5)
  const p6 = product('Сахар порционный (уп. 100)', 'SUG-01', 90, 12, 5)

  // Услуги не списываются со склада и всегда доступны в заказе.
  const s1 = product('Выезд мастера', '', 1500, 0, 0, 'service')
  const s2 = product('Диагностика оборудования', '', 800, 0, 0, 'service')

  const order = (
    clientId: string | null,
    status: Order['status'],
    days: number,
    items: Order['items'],
    comment = '',
  ): Order => ({
    id: uid(),
    clientId,
    date: daysAgo(days),
    status,
    items,
    comment,
  })

  const orders: Order[] = [
    order(c1.id, 'new', 1, [
      { productId: p1.id, name: p1.name, price: p1.price, qty: 2 },
      { productId: p5.id, name: p5.name, price: p5.price, qty: 1 },
    ]),
    order(c2.id, 'in_progress', 2, [
      { productId: p2.id, name: p2.name, price: p2.price, qty: 3 },
      { productId: p3.id, name: p3.name, price: p3.price, qty: 6 },
    ]),
    order(c3.id, 'done', 5, [
      { productId: p1.id, name: p1.name, price: p1.price, qty: 5 },
      { productId: p4.id, name: p4.name, price: p4.price, qty: 4 },
      { productId: s1.id, name: s1.name, price: s1.price, qty: 1 },
    ]),
    order(c1.id, 'done', 7, [
      { productId: p3.id, name: p3.name, price: p3.price, qty: 4 },
      { productId: p6.id, name: p6.name, price: p6.price, qty: 2 },
      { productId: s2.id, name: s2.name, price: s2.price, qty: 1 },
    ]),
    order(c4.id, 'cancelled', 9, [
      { productId: p2.id, name: p2.name, price: p2.price, qty: 10 },
    ]),
    order(c5.id, 'new', 0, [
      { productId: p1.id, name: p1.name, price: p1.price, qty: 1 },
    ]),
  ]

  for (const c of [c1, c2, c3, c4, c5]) db.saveClient(c)
  for (const p of [p1, p2, p3, p4, p5, p6, s1, s2]) db.saveProduct(p)
  for (const o of orders) db.saveOrder(o)
}
