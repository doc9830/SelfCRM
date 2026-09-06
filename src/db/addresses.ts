// Локальная база адресов (данные кадастра).
//
// Полноценная выгрузка Росреестра/ФИАС слишком велика для поставки в комплекте,
// поэтому в приложении — демо-набор записей, а реальную базу можно загрузить вручную
// (см. Settings → Адреса или функции importAddresses/parseAddresses ниже).
// Формат записи универсален: кадастровый номер, полный адрес и координаты,
// по которым строится маршрут.

import { uid } from '../utils/id'
import { localStorageStore, type KVStore } from './kvstore'

export interface AddressEntry {
  id: string
  cadastralNumber: string
  address: string
  lat: number
  lng: number
}

const ADDRESSES_KEY = 'selfcrm:addresses'

// Демо-набор для разработки и тестов. Координаты — реальные ориентиры.
export const demoAddresses: AddressEntry[] = [
  { id: 'addr-01', cadastralNumber: '77:01:0001001:101', address: 'г. Москва, ул. Тверская, д. 1', lat: 55.7617, lng: 37.6106 },
  { id: 'addr-02', cadastralNumber: '77:01:0001001:102', address: 'г. Москва, ул. Арбат, д. 12', lat: 55.7491, lng: 37.5905 },
  { id: 'addr-03', cadastralNumber: '77:04:0002001:201', address: 'г. Москва, Ленинский проспект, д. 45', lat: 55.7072, lng: 37.5772 },
  { id: 'addr-04', cadastralNumber: '78:31:0003001:301', address: 'г. Санкт-Петербург, Невский проспект, д. 25', lat: 59.9351, lng: 30.3253 },
  { id: 'addr-05', cadastralNumber: '78:31:0003001:302', address: 'г. Санкт-Петербург, наб. реки Мойки, д. 40', lat: 59.9301, lng: 30.3145 },
  { id: 'addr-06', cadastralNumber: '78:31:0003001:303', address: 'г. Санкт-Петербург, ул. Большая Морская, д. 8', lat: 59.9359, lng: 30.3109 },
  { id: 'addr-07', cadastralNumber: '16:50:0004001:401', address: 'г. Казань, ул. Баумана, д. 20', lat: 55.7897, lng: 49.1224 },
  { id: 'addr-08', cadastralNumber: '16:50:0004001:402', address: 'г. Казань, проспект Победы, д. 100', lat: 55.7421, lng: 49.2117 },
  { id: 'addr-09', cadastralNumber: '54:35:0005001:501', address: 'г. Новосибирск, Красный проспект, д. 25', lat: 55.0274, lng: 82.9234 },
  { id: 'addr-10', cadastralNumber: '54:35:0005001:502', address: 'г. Новосибирск, ул. Ленина, д. 5', lat: 55.0316, lng: 82.9213 },
  { id: 'addr-11', cadastralNumber: '66:41:0006001:601', address: 'г. Екатеринбург, ул. Ленина, д. 1', lat: 56.8389, lng: 60.6057 },
  { id: 'addr-12', cadastralNumber: '66:41:0006001:602', address: 'г. Екатеринбург, проспект Ленина, д. 39', lat: 56.8476, lng: 60.6227 },
  { id: 'addr-13', cadastralNumber: '52:18:0007001:701', address: 'г. Нижний Новгород, ул. Большая Покровская, д. 3', lat: 56.3272, lng: 44.0065 },
  { id: 'addr-14', cadastralNumber: '23:43:0008001:801', address: 'г. Краснодар, ул. Красная, д. 100', lat: 45.0392, lng: 38.9871 },
  { id: 'addr-15', cadastralNumber: '63:01:0009001:901', address: 'г. Самара, ул. Куйбышева, д. 90', lat: 53.1955, lng: 50.1018 },
  { id: 'addr-16', cadastralNumber: '59:01:0010001:1001', address: 'г. Пермь, Комсомольский проспект, д. 27', lat: 58.0069, lng: 56.2352 },
  { id: 'addr-17', cadastralNumber: '02:55:0011001:1101', address: 'г. Уфа, ул. Ленина, д. 65', lat: 54.7302, lng: 55.9478 },
  { id: 'addr-18', cadastralNumber: '74:36:0012001:1201', address: 'г. Челябинск, ул. Кирова, д. 12', lat: 55.1599, lng: 61.4026 },
]

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
}

// Поиск по адресу или кадастровому номеру. Возвращает до `limit` совпадений,
// отсортированных по релевантности (совпадение в начале адреса — выше).
export function searchAddresses(
  query: string,
  source: AddressEntry[] = demoAddresses,
  limit = 8,
): AddressEntry[] {
  const q = normalize(query)
  if (!q) return []

  const scored: Array<{ entry: AddressEntry; score: number; index: number }> = []
  for (const entry of source) {
    const address = normalize(entry.address)
    const cad = normalize(entry.cadastralNumber)
    let score = -1
    let index = -1
    if (address.startsWith(q)) {
      score = 0
      index = 0
    } else if (address.includes(q)) {
      score = 1
      index = address.indexOf(q)
    } else if (cad.includes(q)) {
      score = 2
      index = cad.indexOf(q)
    }
    if (score >= 0) scored.push({ entry, score, index })
  }

  return scored
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((s) => s.entry)
}

// Загружает пользовательскую базу адресов или возвращает демо-набор.
export function loadAddresses(store: KVStore = localStorageStore): AddressEntry[] {
  const raw = store.getItem(ADDRESSES_KEY)
  if (!raw) return demoAddresses
  try {
    const parsed = JSON.parse(raw) as AddressEntry[]
    if (Array.isArray(parsed)) return parsed
  } catch {
    // повреждённые данные игнорируем
  }
  return demoAddresses
}

export function saveAddresses(list: AddressEntry[], store: KVStore = localStorageStore): void {
  store.setItem(ADDRESSES_KEY, JSON.stringify(list))
}

// Парсит и валидирует импортированную базу (JSON-массив записей AddressEntry).
export function parseAddresses(json: string): AddressEntry[] {
  const parsed = JSON.parse(json) as unknown
  if (!Array.isArray(parsed)) throw new Error('База адресов должна быть JSON-массивом')
  return parsed.map((raw, i) => {
    const rec = raw as Partial<AddressEntry>
    if (typeof rec.address !== 'string' || !rec.address.trim()) {
      throw new Error(`Запись ${i + 1}: не указан адрес`)
    }
    const lat = Number(rec.lat)
    const lng = Number(rec.lng)
    return {
      id: typeof rec.id === 'string' && rec.id ? rec.id : uid(),
      cadastralNumber: typeof rec.cadastralNumber === 'string' ? rec.cadastralNumber : '',
      address: rec.address.trim(),
      lat: Number.isFinite(lat) ? lat : 0,
      lng: Number.isFinite(lng) ? lng : 0,
    }
  })
}
