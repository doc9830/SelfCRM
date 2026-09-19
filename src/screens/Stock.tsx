import { useState } from 'react'
import { StockPanel } from '../components/StockPanel'
import { Button, EmptyState, Modal, cx } from '../components/ui'
import { Icon } from '../components/Icons'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { isService } from '../types'
import { plural } from '../utils/format'

export function Stock() {
  const { db } = useData()
  const { navigate } = useRoute()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const products = db.getProducts().filter((p) => !isService(p))
  const low = products.filter((p) => p.stock <= p.minStock)
  const selected = selectedId ? products.find((p) => p.id === selectedId) : undefined

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
                  onClick={() => setSelectedId(p.id)}
                  aria-label="Движение и история товара"
                >
                  <Icon name="edit" size={18} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <Modal title={`Склад: ${selected.name}`} onClose={() => setSelectedId(null)}>
          <div className="form">
            <StockPanel productId={selected.id} />
          </div>
        </Modal>
      )}
    </div>
  )
}
