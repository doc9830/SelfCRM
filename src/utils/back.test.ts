import { describe, expect, it } from 'vitest'
import { parseRoute } from '../router'
import { backTarget, headerBackTarget } from './back'

const route = (hash: string) => parseRoute(hash)

describe('headerBackTarget — куда ведёт стрелочка в шапке', () => {
  it('с карточки клиента — к списку клиентов', () => {
    expect(headerBackTarget(route('/clients/42'))).toBe('/clients')
  })

  it('с архивного клиента — в архив', () => {
    expect(headerBackTarget(route('/clients/42?from=archive'))).toBe('/clients?archive=1')
  })

  it('с карточки заказа и с нового заказа — к списку заказов', () => {
    expect(headerBackTarget(route('/orders/7'))).toBe('/orders')
    expect(headerBackTarget(route('/orders/new?client=1'))).toBe('/orders')
  })

  it('с движения товара — на склад', () => {
    expect(headerBackTarget(route('/stock/3'))).toBe('/stock')
  })

  it('со статистики — на главную', () => {
    expect(headerBackTarget(route('/statistics?period=month'))).toBe('/')
  })

  it('со списка «К оплате» — на главную', () => {
    expect(headerBackTarget(route('/debt'))).toBe('/')
  })

  it('с обратной связи — в настройки', () => {
    expect(headerBackTarget(route('/feedback'))).toBe('/settings')
    expect(headerBackTarget(route('/feedback?topic=bug'))).toBe('/settings')
  })

  it('на верхнем уровне раздела стрелочки нет', () => {
    expect(headerBackTarget(route('/'))).toBeNull()
    expect(headerBackTarget(route('/clients'))).toBeNull()
    expect(headerBackTarget(route('/clients?archive=1'))).toBeNull()
    expect(headerBackTarget(route('/orders'))).toBeNull()
    expect(headerBackTarget(route('/products'))).toBeNull()
    expect(headerBackTarget(route('/stock'))).toBeNull()
    expect(headerBackTarget(route('/settings'))).toBeNull()
  })
})

describe('backTarget — куда ведёт системная кнопка «Назад» на Android', () => {
  it('на вложенных экранах повторяет стрелочку', () => {
    expect(backTarget(route('/clients/42'))).toBe('/clients')
    expect(backTarget(route('/clients/42?from=archive'))).toBe('/clients?archive=1')
    expect(backTarget(route('/orders/7'))).toBe('/orders')
    expect(backTarget(route('/stock/3'))).toBe('/stock')
    expect(backTarget(route('/statistics'))).toBe('/')
    expect(backTarget(route('/feedback'))).toBe('/settings')
  })

  it('с разделов верхнего уровня возвращает на главную', () => {
    expect(backTarget(route('/clients'))).toBe('/')
    expect(backTarget(route('/orders'))).toBe('/')
    expect(backTarget(route('/products'))).toBe('/')
    expect(backTarget(route('/stock'))).toBe('/')
    expect(backTarget(route('/settings'))).toBe('/')
  })

  it('из архива клиентов возвращает к активным, а не на главную', () => {
    expect(backTarget(route('/clients?archive=1'))).toBe('/clients')
    expect(backTarget(route('/clients?archive=true'))).toBe('/clients')
  })

  it('на главной идти некуда — там выход по второму нажатию', () => {
    expect(backTarget(route('/'))).toBeNull()
    expect(backTarget(route(''))).toBeNull()
  })
})
