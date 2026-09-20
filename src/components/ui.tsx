import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Icon, type IconName } from './Icons'
import { BACK_EVENT } from '../utils/back'
import { INT_MAX_DIGITS, sanitizeInteger, sanitizeMoney, sanitizePhone } from '../utils/input'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ----- Кнопка -----

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  full?: boolean
  icon?: IconName
}

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  icon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx('btn', `btn-${variant}`, `btn-${size}`, full && 'btn-full', className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </button>
  )
}

// ----- Поля форм -----

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('input', className)} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('input', 'textarea', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('input', className)} {...rest}>
      {children}
    </select>
  )
}

// ----- Поля с масками и цифровой клавиатурой -----
//
// type="text" + inputMode: на Android открывается цифровая клавиатура, а сам
// ввод фильтрует маска из utils/input.ts — буквы, минусы и лишние разделители
// в состояние формы не попадают. У type="number" браузеры по-разному отдают
// промежуточные значения («12,», «-»), поэтому маски живут на строковых полях.

type MaskedInputProps = {
  value: string
  onChange: (value: string) => void
  mask: (value: string) => string
  type?: 'text' | 'tel'
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode']
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'>

function MaskedInput({ value, onChange, mask, className, ...rest }: MaskedInputProps) {
  return (
    <input
      className={cx('input', className)}
      value={value}
      onChange={(e) => {
        const next = mask(e.target.value)
        // Маска могла убрать символ, который браузер уже успел показать, при
        // этом состояние не изменилось — React не тронет поле, правим вручную.
        if (e.target.value !== next) e.target.value = next
        onChange(next)
      }}
      {...rest}
    />
  )
}

// Телефон: цифровая клавиатура, «+» только в начале, не больше 11 цифр.
export function PhoneInput({ value, onChange, ...rest }: Omit<MaskedInputProps, 'mask' | 'type' | 'inputMode'>) {
  return (
    <MaskedInput
      value={value}
      onChange={onChange}
      mask={sanitizePhone}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      {...rest}
    />
  )
}

// Целые числа: количество, остаток, ИНН, ОГРН, КПП.
export function IntegerInput({
  maxDigits = INT_MAX_DIGITS,
  value,
  onChange,
  ...rest
}: Omit<MaskedInputProps, 'mask' | 'type' | 'inputMode'> & { maxDigits?: number }) {
  return (
    <MaskedInput
      value={value}
      onChange={onChange}
      mask={(input) => sanitizeInteger(input, maxDigits)}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      {...rest}
    />
  )
}

// Деньги: цифры и один разделитель дробной части (запятая тоже принимается).
export function MoneyInput({ value, onChange, ...rest }: Omit<MaskedInputProps, 'mask' | 'type' | 'inputMode'>) {
  return (
    <MaskedInput
      value={value}
      onChange={onChange}
      mask={sanitizeMoney}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      {...rest}
    />
  )
}

// Поля позиций заказа остаются type="number" (в них уже цифровая клавиатура),
// но «-», «+» и «e» там лишние: отрицательная цена и экспонента ломают суммы.
export function blockNonNumericKeys(event: KeyboardEvent<HTMLInputElement>) {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key === '-' || event.key === '+' || event.key === 'e' || event.key === 'E') {
    event.preventDefault()
  }
}

// ----- Бейдж статуса -----

const BADGE_TONES = ['neutral', 'blue', 'green', 'red', 'amber'] as const
export type BadgeTone = (typeof BADGE_TONES)[number]

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={cx('badge', `badge-${tone}`)}>{children}</span>
}

// ----- Пустое состояние -----

export function EmptyState({
  icon = 'box',
  title,
  description,
  action,
}: {
  icon?: IconName
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={32} />
      </div>
      <div className="empty-title">{title}</div>
      {description && <div className="empty-desc">{description}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}

// ----- Модальное окно -----

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  // Системная кнопка «Назад» на Android закрывает открытое окно и не меняет экран:
  // обработчик отменяет событие, поэтому навигация по разделам не срабатывает.
  useEffect(() => {
    const onBack = (event: Event) => {
      event.preventDefault()
      onClose()
    }
    document.addEventListener(BACK_EVENT, onBack)
    return () => document.removeEventListener(BACK_EVENT, onBack)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

// ----- Карточка -----

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('card', className)}>{children}</div>
}

// ----- Плавающая кнопка -----

export function Fab({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button className="fab" onClick={onClick} aria-label={label ?? 'Добавить'}>
      <Icon name="plus" size={26} />
    </button>
  )
}
