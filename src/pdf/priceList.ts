// Выгрузка прайс-листа: собрать PDF и отдать его пользователю той же доставкой, что и
// отчёт в Excel (`reports/delivery.ts`) — в Android-сборке файл уходит системным меню
// «Поделиться», в мини-приложении Telegram временной ссылкой, в браузере скачивается.
//
// Модуль подгружается по нажатию кнопки: в нём pdfmake с встроенным шрифтом, а каталог
// открывают и без выгрузки. Документ собирает `pdf/priceListDoc.ts` — там только данные.
import pdfMake from 'pdfmake/build/pdfmake'
import vfs from 'pdfmake/build/vfs_fonts'
import type { Contractor, Product } from '../types'
import { REPORT_PDF_TYPE, deliverReportFile, type ReportDeliveryResult } from '../reports/delivery'
import { priceListDocDefinition, priceListFileName, priceListMessage } from './priceListDoc'

// В pdfmake 0.3.x шрифт Roboto (с кириллицей) подключается через виртуальную ФС.
pdfMake.addVirtualFileSystem(vfs)

export interface PriceListInput {
  products: Product[]
  contractor: Contractor
  now?: Date
}

export interface PriceListResult {
  fileName: string
  delivery: ReportDeliveryResult
}

export async function exportPriceList(input: PriceListInput): Promise<PriceListResult> {
  const now = input.now ?? new Date()
  const fileName = priceListFileName(now)
  const blob = await pdfMake
    .createPdf(priceListDocDefinition({ ...input, now }))
    .getBlob()
  const delivery = await deliverReportFile({
    blob,
    fileName,
    message: priceListMessage(now),
    // Тип известен заранее: по нему система и Telegram понимают, что скачивают PDF.
    type: REPORT_PDF_TYPE,
  })
  return { fileName, delivery }
}
