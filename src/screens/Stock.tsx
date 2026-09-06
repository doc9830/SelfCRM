import { useState } from 'react'
import { Button, EmptyState, Field, Input, Modal } from '../components/ui'
import { Icon } from '../components/Icons'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import type { Product } from '../types'
import { plural } from '../utils/format'
import { cx } from '../components/ui'
import { LockedScreen } from './Products'

export function Stock() {
  const { db, plan, refresh } = useData()
  const { navigate } = useRoute()
  const [adjusting, setAdjusting] = useState<Product | null>(null)

  if (plan === 'FREE') {
    return (
      <LockedScreen
        title="Склад — в полной версии"
        description="Отслеживайте остатки товаров и получайте предупреждения о низких остатках."
        onUnlock={() => navigate('/settings')}
      />
    )
  }

  const products = db.getProducts()
  const low = products.filter((p) => p.stock <= p.minStock)

  return (
    <div>
      {low.length > 0 && (
        <div className="limit-banner" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          <span className="limit-banner-icon">
            <Icon name="warehouse" size={18} />
          </span>
          <span className="limit-banner-text">
            {low.length} {plural(low.length, 'товар', 'товара', 'товаров')} с низким остатком
          </span>
        </div>
      )}

      {products.length === 0 ? (
        <EmptyState
          icon="warehouse"
          title="Склад пуст"
          description="Добавьте товары, чтобы видеть остатки"
          action={
            <Button icon="box" onClick={() => navigate('/products')}>
              К товарам
            </Button>
          }
        />
      ) : (
        <div className="list">
          {products.map((p) => {
            const isLow = p.stock <= p.minStock
            return (
              <div key={p.id} className={cx('stock-row', isLow && 'stock-row-low')}>
                <div className={cx('stock-qty', isLow && 'stock-qty-low')}>{p.stock}</div>
                <div className="stock-bar">
                  <div className="stock-bar-name">{p.name}</div>
                  <div className="stock-bar-sub">
                    мин. {p.minStock} {plural(p.minStock, 'шт', 'шт', 'шт')}
                    {p.sku ? ` · ${p.sku}` : ''}
                  </div>
                </div>
                <button
                  className="icon-btn"
                  onClick={() => setAdjusting(p)}
                  aria-label="Изменить остаток"
                >
                  <Icon name="edit" size={18} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {adjusting && (
        <AdjustModal
          product={adjusting}
          onClose={() => setAdjusting(null)}
          onSave={(stock) => {
            db.saveProduct({ ...adjusting, stock })
            refresh()
            setAdjusting(null)
          }}
        />
      )}
    </div>
  )
}

function AdjustModal({
  product,
  onSave,
  onClose,
}: {
  product: Product
  onSave: (stock: number) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(String(product.stock))

  return (
    <Modal title={`Остаток: ${product.name}`} onClose={onClose}>
      <div className="form">
        <Field label="Текущий остаток, шт">
          <Input
            type="number"
            inputMode="numeric"
            step="1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </Field>
        <div className="form-actions">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            icon="check"
            onClick={() => {
              const n = Number(value)
              onSave(Number.isFinite(n) ? Math.round(n) : product.stock)
            }}
          >
            Сохранить
          </Button>
        </div>
      </div>
    </Modal>
  )
}
