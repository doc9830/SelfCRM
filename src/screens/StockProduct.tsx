import { StockPanel } from '../components/StockPanel'
import { Badge, Button, Card, EmptyState } from '../components/ui'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { isService } from '../types'
import { money, plural } from '../utils/format'

// Экран товара в разделе «Склад» (маршрут /stock/<id>): сводка по позиции, ручные
// операции с остатком и вся история движения. Открывается тапом по строке склада;
// в карточке товара этого блока нет, чтобы данные не дублировались в двух местах.
export function StockProduct({ id }: { id: string }) {
  const { db } = useData()
  const { navigate } = useRoute()
  const product = db.getProduct(id)

  if (!product || isService(product)) {
    return (
      <EmptyState
        icon="warehouse"
        title="Товар не найден"
        description="Позиция удалена или это услуга — услуги на складе не учитываются"
        action={<Button onClick={() => navigate('/stock')}>К складу</Button>}
      />
    )
  }

  const low = product.stock <= product.minStock

  return (
    <div>
      <Card className="detail-block">
        <div className="order-head" style={{ marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>{product.name}</h2>
          {low && <Badge tone="red">Низкий остаток</Badge>}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {product.sku ? `Артикул ${product.sku} · ` : ''}
          {money(product.price)}
        </div>
        <div style={{ marginTop: 8 }}>
          <DetailRow
            label="Минимальный остаток"
            value={`${product.minStock} ${plural(product.minStock, 'шт', 'шт', 'шт')}`}
          />
          <DetailRow label="Себестоимость" value={product.cost ? money(product.cost) : '—'} />
          {product.description && <DetailRow label="Описание" value={product.description} />}
        </div>
      </Card>

      <StockPanel productId={product.id} />
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  )
}
