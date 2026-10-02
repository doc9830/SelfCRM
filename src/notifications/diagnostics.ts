import { localStorageStore, type KVStore } from '../db/kvstore'

// Диагностика напоминаний — разрешения, список запланированного в системе, проверочное
// уведомление — нужна при разборе «напоминания не приходят», а в обычной жизни занимает на
// экране настроек полстраницы. Поэтому карточка «Напоминания» скрыта и открывается пятью
// нажатиями по строке версии в разделе «Обновления»; открытое состояние запоминается, чтобы жест
// не приходилось повторять при каждом запуске.

// Сколько нажатий подряд по строке версии открывают диагностику.
export const DIAGNOSTIC_TAPS = 5

const STORAGE_KEY = 'selfcrm:reminder-diagnostics'

// Правило жеста: на пятом нажатии подряд диагностика открывается, а счёт начинается заново —
// случайные нажатия в разное время её не откроют.
export function countDiagnosticTap(taps: number): { taps: number; open: boolean } {
  const next = taps + 1
  return next >= DIAGNOSTIC_TAPS ? { taps: 0, open: true } : { taps: next, open: false }
}

export function readDiagnosticsOpen(store: KVStore = localStorageStore): boolean {
  return store.getItem(STORAGE_KEY) === '1'
}

export function writeDiagnosticsOpen(open: boolean, store: KVStore = localStorageStore): void {
  try {
    if (open) store.setItem(STORAGE_KEY, '1')
    else store.removeItem(STORAGE_KEY)
  } catch {
    // localStorage может быть недоступен (например, приватный режим) — тогда выбор действует до
    // перезапуска приложения: показать или скрыть карточку — не та причина, чтобы падать.
  }
}
