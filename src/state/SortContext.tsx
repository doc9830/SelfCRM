import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export interface SortOption {
  value: string
  label: string
}

export interface SortScope {
  /** Вариант сортировки по умолчанию. */
  fallback: string
  options: SortOption[]
}

// Экраны со списками, для которых сортировка доступна из шапки приложения.
// Ключ совпадает с первым сегментом маршрута (см. router.ts).
export const SORT_SCOPES: Record<string, SortScope> = {
  orders: {
    fallback: 'date-desc',
    options: [
      { value: 'date-desc', label: 'Сначала новые' },
      { value: 'date-asc', label: 'Сначала старые' },
      { value: 'total-desc', label: 'Сумма: по убыванию' },
      { value: 'total-asc', label: 'Сумма: по возрастанию' },
      { value: 'status', label: 'По статусу' },
    ],
  },
  products: {
    fallback: 'name',
    options: [
      { value: 'name', label: 'По алфавиту' },
      { value: 'stock-desc', label: 'Остаток: по убыванию' },
      { value: 'stock-asc', label: 'Остаток: по возрастанию' },
      { value: 'price-desc', label: 'Цена: по убыванию' },
      { value: 'price-asc', label: 'Цена: по возрастанию' },
    ],
  },
}

export function getSortScope(scope: string): SortScope | undefined {
  return SORT_SCOPES[scope]
}

// Область сортировки для маршрута: список (один сегмент) с известным набором вариантов.
export function sortScopeForRoute(segments: string[]): string | null {
  if (segments.length !== 1) return null
  const scope = segments[0]
  return scope && getSortScope(scope) ? scope : null
}

interface SortContextValue {
  values: Record<string, string>
  setSort: (scope: string, value: string) => void
}

const SortContext = createContext<SortContextValue | null>(null)

// Значения сортировки живут вне экранов, потому что переключатель находится в шапке:
// так выбор сохраняется при переходах между разделами.
export function SortProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<Record<string, string>>({})

  const setSort = useCallback((scope: string, value: string) => {
    setValues((prev) => (prev[scope] === value ? prev : { ...prev, [scope]: value }))
  }, [])

  const value = useMemo<SortContextValue>(() => ({ values, setSort }), [values, setSort])

  return <SortContext.Provider value={value}>{children}</SortContext.Provider>
}

export function useSort(): SortContextValue {
  const ctx = useContext(SortContext)
  if (!ctx) throw new Error('useSort должен использоваться внутри SortProvider')
  return ctx
}

// Текущее значение сортировки экрана со списком (Заказы, Товары).
export function useSortValue(scope: string): string {
  const { values } = useSort()
  return values[scope] ?? getSortScope(scope)?.fallback ?? ''
}
