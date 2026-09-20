// Маски ввода для числовых полей и телефона. Используются компонентами
// PhoneInput / IntegerInput / MoneyInput из components/ui.tsx.
//
// Маска — чистая функция «строка на входе → допустимая строка на выходе».
// Экраны получают уже очищенное значение, поэтому буквы, минусы и лишние
// разделители не попадают ни в состояние формы, ни в базу.

// ----- Телефон -----

// Российский номер: 11 цифр с кодом страны или 10 без кода. Столько же цифр
// допускает маска, чтобы номер нельзя было «перерастить».
export const PHONE_MAX_DIGITS = 11

// Оформление номера: пробелы, скобки и дефис. Их пропускаем как есть —
// номер читается человеком, а цифр в нём по-прежнему не больше 11.
const PHONE_FORMAT_CHARS = ' ()-'

// Общий предел длины строки: 11 цифр плюс оформление.
const PHONE_MAX_CHARS = 20

export function sanitizePhone(value: string, maxDigits = PHONE_MAX_DIGITS): string {
  let result = ''
  let digits = 0
  for (const char of value) {
    if (result.length >= PHONE_MAX_CHARS) break

    if (char === '+') {
      // «+» бывает только в самом начале — дальше это уже опечатка.
      if (result === '') result += char
      continue
    }

    if (char >= '0' && char <= '9') {
      if (digits >= maxDigits) continue
      digits += 1
      result += char
      continue
    }

    if (PHONE_FORMAT_CHARS.includes(char)) {
      // Оформление начинается только после «+» или первой цифры: иначе в поле
      // оставался бы одинокий пробел.
      if (result === '') continue
      result += char
    }
  }
  return result
}

export function phoneDigitsCount(value: string): number {
  return value.replace(/\D/g, '').length
}

// Телефон необязателен: пустое значение считаем верным. Если номер введён, в
// нём допускаются только цифры и оформление, а самих цифр должно быть 10 или
// 11 — столько же принимает openTel из utils/navigation.ts.
export function isPhoneValid(value: string): boolean {
  if (/[^0-9+\s()-]/.test(value)) return false
  const digits = phoneDigitsCount(value)
  return digits === 0 || digits === PHONE_MAX_DIGITS || digits === PHONE_MAX_DIGITS - 1
}

// ----- Целые числа (количество, остаток, ИНН, ОГРН, КПП) -----

// Максимум для количеств и остатков: больше девяти цифр в остатке всё равно
// не бывает, а строка остаётся короткой и предсказуемой.
export const INT_MAX_DIGITS = 9

// Реквизиты исполнителя проверяются по длине: значения подставляются в чек PDF.
export const INN_LENGTHS = [10, 12]
export const OGRN_LENGTHS = [13, 15]
export const KPP_LENGTHS = [9]

export function sanitizeInteger(value: string, maxDigits = INT_MAX_DIGITS): string {
  let result = ''
  for (const char of value) {
    if (char < '0' || char > '9') continue
    if (result.length >= maxDigits) break
    result += char
  }
  return result
}

// Пустое значение допустимо (реквизит необязателен), иначе количество цифр
// должно быть одним из разрешённых.
export function hasValidDigitLength(value: string, lengths: number[]): boolean {
  return value === '' || lengths.includes(value.length)
}

// ----- Деньги и количества с дробной частью -----

export const MONEY_MAX_INT_DIGITS = 9
export const MONEY_MAX_FRACTION_DIGITS = 2

// «1234,5» и «1234.5» приводятся к «1234.5»: в русской раскладке на
// цифровой клавиатуре разделитель — запятая, а Number() понимает только точку.
export function sanitizeMoney(
  value: string,
  maxIntDigits = MONEY_MAX_INT_DIGITS,
  maxFractionDigits = MONEY_MAX_FRACTION_DIGITS,
): string {
  let whole = ''
  let fraction = ''
  let hasSeparator = false

  for (const char of value) {
    if (char === '.' || char === ',') {
      // Разделитель только один, и он всегда после целой части: «,5» → «0.5».
      if (hasSeparator) continue
      if (whole === '') whole = '0'
      hasSeparator = true
      continue
    }

    if (char < '0' || char > '9') continue

    if (hasSeparator) {
      if (fraction.length >= maxFractionDigits) continue
      fraction += char
    } else if (whole.length < maxIntDigits) {
      whole += char
    }
  }

  return hasSeparator ? `${whole}.${fraction}` : whole
}
