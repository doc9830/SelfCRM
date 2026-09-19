import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icons'
import { cx } from './ui'
import { getSortScope, useSort } from '../state/SortContext'

// Значок со стрелочками в шапке: по нажатию раскрывает собственный (не системный)
// список вариантов сортировки текущего экрана.
export function SortMenu({ scope }: { scope: string }) {
  const { values, setSort } = useSort()
  const config = getSortScope(scope)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Закрытие по нажатию вне меню и по Escape.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: Event) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // При переходе на другой экран (другая область сортировки) меню должно быть закрыто.
  useEffect(() => setOpen(false), [scope])

  if (!config) return null

  const value = values[scope] ?? config.fallback
  const custom = value !== config.fallback

  return (
    <div className="sort-menu" ref={rootRef}>
      <button
        type="button"
        className={cx('icon-btn', 'sort-menu-btn', open && 'is-open', custom && 'is-on')}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Сортировка"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Сортировка"
      >
        <Icon name="sort" size={22} />
      </button>

      {open && (
        <div className="sort-menu-list" role="listbox" aria-label="Сортировка">
          <div className="sort-menu-title">Сортировка</div>
          {config.options.map((option) => {
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                className={cx('sort-option', active && 'sort-option-active')}
                onClick={() => {
                  setSort(scope, option.value)
                  setOpen(false)
                }}
              >
                <span className={cx('sort-option-check', active && 'sort-option-check-on')}>
                  <Icon name="check" size={16} />
                </span>
                <span className="sort-option-label">{option.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
