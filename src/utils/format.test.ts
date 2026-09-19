import { describe, expect, it } from 'vitest'
import { formatShortDate, marginHint, money } from './format'

describe('formatShortDate', () => {
  const now = new Date(2026, 9, 1)

  it('в текущем году показывает день и месяц', () => {
    expect(formatShortDate(new Date(2026, 8, 19, 12).toISOString(), now)).toBe('19.09')
  })

  it('для другого года добавляет год', () => {
    expect(formatShortDate(new Date(2025, 8, 19, 12).toISOString(), now)).toBe('19.09.25')
  })

  it('нечитаемую дату заменяет прочерком', () => {
    expect(formatShortDate('не дата', now)).toBe('—')
  })
})

describe('marginHint', () => {
  it('без цены просит её указать', () => {
    expect(marginHint(0, 0)).toBe('Укажите цену продажи')
  })

  it('без себестоимости считает прибылью всю цену', () => {
    expect(marginHint(1200, 0)).toContain(money(1200))
  })

  it('с себестоимостью показывает прибыль и наценку', () => {
    const hint = marginHint(1200, 750)
    expect(hint).toContain(money(450))
    expect(hint).toContain('наценка 60%')
  })

  it('предупреждает о продаже без наценки', () => {
    expect(marginHint(100, 120)).toContain('без наценки')
  })
})
