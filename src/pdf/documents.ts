// Генерация документов. Реализован чек (квитанция) по завершённому заказу.
// В основе — pdfmake: работает офлайн, встроенный шрифт Roboto поддерживает кириллицу.

import pdfMake from 'pdfmake/build/pdfmake'
import vfs from 'pdfmake/build/vfs_fonts'
import type { Client, Contractor, Order } from '../types'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { formatDate } from '../utils/format'

;(pdfMake as { vfs?: Record<string, string> }).vfs = vfs

// Превращает PDF в base64-строку (нужно, чтобы записать файл на устройство).
function getPdfBase64(docDefinition: unknown): Promise<string> {
  return new Promise((resolve) => {
    pdfMake.createPdf(docDefinition).getBase64((data) => resolve(data))
  })
}

// Сумма без знака валюты (символ «₽» может отсутствовать во встроенном шрифте),
// используем «руб.».
function pdfMoney(value: number): string {
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
  return `${formatted} руб.`
}

export interface ReceiptInput {
  order: Order
  client?: Client
  contractor: Contractor
}

export async function generateReceiptPdf(input: ReceiptInput): Promise<void> {
  const { order, client, contractor } = input
  const total = order.items.reduce((sum, it) => sum + it.price * it.qty, 0)
  const number = order.id.slice(0, 8).toUpperCase()

  const header: Array<Record<string, unknown>> = []
  if (contractor.name.trim()) {
    header.push({ text: contractor.name.trim(), style: 'company' })
  }
  const props: string[] = []
  if (contractor.inn.trim()) props.push(`ИНН ${contractor.inn.trim()}`)
  if (contractor.ogrn.trim()) props.push(`ОГРН ${contractor.ogrn.trim()}`)
  if (contractor.kpp.trim()) props.push(`КПП ${contractor.kpp.trim()}`)
  if (contractor.address.trim()) props.push(contractor.address.trim())
  if (contractor.phone.trim()) props.push(`Тел. ${contractor.phone.trim()}`)
  if (contractor.email.trim()) props.push(contractor.email.trim())
  if (props.length) {
    header.push({ text: props.join(' · '), style: 'companyProps' })
  }

  const clientLines: Array<Record<string, unknown>> = [
    { text: `Заказчик: ${client?.name?.trim() || '—'}` },
  ]
  if (client?.phone) clientLines.push({ text: `Телефон: ${client.phone}` })
  if (client?.address) clientLines.push({ text: `Адрес: ${client.address}` })

  const tableHeader = ['№', 'Наименование', 'Кол-во', 'Цена', 'Сумма'].map((t) => ({
    text: t,
    bold: true,
  }))

  const tableBody: unknown[][] = [
    tableHeader,
    ...order.items.map((item, i) => [
      String(i + 1),
      item.name,
      String(item.qty),
      pdfMoney(item.price),
      pdfMoney(item.price * item.qty),
    ]),
  ]

  const content: unknown[] = [
    ...header,
    { text: 'ЧЕК', alignment: 'center', style: 'title', margin: [0, 10, 0, 4] },
    {
      columns: [
        { text: `№ ${number}`, style: 'meta' },
        { text: formatDate(order.date), alignment: 'right', style: 'meta' },
      ],
    },
    ...clientLines.map((line) => ({ ...line, margin: [0, 4, 0, 0], style: 'meta' })),
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 270, y2: 0, lineWidth: 1, lineColor: '#cccccc' }],
      margin: [0, 10, 0, 10],
    },
    {
      table: {
        headerRows: 1,
        widths: ['auto', '*', 'auto', 'auto', 'auto'],
        body: tableBody,
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => '#e5e5e5',
        paddingLeft: () => 2,
        paddingRight: () => 2,
        paddingTop: () => 3,
        paddingBottom: () => 3,
      },
    },
    {
      text: `Итого: ${pdfMoney(total)}`,
      style: 'total',
      alignment: 'right',
      margin: [0, 10, 0, 0],
    },
    { text: 'Спасибо за покупку!', alignment: 'center', style: 'thanks', margin: [0, 14, 0, 0] },
  ]

  const docDefinition = {
    pageSize: 'A6' as const,
    pageMargins: [16, 16, 16, 16] as [number, number, number, number],
    content,
    defaultStyle: { font: 'Roboto', fontSize: 8, color: '#111827' },
    styles: {
      company: { fontSize: 10, bold: true },
      companyProps: { fontSize: 7.5, color: '#555555', margin: [0, 2, 0, 0] },
      title: { fontSize: 17, bold: true },
      meta: { fontSize: 8, color: '#333333' },
      total: { fontSize: 11, bold: true },
      thanks: { fontSize: 8, color: '#666666' },
    },
  }

  const filename = `check-${number}.pdf`

  if (Capacitor.isNativePlatform()) {
    // В Android-WebView скачивание через браузер не срабатывает, поэтому пишем PDF
    // во временный каталог устройства и открываем системное меню «Поделиться».
    const base64 = await getPdfBase64(docDefinition)
    const file = await Filesystem.writeFile({
      path: filename,
      data: `data:application/pdf;base64,${base64}`,
      directory: Directory.Cache,
      recursive: true,
    })
    await Share.share({
      title: `Чек № ${number}`,
      text: `Чек № ${number}`,
      files: [file.uri],
    })
    return
  }

  pdfMake.createPdf(docDefinition).download(filename)
}

