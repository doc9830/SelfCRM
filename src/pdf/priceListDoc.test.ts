// Прайс-лист: строки, имя файла и состав документа.
import { describe, expect, it } from 'vitest'
import { emptyContractor, type Product } from '../types'
import { pdfMoney } from './common'
import {
  PRICE_LIST_TITLE,
  priceListDocDefinition,
  priceListFileName,
  priceListMessage,
  priceListRows,
} from './priceListDoc'

const NOW = new Date(2026, 9, 2, 11, 15)

function makeProduct(partial: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Смеситель',
    sku: 'SKU-001',
    price: 1250,
    stock: 4,
    minStock: 1,
    description: '',
    ...partial,
  }
}

// Узлы документа для pdfmake — обычные объекты, поэтому проверять их можно напрямую:
// у таблицы берём тело (шапка плюс строки).
function tableBodies(doc: Record<string, unknown>): unknown[][][] {
  const content = doc.content as Array<Record<string, unknown>>
  return content
    .filter((item) => item.table)
    .map((item) => (item.table as { body: unknown[][] }).body)
}

function texts(doc: Record<string, unknown>): string[] {
  const content = doc.content as Array<Record<string, unknown>>
  return content.filter((item) => typeof item.text === 'string').map((item) => item.text as string)
}

describe('Прайс-лист: строки и имя файла', () => {
  it('нумерует позиции по порядку каталога', () => {
    const rows = priceListRows([
      makeProduct({ id: 'p1', name: 'Смеситель' }),
      makeProduct({ id: 'p2', name: 'Монтаж', kind: 'service', sku: '' }),
    ])

    expect(rows.map((row) => row.number)).toEqual([1, 2])
    expect(rows.map((row) => row.service)).toEqual([false, true])
    expect(rows[1].sku).toBe('')
  })

  it('имя файла содержит дату, а подпись — читаемую дату', () => {
    expect(priceListFileName(NOW)).toBe('SelfCRM_Прайс-лист_2026-10-02.pdf')
    expect(priceListMessage(NOW)).toBe('Прайс-лист SelfCRM на 02.10.2026')
  })
})

describe('Прайс-лист: документ', () => {
  const products = [
    makeProduct({ id: 'p1', name: 'Смеситель', sku: 'SKU-001', price: 1250 }),
    makeProduct({ id: 'p2', name: 'Монтаж', kind: 'service', sku: '', price: 3000 }),
  ]

  it('печатает реквизиты, дату и название', () => {
    const doc = priceListDocDefinition({
      products,
      contractor: { ...emptyContractor(), name: 'ИП Иванов', inn: '770000000000' },
      now: NOW,
    })
    const lines = texts(doc)

    expect(lines[0]).toBe('ИП Иванов')
    expect(lines[1]).toBe('ИНН 770000000000')
    expect(lines).toContain(PRICE_LIST_TITLE)
    expect(lines).toContain('На 02.10.2026')
  })

  it('делит позиции на товары и услуги', () => {
    const doc = priceListDocDefinition({ products, contractor: emptyContractor(), now: NOW })
    const tables = tableBodies(doc)

    expect(texts(doc)).toContain('Товары')
    expect(texts(doc)).toContain('Услуги')
    expect(tables).toHaveLength(2)
    // Шапка таблицы плюс строка товара.
    expect(tables[0]).toHaveLength(2)
    expect(tables[0][1]).toEqual(['1', 'Смеситель', 'SKU-001', pdfMoney(1250)])
    expect(tables[1][1]).toEqual(['2', 'Монтаж', '—', pdfMoney(3000)])
  })

  it('без услуг печатает одну таблицу', () => {
    const doc = priceListDocDefinition({
      products: [makeProduct()],
      contractor: emptyContractor(),
      now: NOW,
    })

    expect(tableBodies(doc)).toHaveLength(1)
    expect(texts(doc)).not.toContain('Услуги')
  })

  it('на пустом каталоге объясняет, что позиций нет', () => {
    const doc = priceListDocDefinition({ products: [], contractor: emptyContractor(), now: NOW })

    expect(tableBodies(doc)).toHaveLength(0)
    expect(texts(doc)).toContain('Позиции ещё не добавлены')
  })
})
