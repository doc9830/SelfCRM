const moneyFmt = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2,
})

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

// Короткая дата для списков и истории: «19.09», для другого года — «19.09.25».
const dayMonthFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' })
const dayMonthYearFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
})

export function money(value: number): string {
  return moneyFmt.format(Number.isFinite(value) ? value : 0)
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return dateFmt.format(d)
}

// Короткая дата для истории и списков: в текущем году «19.09», в прошлых — «19.09.25».
export function formatShortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.getFullYear() === now.getFullYear() ? dayMonthFmt.format(d) : dayMonthYearFmt.format(d)
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

// Подсказка под полями цены и себестоимости: сколько остаётся с единицы товара.
export function marginHint(price: number, cost: number): string {
  if (price <= 0) return 'Укажите цену продажи'
  if (cost <= 0) return `Прибыль с единицы: ${money(price)} — вся цена`
  const margin = round2(price - cost)
  const percent = Math.round((margin / cost) * 100)
  if (percent <= 0) return `Прибыль с единицы: ${money(margin)} — продажа без наценки`
  return `Прибыль с единицы: ${money(margin)} (наценка ${percent}%)`
}

export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n)
  const n10 = abs % 10
  const n100 = abs % 100
  if (n10 === 1 && n100 !== 11) return one
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few
  return many
}
