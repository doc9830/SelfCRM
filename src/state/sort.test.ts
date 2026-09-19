import { describe, expect, it } from 'vitest'
import { SORT_SCOPES, getSortScope, sortScopeForRoute } from './SortContext'

describe('sortScopeForRoute', () => {
  it('определяет экраны-списки', () => {
    expect(sortScopeForRoute(['orders'])).toBe('orders')
    expect(sortScopeForRoute(['products'])).toBe('products')
  })

  it('возвращает null для вложенных маршрутов и экранов без сортировки', () => {
    expect(sortScopeForRoute(['orders', 'new'])).toBeNull()
    expect(sortScopeForRoute(['orders', 'abc'])).toBeNull()
    expect(sortScopeForRoute(['settings'])).toBeNull()
    expect(sortScopeForRoute([])).toBeNull()
  })
})

describe('SORT_SCOPES', () => {
  it('каждый набор содержит значение по умолчанию среди вариантов', () => {
    for (const [scope, config] of Object.entries(SORT_SCOPES)) {
      const values = config.options.map((option) => option.value)
      expect(values, scope).toContain(config.fallback)
      expect(new Set(values).size, scope).toBe(values.length)
      expect(config.options.length, scope).toBeGreaterThan(1)
    }
  })

  it('getSortScope возвращает undefined для неизвестного экрана', () => {
    expect(getSortScope('unknown')).toBeUndefined()
    expect(getSortScope('orders')?.fallback).toBe('date-desc')
  })
})
