import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from './Icons'

export interface SuggestOption {
  id: string
  label: string
  sub?: string
}

// Приводит строку к нижнему регистру без пробелов, скобок, дефисов и «+» —
// так поиск по телефону работает независимо от форматирования.
const normalize = (value: string) => value.toLowerCase().replace(/[\s().\-+]/g, '')

function matches(option: SuggestOption, query: string): boolean {
  const q = normalize(query)
  if (!q) return true
  if (normalize(option.label).includes(q)) return true
  if (option.sub && normalize(option.sub).includes(q)) return true
  return false
}

// Поле с автодополнением: при фокусе и вводе показывает выпадающий список подсказок
// в стиле приложения. Используется для выбора клиента и товара в заказе.
export function SuggestField({
  selected,
  options,
  placeholder,
  icon = 'search',
  emptyLabel,
  revertOnBlur = false,
  onSelect,
}: {
  selected: SuggestOption | null
  options: SuggestOption[]
  placeholder?: string
  icon?: IconName
  emptyLabel?: string
  revertOnBlur?: boolean
  onSelect: (option: SuggestOption | null) => void
}) {
  const [text, setText] = useState(selected?.label ?? '')
  const [open, setOpen] = useState(false)
  const blurTimer = useRef<number | null>(null)

  const selectedId = selected?.id ?? null
  const selectedLabel = selected?.label ?? ''

  useEffect(() => {
    setText(selectedLabel)
  }, [selectedId, selectedLabel])

  const results = useMemo(() => {
    const query = text.trim()
    if (!query) return options
    return options.filter((o) => matches(o, query))
  }, [text, options])

  const choose = (option: SuggestOption) => {
    setText(option.label)
    setOpen(false)
    onSelect(option)
  }

  const chooseEmpty = () => {
    setText('')
    setOpen(false)
    onSelect(null)
  }

  const clear = () => {
    setText('')
    onSelect(null)
  }

  const showDropdown = open && (emptyLabel != null || results.length > 0)

  return (
    <div className="suggest-field">
      <div className="suggest-field-input">
        <Icon name={icon} size={18} />
        <input
          className="suggest-field-control"
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => {
              setOpen(false)
              if (revertOnBlur) setText(selectedLabel)
            }, 150)
          }}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
        />
        {text && (
          <button
            type="button"
            className="suggest-field-clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            aria-label="Очистить"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="suggest-list">
          {emptyLabel != null && (
            <button
              type="button"
              className="suggest-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={chooseEmpty}
            >
              <span className="suggest-item-main">{emptyLabel}</span>
            </button>
          )}
          {results.length === 0 ? (
            <div className="suggest-status">Ничего не найдено</div>
          ) : (
            results.map((o) => (
              <button
                key={o.id}
                type="button"
                className="suggest-item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
              >
                <span className="suggest-item-main">{o.label}</span>
                {o.sub && <span className="suggest-item-sub">{o.sub}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
