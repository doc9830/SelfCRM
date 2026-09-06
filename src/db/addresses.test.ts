import { describe, expect, it } from 'vitest'
import {
  demoAddresses,
  loadAddresses,
  parseAddresses,
  saveAddresses,
  searchAddresses,
} from './addresses'
import { MemoryStore } from './kvstore'

describe('searchAddresses', () => {
  it('находит адрес по подстроке', () => {
    const res = searchAddresses('тверская', demoAddresses)
    expect(res.length).toBeGreaterThan(0)
    expect(res[0].address.toLowerCase()).toContain('тверская')
  })

  it('находит по кадастровому номеру', () => {
    const res = searchAddresses('78:31', demoAddresses)
    expect(res.length).toBeGreaterThan(0)
    expect(res.every((r) => r.cadastralNumber.includes('78:31'))).toBe(true)
  })

  it('возвращает пустой список для пустого запроса', () => {
    expect(searchAddresses('', demoAddresses)).toEqual([])
  })

  it('ставит совпадение по началу адреса выше', () => {
    const res = searchAddresses('москва', demoAddresses)
    expect(res.length).toBeGreaterThan(0)
    expect(res[0].address.toLowerCase()).toContain('москва')
  })
})

describe('loadAddresses / saveAddresses / parseAddresses', () => {
  it('возвращает демо-набор, если база не задана', () => {
    expect(loadAddresses(new MemoryStore())).toEqual(demoAddresses)
  })

  it('сохраняет и загружает пользовательскую базу', () => {
    const store = new MemoryStore()
    const custom = [{ id: 'x1', cadastralNumber: '1:1:1', address: 'Тест', lat: 1, lng: 2 }]
    saveAddresses(custom, store)
    expect(loadAddresses(store)).toEqual(custom)
  })

  it('парсит и валидирует JSON-массив', () => {
    const parsed = parseAddresses(
      JSON.stringify([
        { cadastralNumber: '11:22:3333', address: 'г. Тест, ул. 1, д. 1', lat: 55, lng: 37 },
        { address: 'Без координат', cadastralNumber: '', lat: 'x', lng: 'y' },
      ]),
    )
    expect(parsed).toHaveLength(2)
    expect(parsed[0].lat).toBe(55)
    expect(parsed[1].lat).toBe(0)
  })

  it('выбрасывает ошибку на не-массив', () => {
    expect(() => parseAddresses('{}')).toThrow()
  })
})
