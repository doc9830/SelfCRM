import { describe, expect, it } from 'vitest'
import type { Order } from '../types'
import {
  ACTIVE_ORDERS_LINK,
  CLIENTS_ARCHIVE_LINK,
  clientCardBackFromQuery,
  clientLink,
  clientsArchiveFromQuery,
  clientsLink,
  matchesOrderFilter,
  orderFilterFromQuery,
  statisticsLink,
  statisticsPeriodFromQuery,
} from './links'

function makeOrder(partial: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    clientId: null,
    date: new Date(2026, 5, 15, 12).toISOString(),
    status: 'new',
    items: [],
    comment: '',
    ...partial,
  }
}

describe('matchesOrderFilter', () => {
  it('«Все» показывает заказы любого статуса', () => {
    for (const status of ['new', 'in_progress', 'done', 'cancelled'] as const) {
      expect(matchesOrderFilter(makeOrder({ status }), 'all')).toBe(true)
    }
  })

  it('«Активные» — это только новые и в работе', () => {
    expect(matchesOrderFilter(makeOrder({ status: 'new' }), 'active')).toBe(true)
    expect(matchesOrderFilter(makeOrder({ status: 'in_progress' }), 'active')).toBe(true)
    expect(matchesOrderFilter(makeOrder({ status: 'done' }), 'active')).toBe(false)
    expect(matchesOrderFilter(makeOrder({ status: 'cancelled' }), 'active')).toBe(false)
  })

  it('конкретный статус фильтрует строго по нему', () => {
    expect(matchesOrderFilter(makeOrder({ status: 'done' }), 'done')).toBe(true)
    expect(matchesOrderFilter(makeOrder({ status: 'new' }), 'done')).toBe(false)
  })
})

describe('orderFilterFromQuery', () => {
  it('разбирает известные значения', () => {
    expect(orderFilterFromQuery('active')).toBe('active')
    expect(orderFilterFromQuery('in_progress')).toBe('in_progress')
    expect(orderFilterFromQuery('cancelled')).toBe('cancelled')
  })

  it('не зависит от регистра и пробелов', () => {
    expect(orderFilterFromQuery(' Active ')).toBe('active')
  })

  it('для пустого или неизвестного значения возвращает «Все»', () => {
    expect(orderFilterFromQuery(null)).toBe('all')
    expect(orderFilterFromQuery('')).toBe('all')
    expect(orderFilterFromQuery('42')).toBe('all')
  })
})

describe('statisticsPeriodFromQuery', () => {
  it('разбирает известные периоды', () => {
    expect(statisticsPeriodFromQuery('month')).toBe('month')
    expect(statisticsPeriodFromQuery('week')).toBe('week')
    expect(statisticsPeriodFromQuery('custom')).toBe('custom')
  })

  it('для пустого или неизвестного значения возвращает null', () => {
    expect(statisticsPeriodFromQuery(null)).toBeNull()
    expect(statisticsPeriodFromQuery('')).toBeNull()
    expect(statisticsPeriodFromQuery('век')).toBeNull()
  })
})

describe('ссылки с главного экрана', () => {
  it('ведёт к активным заказам', () => {
    expect(ACTIVE_ORDERS_LINK).toBe('/orders?filter=active')
  })

  it('ведёт в статистику за месяц', () => {
    expect(statisticsLink('month')).toBe('/statistics?period=month')
  })
})

describe('clientsArchiveFromQuery', () => {
  it('включает архив для 1 и true', () => {
    expect(clientsArchiveFromQuery('1')).toBe(true)
    expect(clientsArchiveFromQuery(' true ')).toBe(true)
  })

  it('для пустого и неизвестного значения показывает активных', () => {
    expect(clientsArchiveFromQuery(null)).toBe(false)
    expect(clientsArchiveFromQuery('')).toBe(false)
    expect(clientsArchiveFromQuery('0')).toBe(false)
    expect(clientsArchiveFromQuery('архив')).toBe(false)
  })
})

describe('ссылки архива клиентов', () => {
  it('переключатель в шапке ведёт в архив и обратно', () => {
    expect(clientsLink(true)).toBe(CLIENTS_ARCHIVE_LINK)
    expect(clientsLink(true)).toBe('/clients?archive=1')
    expect(clientsLink(false)).toBe('/clients')
  })

  it('карточка архивного клиента помнит, что возврат — в архив', () => {
    expect(clientLink('c1', true)).toBe('/clients/c1?from=archive')
    expect(clientLink('c1')).toBe('/clients/c1')
    expect(clientCardBackFromQuery('archive')).toBe('/clients?archive=1')
    expect(clientCardBackFromQuery(null)).toBe('/clients')
  })
})
