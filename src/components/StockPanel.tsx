import { useState } from 'react'
import { useData } from '../state/DataContext'
import { useRoute } from '../router'
import {
  MANUAL_STOCK_MOVE_KINDS,
  STOCK_MOVE_LABEL,
  type ManualStockMoveKind,
  type StockMove,
} from '../types'
import { formatShortDate, plural } from '../utils/format'
import { formatStockDelta, stockMoveOrder, stockMoveTitle, stockMoveTone } from '../utils/stock'
import { Icon } from './Icons'
import { Button, Field, Input, IntegerInput, cx } from './ui'

// Учёт остатка: приход, расход, корректировка и вся история движения товара.
// Блок живёт только на экране товара в разделе «Склад» (маршрут /stock/<id>):
// в карточке товара история убрана, чтобы одни и те же данные не дублировались.
// Остаток и история всегда читаются из базы заново.
export function StockPanel({ productId }: { productId: string }) {
  const { db, refresh } = useData()
  const { navigate } = useRoute()
  const [kind, setKind] = useState<ManualStockMoveKind>('in')
  const [value, setValue] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  const product = db.getProduct(productId)
  if (!product) return null

  const moves = db.getStockMoves(productId)
  // Заказы нужны истории: у списаний по заказу причина становится ссылкой на сам заказ.
  const orders = db.getOrders()

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
          <IntegerInput
            value={value}
            onChange={(next) => {
              setValue(next)
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
        Движение товара
      </div>
      {moves.length === 0 ? (
        <div className="stock-history-empty">Движений пока не было</div>
      ) : (
        <div className="stock-history">
          {moves.map((move) => {
            const order = stockMoveOrder(move, orders)
            return (
              <StockMoveRow
                key={move.id}
                move={move}
                onOpenOrder={order ? () => navigate(`/orders/${order.id}`) : undefined}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// Одна строка истории: «19.09 +20 Поступление → 20». Если движение привязано к заказу,
// причина — кнопка: тап по «Заказ №42» открывает сам заказ (маршрут /orders/<id>).
export function StockMoveRow({ move, onOpenOrder }: { move: StockMove; onOpenOrder?: () => void }) {
  const title = stockMoveTitle(move)
  return (
    <div className="stock-move">
      <span className="stock-move-date">{formatShortDate(move.date)}</span>
      <span className={cx('stock-move-delta', `stock-move-${stockMoveTone(move.delta)}`)}>
        {formatStockDelta(move.delta)}
      </span>
      {onOpenOrder ? (
        <button
          type="button"
          className="stock-move-note stock-move-link"
          title="Открыть заказ"
          onClick={onOpenOrder}
        >
          <span className="stock-move-link-text">{title}</span>
          <Icon name="chevron-right" size={14} />
        </button>
      ) : (
        <span className="stock-move-note">{title}</span>
      )}
      <span className="stock-move-after" title="Остаток после операции">
        {move.stockAfter}
      </span>
    </div>
  )
}
