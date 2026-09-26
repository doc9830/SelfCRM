// Демо-база для съёмки скриншотов: небольшой сантехнический сервис — 8 клиентов,
// 10 товаров, 4 услуги, 14 заказов со статусами, оплатами и напоминаниями и история
// склада. Данные правдоподобные, но вымышленные: они готовятся здесь, а не функцией
// внутри приложения.

export const STORAGE_KEY = 'selfcrm:data'
export const THEME_KEY = 'selfcrm:theme'

function iso(daysAgo, hour = 12, minute = 0) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function isoInHours(hours) {
  const d = new Date()
  d.setHours(d.getHours() + hours, 0, 0, 0)
  return d.toISOString()
}

function isoInDays(days, hour) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

const CLIENTS = [
  ['ООО «Кухни Плюс»', '+7 916 204-18-73', 'zakaz@kuhni-plus.ru', 'Москва, ул. Электродная, 12', 'Постоянный заказчик: монтаж сантехники', 120],
  ['Иван Петров', '+7 900 111-22-33', 'ivan.petrov@example.com', 'Москва, Ленинский проспект, 42, кв. 15', '', 96],
  ['Мария Смирнова', '+7 900 444-55-66', 'maria.smirnova@example.com', 'Москва, ул. Профсоюзная, 93, кв. 7', '', 74],
  ['Алексей Кузнецов', '+7 921 777-88-99', 'alexey.k@example.com', 'Москва, Нагатинская набережная, 10, кв. 82', '', 63],
  ['Светлана Орлова', '+7 903 222-11-00', 'svetlana.o@example.com', 'Москва, ул. Гиляровского, 4, кв. 31', '', 51],
  ['ООО «Ромашка»', '+7 495 333-44-55', 'info@romashka.ru', 'Москва, Дербеневская набережная, 1', 'Оплата по счёту, работы по графику', 44],
  ['Дмитрий Волков', '+7 926 512-34-77', 'dmitry.volkov@example.com', 'Москва, ул. Сходненская, 12, кв. 5', '', 38],
  ['Елена Никитина', '+7 916 808-14-24', 'elena.n@example.com', 'Москва, ул. Молодогвардейская, 8, кв. 44', '', 33],
]

// [имя, артикул, цена, себестоимость, остаток, минимум, движения]
// движение: [сколько дней назад, изменение, вид, причина]
const GOODS = [
  ['Смеситель для кухни', 'SM-101', 4900, 3200, 12, 4, [
    [20, 20, 'in', 'По накладной №128'], [9, -2, 'order', 'Заказ №2'], [6, -2, 'order', 'Заказ №5'],
    [4, -1, 'out', 'Брак: сорвана резьба'], [2, -3, 'order', 'Заказ №9']]],
  ['Смеситель для ванной', 'SM-102', 5600, 3700, 5, 3, [
    [18, 8, 'in', 'По накладной №128'], [9, -2, 'order', 'Заказ №3'], [5, -1, 'order', 'Заказ №7']]],
  ['Смеситель-термостат', 'SM-103', 8900, 6100, 4, 2, [
    [18, 5, 'in', 'По накладной №128'], [5, -1, 'order', 'Заказ №8']]],
  ['Сифон для мойки', 'SIF-201', 890, 540, 21, 6, [
    [20, 30, 'in', 'По накладной №128'], [9, -3, 'order', 'Заказ №3'], [6, -2, 'order', 'Заказ №4'],
    [3, -1, 'order', 'Заказ №10'], [1, -3, 'order', 'Заказ №12']]],
  ['Душевая лейка', 'DL-301', 1450, 900, 9, 4, [
    [16, 12, 'in', 'По накладной №131'], [7, -2, 'order', 'Заказ №6'], [2, -1, 'order', 'Заказ №11']]],
  ['Гибкая подводка 1/2"', 'GP-401', 320, 180, 4, 6, [
    [20, 10, 'in', 'По накладной №128'], [9, -3, 'order', 'Заказ №3'], [6, -2, 'order', 'Заказ №4'],
    [1, -1, 'out', 'Повреждена упаковка при переноске']]],
  ['Кран шаровой 1/2"', 'KR-501', 640, 390, 2, 5, [
    [16, 6, 'in', 'По накладной №131'], [7, -2, 'order', 'Заказ №6'], [3, -1, 'order', 'Заказ №10'],
    [1, -1, 'order', 'Заказ №12']]],
  ['Лента ФУМ (10 м)', 'FUM-601', 90, 45, 24, 10, [
    [24, 40, 'in', 'По накладной №120'], [8, -8, 'order', 'Заказ №4'], [3, -8, 'order', 'Заказ №9']]],
  ['Ключ разводной 250 мм', 'KLS-701', 1250, 780, 7, 3, [
    [30, 8, 'in', 'Начальный склад'], [16, -1, 'out', 'Сломан, списан']]],
  ['Прокладка резиновая (уп. 10)', 'PRK-801', 210, 120, 31, 10, [
    [24, 50, 'in', 'По накладной №120'], [12, -10, 'order', 'Заказ №1'], [4, -9, 'order', 'Заказ №8']]],
  ['Установка смесителя', '', 2800, 0, 0, 0, []],
  ['Замена сифона', '', 1500, 0, 0, 0, []],
  ['Выезд мастера', '', 1500, 0, 0, 0, []],
  ['Чистка и монтаж', '', 1800, 0, 0, 0, []],
]

const SERVICES_FROM = 10

// [клиент, статус, дней назад, позиции [[индекс товара, количество]]]
// [комментарий, доля оплаты, напоминания [[вид, текст, когда]]
//  (когда: -1 — просрочено, 0 — сегодня, 1 — завтра, 2 — послезавтра)]]
const ORDERS = [
  [6, 'done', 24, [[1, 1], [3, 1]], ['Замена сифона и подводки в квартире', 1, []]],
  [0, 'done', 21, [[0, 2], [3, 2], [10, 2], [11, 2]], ['Монтаж двух моек, объект на Электродной', 1, []]],
  [1, 'done', 18, [[6, 1], [5, 1], [12, 1]], ['Ремонт крана и подводки на кухне', 1, []]],
  [7, 'done', 16, [[3, 2], [13, 1]], ['Прочистка и замена сифона', 1, []]],
  [2, 'done', 14, [[8, 2], [9, 2], [2, 1]], ['Собрали комплект для двух квартир', 1, []]],
  [6, 'in_progress', 9, [[0, 5], [1, 3], [10, 1]], ['Монтаж по счёту №117, объект сдаём в понедельник', 0.5, [['payment', 'Напомнить об оплате', 1]]]],
  [3, 'in_progress', 7, [[2, 2], [3, 2], [13, 2]], ['Два стояка, нужен доступ в подвал', 0.4, []]],
  [4, 'in_progress', 5, [[9, 7], [5, 3], [7, 1], [3, 2]], ['Монтаж сантехники, объект на Молодогвардейской', 0.35, [['product', 'Проверить наличие/получение товара', 2]]]],
  [0, 'cancelled', 6, [[3, 6], [9, 4]], ['Клиент перенёс работы на следующий месяц', 0, []]],
  [2, 'cancelled', 4, [[2, 1]], ['Отменил заказ: нашёл мастера рядом', 0, []]],
  [2, 'new', 2, [[0, 1], [2, 1], [13, 1]], ['Согласовать время с клиентом', 0, [['payment', 'Напомнить об оплате', -1]]]],
  [3, 'new', 1, [[1, 2], [5, 1]], ['Ждёт звонка, удобно после 18:00', 0, []]],
  [4, 'new', 0, [[2, 1], [11, 1]], ['Просила перезвонить: уточнить адрес', 0, [['call', 'Позвонить клиенту', 0]]]],
  [6, 'new', 0, [[4, 4], [7, 1], [13, 2]], ['Работы по счёту №119', 0, []]],
]

function buildStockMoves(products) {
  const moves = []
  products.forEach((product) => {
    const spec = product.moves
    if (!spec.length) return
    const total = spec.reduce((sum, [, delta]) => sum + delta, 0)
    let stock = product.stock - total
    spec.forEach(([daysAgo, delta, kind, note], index) => {
      stock += delta
      moves.push({
        id: `move-${product.id}-${index + 1}`,
        productId: product.id,
        date: iso(daysAgo, 10 + index),
        delta,
        kind,
        note,
        stockAfter: stock,
      })
    })
    if (stock !== product.stock) throw new Error(`движения ${product.name} не сходятся: ${stock} ≠ ${product.stock}`)
  })
  return moves
}

export function demoSnapshot() {
  const clients = CLIENTS.map(([name, phone, email, address, comment, daysAgo], index) => ({
    id: `client-${index + 1}`,
    name,
    phone,
    email,
    comment,
    address,
    createdAt: iso(daysAgo, 11),
    ...(name === 'Елена Никитина' ? { archived: true, archivedAt: iso(30, 15) } : {}),
  }))

  const products = GOODS.map(([name, sku, price, cost, stock, minStock, moves], index) => ({
    id: `product-${index + 1}`,
    name,
    sku,
    price,
    cost,
    stock,
    minStock,
    description: '',
    ...(index >= SERVICES_FROM ? { kind: 'service' } : {}),
    moves,
  }))

  const orders = ORDERS.map(([clientIndex, status, daysAgo, items, [comment, paid, reminders]], index) => {
    const positions = items.map(([productIndex, qty]) => {
      const product = products[productIndex]
      return { productId: product.id, name: product.name, price: product.price, qty, cost: product.cost }
    })
    const total = positions.reduce((sum, item) => sum + item.price * item.qty, 0)
    const payments = paid > 0
      ? [{
          id: `payment-${index + 1}`,
          amount: Math.round(total * paid),
          date: iso(daysAgo, 14),
          comment: paid === 1 ? 'Оплата' : 'Предоплата',
        }]
      : []
    return {
      id: `order-${index + 1}`,
      clientId: clients[clientIndex].id,
      date: iso(daysAgo, 13),
      status,
      items: positions,
      payments,
      reminders: reminders.map(([kind, text, when], n) => ({
        id: `reminder-${index + 1}-${n + 1}`,
        kind,
        text,
        dueAt: when < 0 ? iso(1, 10) : when === 0 ? isoInHours(2) : isoInDays(when, 9),
        createdAt: iso(Math.max(daysAgo, 1), 13),
      })),
      comment,
    }
  })

  // Номера сквозные: старые сделки получают меньшие номера.
  ;[...orders].sort((a, b) => a.date.localeCompare(b.date))
    .forEach((order, index) => {
      order.number = index + 1
    })

  return {
    version: 1,
    clients,
    products: products.map(({ moves, ...product }) => product),
    orders,
    stockMoves: buildStockMoves(products),
    settings: {
      contractor: {
        name: 'ИП Мельников Игорь Сергеевич',
        inn: '770512345678',
        ogrn: '322770000123456',
        kpp: '770001001',
        phone: '+7 916 204-18-73',
        email: 'master@selfcrm.ru',
        address: 'Москва, ул. Электродная, 12, офис 4',
      },
    },
  }
}

export function demoJson() {
  return JSON.stringify(demoSnapshot())
}

// Помощники для съёмки: id нужного клиента, заказа или товара из той же базы.
export function idsByStatus(snapshot = demoSnapshot()) {
  const pick = (status) => snapshot.orders.filter((order) => order.status === status)
  return {
    snapshot,
    done: pick('done'),
    inProgress: pick('in_progress'),
    fresh: pick('new'),
    cancelled: pick('cancelled'),
    lowStock: snapshot.products.filter((p) => p.kind !== 'service' && p.stock <= p.minStock),
    firstProduct: snapshot.products[0],
    archivedClient: snapshot.clients.find((client) => client.archived),
  }
}
