// Клиент подсказок Дадаты (suggest/address).
//
// Метод clean/address («стандартизация») Дадата запрещает вызывать из браузера:
// он требует секретный ключ (X-Secret) и не отдаёт CORS. Для автодополнения
// используется suggest/address — достаточно только API-ключа (токена), который
// и так виден в клиентском коде (Дадата позволяет ограничивать его по доменам).
//
// suggest/address возвращает кадастровый номер дома (house_cadnum) и координаты
// (geo_lat/geo_lon) — ровно то, что нужно для карточки клиента и маршрута.

import type { AddressEntry } from '../db/addresses'

const SUGGEST_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address'

// API-ключ (токен) подсказок. В исходниках не хранится: подставляется на этапе сборки
// переменной окружения VITE_DADATA_TOKEN (локально — файл .env.local, который не коммитится;
// для CI/Pages — секрет репозитория). Так ключ не попадает в публичный код проекта, но
// остаётся в собранном приложении — сервис работает у пользователя «из коробки»,
// собственный ключ вводить не нужно. Секретный ключ (X-Secret) здесь не используется
// и не должен попадать в клиент.
const API_KEY: string = ((import.meta.env.VITE_DADATA_TOKEN as string | undefined) ?? '').trim()

// Есть ли ключ в текущей сборке. Если нет (например, сборка без .env.local),
// автодополнение адресов работает по локальной базе (см. components/AddressField.tsx).
export function hasDadataToken(): boolean {
  return API_KEY.length > 0
}

export interface DadataSuggestionData {
  geo_lat?: string | null
  geo_lon?: string | null
  fias_id?: string | null
  house_cadnum?: string | null
  flat_cadnum?: string | null
  postal_code?: string | null
  qc_geo?: number | null
}

export interface DadataSuggestion {
  value: string
  unrestricted_value?: string
  data?: DadataSuggestionData | null
}

export interface DadataSuggestResponse {
  suggestions?: DadataSuggestion[]
}

function toNumber(value: string | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// Преобразует ответ Дадаты в записи AddressEntry (единый формат для карточки клиента).
// Кадастровый номер берётся из house_cadnum (номер дома) с фолбэком на flat_cadnum.
export function toAddressEntries(suggestions: DadataSuggestion[]): AddressEntry[] {
  return (suggestions ?? []).map((s, i) => {
    const d = s.data
    return {
      id: d?.fias_id || `dadata-${i}-${s.value}`,
      cadastralNumber: (d?.house_cadnum ?? d?.flat_cadnum ?? '').trim(),
      address: (s.value ?? '').trim(),
      lat: toNumber(d?.geo_lat),
      lng: toNumber(d?.geo_lon),
    }
  })
}

// Поиск подсказок по адресу. Ограничиваем выборку уровнем дома (from_bound/to_bound),
// чтобы каждая подсказка была полным адресом с координатами и (по возможности)
// кадастровым номером.
export async function suggestAddresses(query: string, count = 8): Promise<AddressEntry[]> {
  const q = query.trim()
  if (!q) return []

  // Сборка без ключа: не обращаемся к сервису, вызывающий код переключается на локальную базу.
  if (!hasDadataToken()) {
    throw new Error('Dadata token is not configured (VITE_DADATA_TOKEN)')
  }

  const response = await fetch(SUGGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Token ${API_KEY}`,
    },
    body: JSON.stringify({
      query: q,
      count,
      from_bound: { value: 'house' },
      to_bound: { value: 'house' },
    }),
  })

  if (!response.ok) {
    throw new Error(`Dadata suggest failed: ${response.status}`)
  }

  const json = (await response.json()) as DadataSuggestResponse
  return toAddressEntries(json.suggestions ?? [])
}
