import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Database } from '../db/database'

interface DataContextValue {
  db: Database
  version: number
  refresh: () => void
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const dbRef = useRef<Database | null>(null)
  if (!dbRef.current) dbRef.current = new Database()

  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  const value = useMemo<DataContextValue>(
    () => ({ db: dbRef.current as Database, version, refresh }),
    [version, refresh],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData должен использоваться внутри DataProvider')
  return ctx
}
