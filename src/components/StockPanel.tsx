import { useState } from 'react'
import { useData } from '../state/DataContext'
import {
  MANUAL_STOCK_MOVE_KINDS,
  STOCK_MOVE_LABEL,
  type ManualStockMoveKind,
  type StockMove,
} from '../types'
import { formatShortDate, plural } from '../utils/format'
import { formatStockDelta, stockMoveTitle, stockMoveTone } from '../utils/stock'
import { Button, Field, Input, cx } from './ui'

// Учёт остатка: приход, расход, корректировка и история движения товара.
// Один и тот же блок используется на экране «Склад» и в карточке товара,
// поэтому текущий остаток и история всегда читаются из базы заново.
export function StockPanel({
  productId,
  historyLimit,
}: {
  productId: string
  // Сколько последних движений показывать; без ограничения — все.
  historyLimit?: number
}) {
  const { db, refresh } = useData()
  const [kind, setKind] = useState<ManualStockMoveKind>('in')
  const [value, setValue] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  const product = db.getProduct(productId)
  if (!product) return null

  const moves = db.getStockMoves(productId)
  const shown = typeof historyLimit === 'number' ? moves.slice(0, historyLimit) : moves

  const amount = value.trim() === '' ? Number.NaN : Number(value)
  const preview = !Number.isFinite(amount)
    ? null
    : kind === 'adjustment'
      ? Math.round(amount)
      : kind === 'in'
        ? product.stock + Math.round(amount)
        : product.stock - Math.round(amount)

  const pickKind = (next: ManualStockMoveKind) => {
    setKind(next)
    setValue('')
    setError('')
  }

  const apply = () => {
    if (!Number.isFinite(amount)) {
      setError('Укажите количество')
      return
    }
    if (kind !== 'adjustment' && amount <= 0) {
      setError('Количество должно быть больше нуля')
      return
    }
    const changed = db.applyStockMove({ productId, kind, value: amount, comment })
    if (!changed) {
      setError(kind === 'adjustment' ? 'Остаток не изменился' : 'Не удалось изменить остаток')
      return
    }
    setValue('')
    setComment('')
    setError('')
    refresh()
  }

  return (
    <div className="stock-panel">
      <div className="stock-summary">
        <span className="stock-summary-qty">{product.stock}</span>
        <span className="stock-summary-label">
          текущий остаток, {plural(product.stock, 'шт', 'шт', 'шт')}
        </span>
      </div>

      <div className="chips" style={{ marginBottom: 10 }}>
        {MANUAL_STOCK_MOVE_KINDS.map((item) => (
          <button
            key={item}
            type="button"
            className={cx('chip', kind === item && 'chip-active')}
            onClick={() => pickKind(item)}
          >
            {STOCK_MOVE_LABEL[item]}
          </button>
        ))}
      </div>

      <div className="item-card-row">
        <Field label={kind === 'adjustment' ? 'Новый остаток, шт' : 'Количество, шт'}>
          <Input
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError('')
            }}
            placeholder={kind === 'adjustment' ? String(product.stock) : '0'}
          />
        </Field>
        <Field label="Комментарий">
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={kind === 'adjustment' ? 'Например, инвентаризация' : 'Например, поставщик'}
          />
        </Field>
      </div>

      {preview !== null && (
        <div className="field-hint" style={{ marginTop: 6 }}>
          Остаток станет: <b>{preview}</b> {plural(preview, 'шт', 'шт', 'шт')}
        </div>
      )}
      {error && (
        <div className="field-error" style={{ marginTop: 6 }}>
          {error}
        </div>
      )}

      <Button variant="primary" icon="check" full style={{ marginTop: 10 }} onClick={apply}>
        Применить
      </Button>

      <div className="section-title" style={{ margin: '18px 0 8px' }}>
        История товара
      </div>
      {shown.length === 0 ? (
        <div className="stock-history-empty">Движений пока не было</div>
      ) : (
        <div className="stock-history">
          {shown.map((move) => (
            <StockMoveRow key={move.id} move={move} />
          ))}
        </div>
      )}
      {typeof historyLimit === 'number' && moves.length > historyLimit && (
        <div className="field-hint" style={{ marginTop: 6 }}>
          Показаны последние {historyLimit} из {moves.length}
        </div>
      )}
    </div>
  )
}

// Одна строка истории: «19.09 +20 Поступление → 20».
export function StockMoveRow({ move }: { move: StockMove }) {
  return (
    <div className="stock-move">
      <span className="stock-move-date">{formatShortDate(move.date)}</span>
      <span className={cx('stock-move-delta', `stock-move-${stockMoveTone(move.delta)}`)}>
        {formatStockDelta(move.delta)}
      </span>
      <span className="stock-move-note">{stockMoveTitle(move)}</span>
      <span className="stock-move-after" title="Остаток после операции">
        {move.stockAfter}
      </span>
    </div>
  )
}
