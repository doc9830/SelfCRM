import { describe, expect, it, vi } from 'vitest'
import { toAddressEntries, type DadataSuggestion } from './dadata'

describe('toAddressEntries', () => {
  it('преобразует подсказку в запись с координатами и кадастровым номером', () => {
    const suggestions: DadataSuggestion[] = [
      {
        value: 'г Москва, ул Сухонская, д 11',
        data: {
          geo_lat: '55.878414',
          geo_lon: '37.653108',
          fias_id: 'f26b876b-6857-4951-b060-ec6559f04a9a',
          house_cadnum: '77:02:0014011:1070',
        },
      },
    ]

    const entries = toAddressEntries(suggestions)

    expect(entries).toHaveLength(1)
    expect(entries[0].address).toBe('г Москва, ул Сухонская, д 11')
    expect(entries[0].cadastralNumber).toBe('77:02:0014011:1070')
    expect(entries[0].lat).toBeCloseTo(55.878414)
    expect(entries[0].lng).toBeCloseTo(37.653108)
    expect(entries[0].id).toBe('f26b876b-6857-4951-b060-ec6559f04a9a')
  })

  it('при отсутствии кадастрового номера дома берёт номер квартиры', () => {
    const entries = toAddressEntries([
      { value: 'г Москва, ул Тверская, д 1, кв 5', data: { flat_cadnum: '77:01:0001001:999' } },
    ])
    expect(entries[0].cadastralNumber).toBe('77:01:0001001:999')
  })

  it('без данных подставляет 0 и пустую строку', () => {
    const entries = toAddressEntries([{ value: 'г Москва', data: null }])
    expect(entries[0].cadastralNumber).toBe('')
    expect(entries[0].lat).toBe(0)
    expect(entries[0].lng).toBe(0)
    expect(entries[0].id).toContain('dadata-')
  })

  it('пустой/неопределённый список даёт пустой результат', () => {
    expect(toAddressEntries([])).toEqual([])
    expect(toAddressEntries(undefined as unknown as DadataSuggestion[])).toEqual([])
  })
})

describe('suggestAddresses без ключа', () => {
  it('не обращается к сервису и сообщает об отсутствии ключа', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_DADATA_TOKEN', '')

    const mod = await import('./dadata')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    expect(mod.hasDadataToken()).toBe(false)
    await expect(mod.suggestAddresses('г Москва, ул Тверская')).rejects.toThrow(/not configured/)
    expect(fetchSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('пустой запрос не требует ключа и не делает сетевых вызовов', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_DADATA_TOKEN', '')

    const mod = await import('./dadata')
    await expect(mod.suggestAddresses('   ')).resolves.toEqual([])

    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
