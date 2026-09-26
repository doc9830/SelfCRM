// Проверки файла отчёта: состав листов, типы ячеек и имя файла.
import { describe, expect, it } from 'vitest'
import type { Client, Order } from '../types'
import { buildReportData, reportPeriod, type ReportData } from './report'
import {
  REPORT_SHEET_CLIENTS,
  REPORT_SHEET_ORDERS,
  REPORT_SHEET_POSITIONS,
  REPORT_SHEET_PRODUCTS,
  REPORT_SHEET_SUMMARY,
  reportFileName,
  reportSheets,
  reportXlsxBlob,
} from './xlsx'

const ALL_TIME = reportPeriod('all')

function makeClient(): Client {
  return {
    id: 'c1',
    name: 'Иванов Иван',
    phone: '',
    email: '',
    comment: '',
    createdAt: new Date(2026, 0, 1).toISOString(),
  }
}

function makeOrder(partial: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    number: 1,
    clientId: 'c1',
    date: new Date(2026, 8, 10, 12).toISOString(),
    status: 'done',
    items: [{ productId: 'p1', name: 'Плитка', price: 1000, qty: 2, cost: 600 }],
    payments: [{ id: 'p1', amount: 500, date: new Date(2026, 8, 11, 12).toISOString(), comment: '' }],
    comment: '',
    ...partial,
  }
}

function data(orders: Order[] = [makeOrder()]): ReportData {
  return buildReportData({ orders, clients: [makeClient()], period: ALL_TIME })
}

describe('имя файла отчёта', () => {
  it('период с двумя границами называет обе даты', () => {
    const period = reportPeriod('custom', { from: '2026-09-01', to: '2026-09-26' })
    expect(reportFileName(period)).toBe('SelfCRM_Отчет_2026-09-01_2026-09-26.xlsx')
  })

  it('«всё время» получает понятное имя', () => {
    expect(reportFileName(ALL_TIME)).toBe('SelfCRM_Отчет_Все_время.xlsx')
  })

  it('одна граница тоже читается', () => {
    expect(reportFileName({ from: '2026-09-01', to: null })).toBe('SelfCRM_Отчет_с_2026-09-01.xlsx')
    expect(reportFileName({ from: null, to: '2026-09-26' })).toBe('SelfCRM_Отчет_по_2026-09-26.xlsx')
  })
})

describe('листы отчёта', () => {
  it('в книге пять листов в нужном порядке', () => {
    const sheets = reportSheets(data())
    expect(sheets.map((sheet) => sheet.sheet)).toEqual([
      REPORT_SHEET_SUMMARY,
      REPORT_SHEET_ORDERS,
      REPORT_SHEET_POSITIONS,
      REPORT_SHEET_CLIENTS,
      REPORT_SHEET_PRODUCTS,
    ])
  })

  it('первая строка каждого листа закреплена, а ширина колонок задана', () => {
    for (const sheet of reportSheets(data())) {
      expect(sheet.stickyRowsCount).toBe(1)
      expect(sheet.columns).toHaveLength(sheet.data[0].length)
    }
  })

  it('заголовки выделены полужирным', () => {
    const orders = reportSheets(data())[1]
    expect(orders.data[0][0]).toMatchObject({ value: 'Дата', fontWeight: 'bold' })
    expect(orders.data[0][8]).toMatchObject({ value: 'Прибыль', fontWeight: 'bold' })
  })

  it('суммы — числа с форматом, даты — даты: в Excel по ним считают', () => {
    const orders = reportSheets(data())[1]
    const row = orders.data[1]
    expect(row[0]).toMatchObject({ type: Date, format: 'dd.mm.yyyy' })
    expect(row[4]).toMatchObject({ value: 2000, type: Number, format: '#,##0.00' })
    expect(row[5]).toMatchObject({ value: 500, type: Number })
    expect(row[6]).toMatchObject({ value: 1500, type: Number })
    expect(row[8]).toMatchObject({ value: 800, type: Number })
  })

  it('сводка называет период и итоги', () => {
    const summary = reportSheets(data())[0]
    expect(summary.data[1]).toMatchObject([
      { value: 'Период отчёта' },
      { value: 'за всё время' },
    ])
    expect(summary.data.map((row) => row[0])).toMatchObject([
      { value: 'Показатель' },
      { value: 'Период отчёта' },
      { value: 'Выручка' },
      { value: 'Прибыль' },
      { value: 'Заказов за период' },
      { value: 'Завершённых заказов' },
      { value: 'Средний чек' },
      { value: 'Себестоимость' },
      { value: 'Оплачено' },
      { value: 'К оплате' },
    ])
    expect(summary.data[9][1]).toMatchObject({ value: 1500, type: Number })
  })

  it('пустая база даёт листы продаж с одними заголовками, а сводку с нулями', () => {
    const sheets = reportSheets(data([]))
    // Сводка остаётся осмысленной: период и нулевые показатели.
    expect(sheets[0].data).toHaveLength(10)
    expect(sheets[0].data[9][1]).toMatchObject({ value: 0, type: Number })
    for (const sheet of sheets.slice(1)) expect(sheet.data).toHaveLength(1)
  })
})

describe('готовый файл', () => {
  it('собирается настоящий xlsx с пятью листами', async () => {
    const blob = await reportXlsxBlob(data())
    const bytes = new Uint8Array(await blob.arrayBuffer())
    // «PK» — признак zip-архива: .xlsx это и есть zip с XML.
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK')
    const text = Buffer.from(bytes).toString('latin1')
    for (const name of ['xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet5.xml']) {
      expect(text).toContain(name)
    }
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })

  it('на пустой базе файл всё равно собирается', async () => {
    const blob = await reportXlsxBlob(data([]))
    expect(blob.size).toBeGreaterThan(1000)
  })
})
