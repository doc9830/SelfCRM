import { useState } from 'react'
import { useData } from '../state/DataContext'
import { isService, type BulkStockMoveKind, type Product } from '../types'
import { plural } from '../utils/format'
import { formatStockDelta } from '../utils/stock'
import { Icon } from './Icons'
import { Button, Field, Input, IntegerInput, Modal } from './ui'

// Массовые операции склада: приход и списание сразу по нескольким позициям.
// Открывается кнопками «Приход» и «Списание» на экране склада (над плашкой низкого
// остатка). Причина одна на всю операцию и вводится вручную: она попадает в историю
// каждой позиции («Поступление · По накладной №128»), поэтому по складу видно,
// откуда взялись числа. Услуги в списке не показываются — на складе они не учитываются.
export function BulkStockModal({ kind, onClose }: { kind: BulkStockMoveKind; onClose: () => void }) {
  const { db, refresh } = useData()
  const products = db.getProducts().filter((p) => !isService(p))
  const [reason, setReason] = useState('')
  const [query, setQuery] = useState('')
  // Количество по позициям: пустое поле означает «эту позицию не трогаем».
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const term = query.trim().toLowerCase()
  const visible = products.filter(
    (p) => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term),
  )

  const picked = products
    .map((product) => ({ product, value: Number(values[product.id] ?? '') }))
    .filter((row) => Number.isFinite(row.value) && row.value > 0)

  const total = picked.reduce((sum, row) => sum + row.value, 0)
  const negative = picked.filter((row) => nextStock(row.product, row.value, kind) < 0).length

  const setValue = (productId: string, value: string) => {
    setValues((prev) => ({ ...prev, [productId]: value }))
    if (error) setError('')
  }

  const apply = () => {
    if (picked.length === 0) {
      setError('Укажите количество хотя бы у одной позиции')
      return
    }
    if (!reason.trim()) {
      setError('Напишите причину — она попадёт в движение товара')
      return
    }
    const applied = db.applyBulkStockMove({
      kind,
      items: picked.map((row) => ({ productId: row.product.id, value: row.value })),
      comment: reason,
    })
    if (!applied) {
      setError('Не удалось изменить остаток')
      return
    }
    refresh()
    onClose()
  }

  return (
    <Modal title={kind === 'in' ? 'Массовый приход' : 'Массовое списание'} onClose={onClose}>
      <div className="form">
        <Field
          label="Причина *"
          hint={
            kind === 'in'
              ? 'Например, по накладной №128 — она попадёт в движение товара'
              : 'Например, истёк срок годности или брак — она попадёт в движение товара'
          }
        >
          <Input
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (error) setError('')
            }}
            placeholder={kind === 'in' ? 'По накладной №128' : 'Истёк срок годности'}
          />
        </Field>

        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={18} />
            <input
              placeholder="Поиск товара"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div>
          <div className="field-label">
            {kind === 'in' ? 'Сколько пришло, шт' : 'Сколько списать, шт'}
          </div>

          {visible.length === 0 ? (
            <div className="bulk-stock-empty">Ничего не найдено</div>
          ) : (
            <div className="bulk-stock-list">
              {visible.map((product) => {
                const value = Number(values[product.id] ?? '') || 0
                const next = nextStock(product, value, kind)
                return (
                  <div key={product.id} className="bulk-stock-row">
                    <span className="bulk-stock-main">
                      <span className="bulk-stock-name">{product.name}</span>
                      <span className="bulk-stock-sub">
                        остаток {product.stock} шт
                        {value > 0 && (
                          <>
                            {' → '}
                            <b className={next < 0 ? 'bulk-stock-negative' : undefined}>{next}</b>
                          </>
                        )}
                      </span>
                    </span>
                    <IntegerInput
                      value={values[product.id] ?? ''}
                      onChange={(nextValue) => setValue(product.id, nextValue)}
                      placeholder="0"
                      aria-label={`Количество: ${product.name}`}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="bulk-stock-summary">
          {picked.length > 0 ? (
            <>
              {picked.length} {plural(picked.length, 'позиция', 'позиции', 'позиций')} ·{' '}
              {formatStockDelta(kind === 'in' ? total : -total)} шт
            </>
          ) : (
            'Количество пока не указано'
          )}
          {negative > 0 && (
            <span className="bulk-stock-negative">
              {' · '}у {negative} {plural(negative, 'позиции', 'позиций', 'позиций')} остаток уйдёт
              в минус
            </span>
          )}
        </div>

        {error && <div className="field-error">{error}</div>}

        <div className="form-actions">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" icon="check" onClick={apply}>
            Применить
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// Остаток позиции после операции — показывается прямо в строке: человек видит, что
// получится, ещё до нажатия «Применить» (отрицательный остаток выделяется цветом).
function nextStock(product: Product, value: number, kind: BulkStockMoveKind): number {
  return kind === 'in' ? product.stock + value : product.stock - value
}

