import { describe, expect, it } from 'vitest'
import { buildRouteUri, buildTelUri } from './navigation'

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
