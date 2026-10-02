// Общие части PDF-документов: чек (pdf/documents.ts) и прайс-лист (pdf/priceList.ts)
// печатают одни и те же суммы и шапку с реквизитами исполнителя, поэтому правила
// печати живут здесь, а не повторяются в каждом документе.
import type { Contractor } from '../types'

// Сумма для PDF: символ «₽» может отсутствовать во встроенном шрифте Roboto,
// поэтому валюта пишется словом — «1 250,00 руб.».
export function pdfMoney(value: number): string {
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
  return `${formatted} руб.`
}

// Шапка документа: название и реквизиты исполнителя из настроек. Пустые поля не
// печатаются, а без реквизитов шапка не занимает места — документ остаётся читаемым.
export function contractorHeader(contractor: Contractor): Array<Record<string, unknown>> {
  const header: Array<Record<string, unknown>> = []
  if (contractor.name.trim()) header.push({ text: contractor.name.trim(), style: 'company' })

  const props: string[] = []
  if (contractor.inn.trim()) props.push(`ИНН ${contractor.inn.trim()}`)
  if (contractor.ogrn.trim()) props.push(`ОГРН ${contractor.ogrn.trim()}`)
  if (contractor.kpp.trim()) props.push(`КПП ${contractor.kpp.trim()}`)
  if (contractor.address.trim()) props.push(contractor.address.trim())
  if (contractor.phone.trim()) props.push(`Тел. ${contractor.phone.trim()}`)
  if (contractor.email.trim()) props.push(contractor.email.trim())
  if (props.length) header.push({ text: props.join(' · '), style: 'companyProps' })

  return header
}
