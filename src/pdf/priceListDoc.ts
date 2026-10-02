// Прайс-лист в PDF: каталог товаров и услуг с ценами — документ, который отправляют клиенту.
//
// Здесь только сборка документа: данные → описание для pdfmake. Библиотека и доставка
// файла живут в `pdf/priceList.ts`, поэтому прайс проверяется тестами как обычные
// данные, а не через PDF целиком.
import type { Contractor, Product } from '../types'
import { isService } from '../types'
import { formatDate } from '../utils/format'
import { contractorHeader, pdfMoney } from './common'

export const PRICE_LIST_TITLE = 'Прайс-лист'

// Строка прайса. Товары и услуги печатаются разными таблицами, поэтому признак услуги
// едет вместе со строкой, а не вычисляется второй раз в разметке.
export interface PriceListRow {
  number: number
  name: string
  sku: string
  price: number
  service: boolean
}

/** Строки прайса по всему каталогу: порядок тот же, в каком позиции пришли из базы. */
export function priceListRows(products: Product[]): PriceListRow[] {
  return products.map((product, index) => ({
    number: index + 1,
    name: product.name,
    sku: product.sku.trim(),
    price: product.price,
    service: isService(product),
  }))
}

// Имя файла: `SelfCRM_Прайс-лист_2026-10-02.pdf`. Дата в имени, а не в тексте: прайс
// обновляется, и по имени видно, какой из файлов свежее.
export function priceListFileName(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `SelfCRM_Прайс-лист_${now.getFullYear()}-${month}-${day}.pdf`
}

/** Подпись файла для системного меню «Поделиться» и сообщения в чате. */
export function priceListMessage(now: Date = new Date()): string {
  return `Прайс-лист SelfCRM на ${formatDate(now.toISOString())}`
}

export interface PriceListDocInput {
  products: Product[]
  contractor: Contractor
  now?: Date
}

// Описание документа для pdfmake: реквизиты исполнителя сверху, дата, две таблицы
// («Товары» и «Услуги» — услуга со склада не списывается, и клиенту её цену
// показывают отдельно) и оговорка про валюту.
export function priceListDocDefinition(input: PriceListDocInput): Record<string, unknown> {
  const now = input.now ?? new Date()
  const rows = priceListRows(input.products)
  const goods = rows.filter((row) => !row.service)
  const services = rows.filter((row) => row.service)

  const table = (items: PriceListRow[]) => ({
    table: {
      headerRows: 1,
      widths: ['auto', '*', 'auto', 'auto'],
      body: [
        ['№', 'Наименование', 'Артикул', 'Цена'].map((title) => ({ text: title, bold: true })),
        ...items.map((row) => [
          String(row.number),
          row.name || '—',
          row.sku || '—',
          pdfMoney(row.price),
        ]),
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => '#e5e5e5',
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
  })

  const content: unknown[] = [
    ...contractorHeader(input.contractor),
    { text: PRICE_LIST_TITLE, style: 'title', alignment: 'center', margin: [0, 10, 0, 2] },
    {
      text: `На ${formatDate(now.toISOString())}`,
      style: 'subtitle',
      alignment: 'center',
      margin: [0, 0, 0, 4],
    },
  ]

  if (rows.length === 0) {
    content.push({
      text: 'Позиции ещё не добавлены',
      alignment: 'center',
      style: 'note',
      margin: [0, 12, 0, 0],
    })
  } else {
    if (goods.length) {
      content.push({ text: 'Товары', style: 'group', margin: [0, 12, 0, 4] }, table(goods))
    }
    if (services.length) {
      content.push({ text: 'Услуги', style: 'group', margin: [0, 14, 0, 4] }, table(services))
    }
  }

  content.push({
    text: 'Цены указаны в рублях. Прайс-лист сформирован в приложении SelfCRM.',
    style: 'note',
    margin: [0, 14, 0, 0],
  })

  return {
    pageSize: 'A4' as const,
    pageMargins: [32, 32, 32, 32] as [number, number, number, number],
    content,
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#111827' },
    styles: {
      company: { fontSize: 12, bold: true },
      companyProps: { fontSize: 8.5, color: '#555555', margin: [0, 2, 0, 0] },
      title: { fontSize: 16, bold: true },
      subtitle: { fontSize: 10, color: '#666666' },
      group: { fontSize: 12, bold: true },
      note: { fontSize: 9, color: '#666666' },
    },
  }
}
