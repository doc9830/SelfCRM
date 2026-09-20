import { Button, EmptyState, cx } from '../components/ui'
import { Icon } from '../components/Icons'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { isService } from '../types'
import { plural } from '../utils/format'

// Склад: список товаров с остатками. Тап по строке открывает экран товара
// (маршрут /stock/<id>) — там движение и изменение остатка.
export function Stock() {
  const { db } = useData()
  const { navigate } = useRoute()

  const products = db.getProducts().filter((p) => !isService(p))
  const low = products.filter((p) => p.stock <= p.minStock)

  return (
    <div>
      {low.length > 0 && (
        <div className="limit-banner limit-banner-danger">
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
              <button
                key={p.id}
                type="button"
                className={cx('stock-row', isLow && 'stock-row-low')}
                onClick={() => navigate(`/stock/${p.id}`)}
                aria-label={`Движение и остаток: ${p.name}`}
              >
                <span className={cx('stock-qty', isLow && 'stock-qty-low')}>{p.stock}</span>
                <span className="stock-bar">
                  <span className="stock-bar-name">{p.name}</span>
                  <span className="stock-bar-sub">
                    мин. {p.minStock} шт
                    {p.sku ? ` · ${p.sku}` : ''}
                  </span>
                </span>
                <span className="stock-chevron">
                  <Icon name="chevron-right" size={18} />
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
