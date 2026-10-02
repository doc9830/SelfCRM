import { describe, expect, it } from 'vitest'
import type { Client } from '../types'
import {
  CLIENT_TAG_MAX_LENGTH,
  addClientTag,
  clientHasTag,
  collectClientTags,
  filterClientsByTag,
  normalizeClientTag,
  normalizeClientTags,
  removeClientTag,
  sameClientTag,
} from './clients'

function makeClient(partial: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    name: 'Иван Петров',
    phone: '',
    email: '',
    comment: '',
    createdAt: new Date(2026, 8, 19).toISOString(),
    ...partial,
  }
}

describe('Теги клиентов: ввод', () => {
  it('подрезает пробелы и приводит внутренние к одному', () => {
    expect(normalizeClientTag('  Оптовик  ')).toBe('Оптовик')
    expect(normalizeClientTag('важный   клиент')).toBe('важный клиент')
  })

  it('пустой ввод тегом не считается', () => {
    expect(normalizeClientTag('')).toBeNull()
    expect(normalizeClientTag('   ')).toBeNull()
  })

  it('обрезает слишком длинную подпись', () => {
    expect(normalizeClientTag('т'.repeat(CLIENT_TAG_MAX_LENGTH + 10))).toBe(
      'т'.repeat(CLIENT_TAG_MAX_LENGTH),
    )
  })

  it('проверяет один и тот же тег без учёта регистра', () => {
    expect(sameClientTag('Оптовик', 'оптовик ')).toBe(true)
    expect(sameClientTag('Оптовик', 'Должник')).toBe(false)
  })
})

describe('Теги клиентов: список', () => {
  it('убирает пустые значения и повторы', () => {
    expect(normalizeClientTags(['Оптовик', '', '  ', 'оптовик', 'Должник'])).toEqual([
      'Оптовик',
      'Должник',
    ])
  })

  it('добавляет новый тег и не добавляет повтор', () => {
    expect(addClientTag([], 'Оптовик')).toEqual(['Оптовик'])
    expect(addClientTag(['Оптовик'], 'оптовик')).toEqual(['Оптовик'])
    expect(addClientTag(['Оптовик'], '  ')).toEqual(['Оптовик'])
    expect(addClientTag(undefined, 'Новый')).toEqual(['Новый'])
  })

  it('убирает тег по подписи в любом регистре', () => {
    expect(removeClientTag(['Оптовик', 'Должник'], 'оптовик')).toEqual(['Должник'])
    expect(removeClientTag(['Оптовик'], 'нет такого')).toEqual(['Оптовик'])
  })
})

describe('Теги клиентов: фильтр списка', () => {
  const clients = [
    makeClient({ id: 'c1', name: 'Опт Торг', tags: ['Оптовик'] }),
    makeClient({ id: 'c2', name: 'Иван', tags: ['Должник', 'Новый'] }),
    makeClient({ id: 'c3', name: 'Пётр' }),
  ]

  it('собирает теги по алфавиту и без повторов', () => {
    expect(collectClientTags(clients)).toEqual(['Должник', 'Новый', 'Оптовик'])
  })

  it('фильтрует клиентов по тегу', () => {
    expect(filterClientsByTag(clients, 'оптовик').map((c) => c.id)).toEqual(['c1'])
    expect(filterClientsByTag(clients, 'Новый').map((c) => c.id)).toEqual(['c2'])
  })

  it('без тега возвращает весь список', () => {
    expect(filterClientsByTag(clients, null)).toHaveLength(3)
    expect(filterClientsByTag(clients, '  ')).toHaveLength(3)
  })

  it('клиент с тегом проверяется без учёта регистра', () => {
    expect(clientHasTag(clients[0], 'оптовик')).toBe(true)
    expect(clientHasTag(clients[0], 'Должник')).toBe(false)
    expect(clientHasTag(clients[2], null)).toBe(true)
  })
})
