// Минимальная абстракция поверх ключ-значение хранилища.
// По умолчанию — localStorage (браузер / WebView Capacitor).
// В тестах — MemoryStore. При желании сюда можно подставить SQLite-адаптер.

export interface KVStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const localStorageStore: KVStore = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    window.localStorage.setItem(key, value)
  },
  removeItem: (key) => {
    window.localStorage.removeItem(key)
  },
}

export class MemoryStore implements KVStore {
  private map = new Map<string, string>()

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }
}
