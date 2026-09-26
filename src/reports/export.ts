// Точка входа выгрузки отчёта: собрать файл и отдать его пользователю.
//
// Модуль подгружается по нажатию кнопки «Экспорт в Excel»: сборка `.xlsx` нужна
// только в этот момент, а экран статистики открывают и без выгрузки. Поэтому здесь
// же собраны все три шага — данные, файл и доставка — чтобы экран знал об одном
// вызове и не тянул библиотеку в основной бандл.
import type { Client, Order } from '../types'
import type { PeriodKey } from '../utils/stats'
import { deliverReportFile, type ReportDeliveryResult } from './delivery'
import { buildReportData, reportMessage, reportPeriod, type ReportPeriod } from './report'
import { reportFileName, reportXlsxBlob } from './xlsx'

export interface ReportExportInput {
  orders: Order[]
  // Все клиенты, включая архивных: по ним отчёт подписывает строки.
  clients: Client[]
  period: PeriodKey
  custom: { from?: string; to?: string }
}

export interface ReportExportResult {
  fileName: string
  period: ReportPeriod
  delivery: ReportDeliveryResult
}

// Данные за период → файл → доставка. Период приходит тем же ключом, что выбран на
// экране статистики, поэтому выгружается ровно то, что видно на экране.
export async function exportReport(input: ReportExportInput): Promise<ReportExportResult> {
  const period = reportPeriod(input.period, input.custom)
  const data = buildReportData({ orders: input.orders, clients: input.clients, period })
  const fileName = reportFileName(period)
  const blob = await reportXlsxBlob(data)
  const delivery = await deliverReportFile({ blob, fileName, message: reportMessage(data) })
  return { fileName, period, delivery }
}
