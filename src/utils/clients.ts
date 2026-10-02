// Теги клиентов: короткие подписи вроде «Оптовик» или «Должник», по которым клиента
// находят в списке. Тег живёт в самой карточке (`Client.tags`) — отдельного справочника
// нет: набор тегов складывается из того, что уже проставлено в базе.
import type { Client } from '../types'

// Готовые подписи для карточки клиента: частые случаи не нужно набирать руками,
// но список не закрытый — свой тег вводится текстом.
export const CLIENT_TAG_SUGGESTIONS = ['Оптовик', 'Розница', 'Должник', 'Новый', 'VIP', 'Партнёр']

// Длина подписи: тег должен читаться в чипе фильтра и в строке списка.
export const CLIENT_TAG_MAX_LENGTH = 24

/**
 * Приводит ввод к виду тега: пробелы по краям и внутри подрезаются до одного,
 * длина ограничена. Пустой ввод — не тег, поэтому возвращается null.
 */
export function normalizeClientTag(value: string): string | null {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CLIENT_TAG_MAX_LENGTH)
    .trim()
  return text || null
}

/**
 * Список тегов без пустых значений и повторов. Повторы сравниваются без учёта регистра:
 * «Оптовик» и «оптовик» — один тег, и в фильтре он показан один раз.
 */
export function normalizeClientTags(tags?: string[] | null): string[] {
  const result: string[] = []
  for (const tag of tags ?? []) {
    const normalized = normalizeClientTag(tag)
    if (!normalized) continue
    if (result.some((item) => sameClientTag(item, normalized))) continue
    result.push(normalized)
  }
  return result
}

/** Один и тот же тег: сравнение подписей без учёта регистра. */
export function sameClientTag(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Добавляет тег: повтор (в любом регистре) список не меняет. */
export function addClientTag(tags: string[] | undefined, value: string): string[] {
  const normalized = normalizeClientTag(value)
  const current = normalizeClientTags(tags)
  if (!normalized || current.some((item) => sameClientTag(item, normalized))) return current
  return [...current, normalized]
}

/** Убирает тег по подписи: сравнение без учёта регистра. */
export function removeClientTag(tags: string[] | undefined, value: string): string[] {
  const normalized = normalizeClientTag(value)
  if (!normalized) return normalizeClientTags(tags)
  return normalizeClientTags(tags).filter((item) => !sameClientTag(item, normalized))
}

/**
 * Теги всех переданных клиентов — из них собираются чипы фильтра в списке.
 * По алфавиту: так порядок чипов не зависит от того, кто раньше попал в базу.
 */
export function collectClientTags(clients: Client[]): string[] {
  const tags: string[] = []
  for (const client of clients) {
    for (const tag of normalizeClientTags(client.tags)) {
      if (!tags.some((item) => sameClientTag(item, tag))) tags.push(tag)
    }
  }
  return tags.sort((a, b) => a.localeCompare(b, 'ru'))
}

/** Подходит ли клиент фильтру по тегу. Без тега фильтр пропускает всех. */
export function clientHasTag(client: Client, tag: string | null): boolean {
  const normalized = normalizeClientTag(tag ?? '')
  if (!normalized) return true
  return normalizeClientTags(client.tags).some((item) => sameClientTag(item, normalized))
}

/** Клиенты с выбранным тегом; без тега — весь список как есть. */
export function filterClientsByTag(clients: Client[], tag: string | null): Client[] {
  const normalized = normalizeClientTag(tag ?? '')
  if (!normalized) return clients
  return clients.filter((client) => clientHasTag(client, normalized))
}
