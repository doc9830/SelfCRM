import { describe, expect, it } from 'vitest'
import { MemoryStore, type KVStore } from '../db/kvstore'
import {
  countDiagnosticTap,
  DIAGNOSTIC_TAPS,
  readDiagnosticsOpen,
  writeDiagnosticsOpen,
} from './diagnostics'

describe('countDiagnosticTap', () => {
  it('открывает диагностику на пятом нажатии подряд', () => {
    let taps = 0
    for (let tap = 1; tap < DIAGNOSTIC_TAPS; tap += 1) {
      const step = countDiagnosticTap(taps)
      expect(step.open).toBe(false)
      taps = step.taps
    }
    expect(countDiagnosticTap(taps)).toEqual({ taps: 0, open: true })
  })

  it('начинает счёт заново после открытия', () => {
    expect(countDiagnosticTap(0)).toEqual({ taps: 1, open: false })
    expect(countDiagnosticTap(DIAGNOSTIC_TAPS - 1)).toEqual({ taps: 0, open: true })
  })

  it('сбрасывает счётчик на каждом нажатии, пока открытия не было', () => {
    let taps = 0
    for (let tap = 0; tap < 20; tap += 1) taps = countDiagnosticTap(taps).taps
    expect(taps).toBe(0)
  })
})

describe('readDiagnosticsOpen / writeDiagnosticsOpen', () => {
  it('по умолчанию карточка напоминаний скрыта', () => {
    expect(readDiagnosticsOpen(new MemoryStore())).toBe(false)
  })

  it('запоминает открытую диагностику', () => {
    const store = new MemoryStore()
    writeDiagnosticsOpen(true, store)
    expect(readDiagnosticsOpen(store)).toBe(true)
  })

  it('«Скрыть» возвращает настройки к обычному виду', () => {
    const store = new MemoryStore()
    writeDiagnosticsOpen(true, store)
    writeDiagnosticsOpen(false, store)
    expect(readDiagnosticsOpen(store)).toBe(false)
  })

  it('не падает, если хранилище недоступно', () => {
    const broken: KVStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('приватный режим')
      },
      removeItem: () => undefined,
    }
    expect(() => writeDiagnosticsOpen(true, broken)).not.toThrow()
    expect(readDiagnosticsOpen(broken)).toBe(false)
  })
})
