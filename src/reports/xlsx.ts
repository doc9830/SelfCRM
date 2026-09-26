// Excel-отчёт по данным `reports/report.ts`.
//
// Один файл — пять листов: «Сводка», «Продажи», «Позиции», «Клиенты», «Товары».
// Числа остаются числами (их можно суммировать в Excel), даты — датами, суммы идут
// с форматом `#,##0.00`, первая строка каждого листа закреплена, а пустых колонок
// нет: состав листов задан требованиями отчёта.
//
// Библиотека — `write-excel-file`: собирает настоящий `.xlsx` (zip с XML) прямо в
// браузере, работает офлайн и отдаёт результат Blob'ом. Тяжёлых зависимостей у неё
// нет, поэтому выгрузка не тянет в бандл ничего лишнего.
import writeXlsxFile from 'write-excel-file/universal'
import type { Cell, CellObject, Sheet } from 'write-excel-file/universal'
import { ORDER_STATUS_LABEL } from '../types'
import type { ReportData, ReportPeriod } from './report'

// Имена листов отчёта: по ним же проверяют готовый файл.
export const REPORT_SHEET_SUMMARY = 'Сводка'
export const REPORT_SHEET_ORDERS = 'Продажи'
export const REPORT_SHEET_POSITIONS = 'Позиции'
export const REPORT_SHEET_CLIENTS = 'Клиенты'
export const REPORT_SHEET_PRODUCTS = 'Товары'

const MONEY_FORMAT = '#,##0.00'
const QTY_FORMAT = '0.###'
const COUNT_FORMAT = '0'
const DATE_FORMAT = 'dd.mm.yyyy'

// Оформление заголовков: полужирный текст на светлой плашке — читается и в Excel,
// и в LibreOffice, и в мобильных просмотрщиках, но не мешает сортировке.
const HEADER_BACKGROUND = '#EEF2F7'
const HEADER_COLOR = '#1F2937'

function header(value: string): CellObject {
  return {
    value,
    type: String,
    fontWeight: 'bold',
    backgroundColor: HEADER_BACKGROUND,
    textColor: HEADER_COLOR,
    align: 'left',
  }
}

// Текстовая ячейка: тип указан явно, поэтому пустая строка остаётся строкой,
// а не «пустой ячейкой».
function text(value: string): CellObject {
  return { value, type: String }
}

function money(value: number): CellObject {
  return { value: Number.isFinite(value) ? value : 0, type: Number, format: MONEY_FORMAT }
}

function count(value: number): CellObject {
  return { value: Number.isFinite(value) ? value : 0, type: Number, format: COUNT_FORMAT }
}

function quantity(value: number): CellObject {
  return { value: Number.isFinite(value) ? value : 0, type: Number, format: QTY_FORMAT }
}

// Дата как дата: Excel сортирует такие ячейки и считает по ним интервалы, а не
// сравнивает строки.
function date(iso: string): CellObject {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return { value: '', type: String }
  return { value: parsed, type: Date, format: DATE_FORMAT }
}

// Лист «Сводка»: период и итоговые показатели.
function summarySheet(data: ReportData): Array<Cell[]> {
  const summary = data.summary
  return [
    [header('Показатель'), header('Значение')],
    [text('Период отчёта'), text(data.periodText)],
    [text('Выручка'), money(summary.revenue)],
    [text('Прибыль'), money(summary.profit)],
    [text('Заказов за период'), count(summary.count)],
    [text('Завершённых заказов'), count(summary.byStatus.done)],
    [text('Средний чек'), money(summary.average)],
    [text('Себестоимость'), money(summary.cost)],
    [text('Оплачено'), money(summary.paid)],
    [text('К оплате'), money(summary.due)],
  ]
}

// Лист «Продажи»: одна строка — один заказ.
function ordersSheet(data: ReportData): Array<Cell[]> {
  return [
    [
      header('Дата'),
      header('Номер заказа'),
      header('Клиент'),
      header('Статус'),
      header('Сумма'),
      header('Оплачено'),
      header('К оплате'),
      header('Себестоимость'),
      header('Прибыль'),
    ],
    ...data.orders.map((row) => [
      date(row.date),
      text(row.number),
      text(row.client),
      text(ORDER_STATUS_LABEL[row.status]),
      money(row.total),
      money(row.paid),
      money(row.due),
      money(row.cost),
      money(row.profit),
    ]),
  ]
}


// Лист «Позиции»: одна строка — одна позиция заказа.
function positionsSheet(data: ReportData): Array<Cell[]> {
  return [
    [
      header('Дата заказа'),
      header('Номер заказа'),
      header('Клиент'),
      header('Товар/услуга'),
      header('Количество'),
      header('Цена'),
      header('Себестоимость'),
      header('Сумма'),
      header('Прибыль'),
    ],
    ...data.positions.map((row) => [
      date(row.orderDate),
      text(row.orderNumber),
      text(row.client),
      text(row.name),
      quantity(row.qty),
      money(row.price),
      money(row.cost),
      money(row.total),
      money(row.profit),
    ]),
  ]
}

// Лист «Клиенты»: заказы и деньги по каждому клиенту за период.
function clientsSheet(data: ReportData): Array<Cell[]> {
  return [
    [header('Клиент'), header('Заказов'), header('Выручка'), header('Средний чек')],
    ...data.clients.map((row) => [
      text(row.client),
      count(row.orders),
      money(row.revenue),
      money(row.average),
    ]),
  ]
}

// Лист «Товары»: продажи по товарам и услугам за период.
function productsSheet(data: ReportData): Array<Cell[]> {
  return [
    [
      header('Товар/услуга'),
      header('Продано'),
      header('Выручка'),
      header('Себестоимость'),
      header('Прибыль'),
    ],
    ...data.products.map((row) => [
      text(row.name),
      quantity(row.qty),
      money(row.revenue),
      money(row.cost),
      money(row.profit),
    ]),
  ]
}

// Описание книги: что и в каком порядке лежит в файле. Отдельная функция — её
// проверяют тесты, а сборка Blob'а остаётся одной строкой.
export function reportSheets(data: ReportData): Array<Sheet<Blob>> {
  return [
    {
      data: summarySheet(data),
      sheet: REPORT_SHEET_SUMMARY,
      columns: [{ width: 26 }, { width: 40 }],
      stickyRowsCount: 1,
    },
    {
      data: ordersSheet(data),
      sheet: REPORT_SHEET_ORDERS,
      columns: [
        { width: 12 },
        { width: 14 },
        { width: 28 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 16 },
        { width: 14 },
      ],
      stickyRowsCount: 1,
    },
    {
      data: positionsSheet(data),
      sheet: REPORT_SHEET_POSITIONS,
      columns: [
        { width: 12 },
        { width: 14 },
        { width: 28 },
        { width: 34 },
        { width: 12 },
        { width: 14 },
        { width: 16 },
        { width: 14 },
        { width: 14 },
      ],
      stickyRowsCount: 1,
    },
    {
      data: clientsSheet(data),
      sheet: REPORT_SHEET_CLIENTS,
      columns: [{ width: 32 }, { width: 12 }, { width: 16 }, { width: 16 }],
      stickyRowsCount: 1,
    },
    {
      data: productsSheet(data),
      sheet: REPORT_SHEET_PRODUCTS,
      columns: [{ width: 34 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 14 }],
      stickyRowsCount: 1,
    },
  ]
}

// Готовый файл отчёта. Blob, а не сразу файл: им распоряжается доставка
// (`reports/delivery.ts`) — скачивание в браузере, запись на устройство в сборке
// Capacitor или временная ссылка в мини-приложении Telegram.
export async function reportXlsxBlob(data: ReportData): Promise<Blob> {
  return writeXlsxFile(reportSheets(data)).toBlob()
}

function isoDay(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ''
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${parsed.getFullYear()}-${month}-${day}`
}

// Имя файла: `SelfCRM_Отчет_2026-09-01_2026-09-26.xlsx` для периода с двумя
// границами и `SelfCRM_Отчет_Все_время.xlsx` для «всё время».
export function reportFileName(period: Pick<ReportPeriod, 'from' | 'to'>): string {
  const from = period.from ? isoDay(period.from) : ''
  const to = period.to ? isoDay(period.to) : ''
  if (from && to) return `SelfCRM_Отчет_${from}_${to}.xlsx`
  if (from) return `SelfCRM_Отчет_с_${from}.xlsx`
  if (to) return `SelfCRM_Отчет_по_${to}.xlsx`
  return 'SelfCRM_Отчет_Все_время.xlsx'
}
