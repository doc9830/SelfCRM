import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icons'
import { loadAddresses, searchAddresses, type AddressEntry } from '../db/addresses'
import { suggestAddresses, hasDadataToken } from '../api/dadata'

const DEBOUNCE_MS = 300

// Поле ввода адреса с автодополнением.
// Источник — подсказки Дадаты (suggest/address); при недоступности сети/сервиса
// автоматически переключается на локальную базу адресов (данные кадастра).
// При выборе подсказки родителю передаётся полная запись с кадастровым номером и координатами.
export function AddressField({
  initialAddress = '',
  initialEntry = null,
  onChange,
}: {
  initialAddress?: string
  initialEntry?: AddressEntry | null
  onChange?: (value: string, entry: AddressEntry | null) => void
}) {
  const [text, setText] = useState(initialAddress)
  const [selected, setSelected] = useState<AddressEntry | null>(initialEntry)
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<AddressEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [fallback, setFallback] = useState(false)
  const blurTimer = useRef<number | null>(null)
  const requestId = useRef(0)

  const localSource = useMemo(() => loadAddresses(), [])

  useEffect(() => {
    const q = text.trim()
    const id = ++requestId.current
    setFallback(false)

    if (!open || !q || (selected && text === selected.address)) {
      setResults([])
      setLoading(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const list = await suggestAddresses(q, 8)
        if (cancelled || id !== requestId.current) return
        setResults(list)
      } catch {
        if (cancelled || id !== requestId.current) return
        setResults(searchAddresses(q, localSource, 8))
        setFallback(true)
      } finally {
        if (!cancelled && id === requestId.current) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [text, open, selected, localSource])

  const choose = (entry: AddressEntry) => {
    setText(entry.address)
    setSelected(entry)
    setOpen(false)
    setResults([])
    onChange?.(entry.address, entry)
  }

  const clear = () => {
    setText('')
    setSelected(null)
    onChange?.('', null)
  }

  const showDropdown = open && !!text.trim() && (loading || results.length > 0 || fallback)

  return (
    <div className="address-field">
      <div className="address-field-input">
        <Icon name="map-pin" size={18} />
        <input
          className="address-field-control"
          value={text}
          placeholder="Начните вводить адрес…"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 150)
          }}
          onChange={(e) => {
            setText(e.target.value)
            setSelected(null)
            setOpen(true)
            onChange?.(e.target.value, null)
          }}
        />
        {text && (
          <button type="button" className="address-field-clear" onMouseDown={(e) => e.preventDefault()} onClick={clear} aria-label="Очистить">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="address-suggestions">
          {loading ? (
            <div className="address-status">Поиск…</div>
          ) : (
            <>
              {results.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="address-suggestion"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(entry)}
                >
                  <span className="address-suggestion-main">{entry.address}</span>
                  {entry.cadastralNumber && (
                    <span className="address-suggestion-sub">КН {entry.cadastralNumber}</span>
                  )}
                </button>
              ))}
              {fallback && (
                <div className="address-status">
                  {hasDadataToken()
                    ? results.length > 0
                      ? 'Сервис недоступен — показана локальная база'
                      : 'Сервис недоступен, совпадений нет'
                    : results.length > 0
                      ? 'Подсказки Дадаты отключены — показана локальная база'
                      : 'Подсказки Дадаты отключены, в локальной базе совпадений нет'}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {selected?.cadastralNumber && (
        <div className="address-field-meta">Кадастровый номер: {selected.cadastralNumber}</div>
      )}
    </div>
  )
}

