import { describe, expect, it } from 'vitest'
import {
  INT_MAX_DIGITS,
  isPhoneValid,
  phoneDigitsCount,
  sanitizeInteger,
  sanitizeMoney,
  sanitizePhone,
  hasValidDigitLength,
  INN_LENGTHS,
} from './input'

describe('sanitizePhone', () => {
  it('оставляет цифры и оформление номера', () => {
    expect(sanitizePhone('+7 916 204-18-73')).toBe('+7 916 204-18-73')
  })

  it('выбрасывает буквы', () => {
    expect(sanitizePhone('8abc916')).toBe('8916')
  })

  it('добавляет плюс только в начале', () => {
    expect(sanitizePhone('+7+9+1')).toBe('+791')
  })

  it('не даёт ввести больше одиннадцати цифр', () => {
    expect(sanitizePhone('+7 916 204-18-73 99')).toBe('+7 916 204-18-73 ')
    expect(phoneDigitsCount(sanitizePhone('999999999999'))).toBe(11)
  })

  it('из пустой строки получается пустая строка', () => {
    expect(sanitizePhone('')).toBe('')
  })

  it('не оставляет одинокий пробел в начале', () => {
    expect(sanitizePhone('  +7 916')).toBe('+7 916')
    expect(sanitizePhone('абв Привет')).toBe('')
  })
})

describe('isPhoneValid', () => {
  it('пустой номер допустим: поле необязательное', () => {
    expect(isPhoneValid('')).toBe(true)
    expect(isPhoneValid('   ')).toBe(true)
  })

  it('принимает десять и одиннадцать цифр', () => {
    expect(isPhoneValid('9162041873')).toBe(true)
    expect(isPhoneValid('+7 916 204-18-73')).toBe(true)
  })

  it('отклоняет недобранный номер', () => {
    expect(isPhoneValid('+7 916 204-18')).toBe(false)
    expect(isPhoneValid('позвонить вечером')).toBe(false)
  })
})

describe('sanitizeInteger', () => {
  it('оставляет только цифры', () => {
    expect(sanitizeInteger('1-2a3')).toBe('123')
  })

  it('ограничивает длину значением по умолчанию', () => {
    expect(sanitizeInteger('1234567890123')).toHaveLength(INT_MAX_DIGITS)
  })

  it('для ИНН хватает двенадцати цифр', () => {
    expect(sanitizeInteger('770512345678', 12)).toBe('770512345678')
  })
})

describe('hasValidDigitLength', () => {
  it('пустое значение допустимо', () => {
    expect(hasValidDigitLength('', INN_LENGTHS)).toBe(true)
  })

  it('проверяет длину по списку', () => {
    expect(hasValidDigitLength('7705123456', INN_LENGTHS)).toBe(true)
    expect(hasValidDigitLength('770512345678', INN_LENGTHS)).toBe(true)
    expect(hasValidDigitLength('77051234', INN_LENGTHS)).toBe(false)
  })
})

describe('sanitizeMoney', () => {
  it('запятую превращает в точку: так понимает Number()', () => {
    expect(sanitizeMoney('1234,5')).toBe('1234.5')
  })

  it('оставляет не больше двух знаков после разделителя', () => {
    expect(sanitizeMoney('10.999')).toBe('10.99')
  })

  it('пропускает только один разделитель', () => {
    expect(sanitizeMoney('1.2.3')).toBe('1.23')
  })

  it('разделитель в начале превращает в «0.»', () => {
    expect(sanitizeMoney(',5')).toBe('0.5')
  })

  it('сохраняет незакрытую дробную часть', () => {
    expect(sanitizeMoney('12.')).toBe('12.')
  })

  it('выбрасывает буквы и минусы', () => {
    expect(sanitizeMoney('-12abc')).toBe('12')
  })

  it('ограничивает целую часть', () => {
    expect(sanitizeMoney('1234567890123')).toHaveLength(9)
  })
})
