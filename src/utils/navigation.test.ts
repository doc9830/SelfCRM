import { describe, expect, it } from 'vitest'
import {
  buildRouteUri,
  buildTelUri,
  buildTelegramAppUri,
  buildTelegramUri,
  buildWhatsAppAppUri,
  buildWhatsAppUri,
  openTelegram,
  openWhatsApp,
  phoneDigits,
} from './navigation'

describe('buildRouteUri', () => {
  it('строит geo:-URI с координатами', () => {
    expect(buildRouteUri({ lat: 55.76, lng: 37.61 })).toBe('geo:0,0?q=55.76,37.61')
  })

  it('добавляет подпись к точке', () => {
    expect(buildRouteUri({ lat: 55.76, lng: 37.61, label: 'Home' })).toBe(
      'geo:0,0?q=55.76,37.61(Home)',
    )
  })

  it('передаёт текстовый адрес как поисковый запрос', () => {
    const address = 'г. Москва, ул. Тверская, д. 1'
    expect(buildRouteUri({ lat: 0, lng: 0, address })).toBe(
      `geo:0,0?q=${encodeURIComponent(address)}`,
    )
  })

  it('предпочитает текстовый адрес координатам', () => {
    const address = 'г. Москва, ул. Арбат, д. 12'
    expect(buildRouteUri({ lat: 55.76, lng: 37.61, address })).toBe(
      `geo:0,0?q=${encodeURIComponent(address)}`,
    )
  })

  it('игнорирует пустой адрес и использует координаты', () => {
    expect(buildRouteUri({ lat: 55.76, lng: 37.61, address: '   ' })).toBe(
      'geo:0,0?q=55.76,37.61',
    )
  })
})

describe('buildTelUri', () => {
  it('убирает пробелы, скобки и дефисы, сохраняя ведущий плюс', () => {
    expect(buildTelUri('+7 (900) 000-00-00')).toBe('tel:+79000000000')
  })

  it('сохраняет локальный номер без плюса', () => {
    expect(buildTelUri('8 900 000-00-00')).toBe('tel:89000000000')
  })

  it('для пустой строки возвращает только схему', () => {
    expect(buildTelUri('')).toBe('tel:')
  })
})

describe('мессенджеры', () => {
  it('приводит российский номер к международному виду', () => {
    expect(phoneDigits('8 900 111-22-33')).toBe('79001112233')
    expect(phoneDigits('+7 (900) 111-22-33')).toBe('79001112233')
    expect(phoneDigits('900 111-22-33')).toBe('79001112233')
    expect(phoneDigits('')).toBe('')
  })

  it('строит веб-ссылку Telegram', () => {
    expect(buildTelegramUri('+7 900 111-22-33')).toBe('https://t.me/+79001112233')
  })

  it('строит ссылку приложения Telegram', () => {
    expect(buildTelegramAppUri('8 900 111-22-33')).toBe('tg://resolve?phone=79001112233')
  })

  it('строит веб-ссылку WhatsApp', () => {
    expect(buildWhatsAppUri('8 900 111-22-33')).toBe('https://wa.me/79001112233')
  })

  it('строит ссылку приложения WhatsApp', () => {
    expect(buildWhatsAppAppUri('+7 900 111-22-33')).toBe('whatsapp://send?phone=79001112233')
  })

  it('без номера ничего не открывает', () => {
    expect(() => openTelegram('')).not.toThrow()
    expect(() => openWhatsApp('   ')).not.toThrow()
  })
})
