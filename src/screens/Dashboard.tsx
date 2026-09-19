import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { isActiveStatus, isService } from '../types'
import { money, plural } from '../utils/format'
import { ACTIVE_ORDERS_LINK, statisticsLink } from '../utils/links'
import { Icon, type IconName } from '../components/Icons'

export function Dashboard() {
  const { db } = useData()
  const { navigate } = useRoute()

  const orders = db.getOrders()
  const products = db.getProducts()

  const activeOrders = orders.filter((o) => isActiveStatus(o.status))
  const revenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + db.getOrderTotal(o), 0)
  const lowStock = products.filter((p) => !isService(p) && p.stock <= p.minStock)

  return (
    <div>
      {/* Плашки кликабельны: активные заказы открывают список новых и «в работе»,
          выручка — статистику с периодом «Месяц». */}
      <div className="stat-grid">
        <Stat
          value={String(activeOrders.length)}
          label="Активные заказы"
          onClick={() => navigate(ACTIVE_ORDERS_LINK)}
        />
        <Stat
          value={money(revenue)}
          label="Выручка"
          accent
          onClick={() => navigate(statisticsLink('month'))}
        />
      </div>

      <div className="section">
        <div className="section-title" style={{ marginBottom: 10 }}>
          Быстрые действия
        </div>
        <div className="quick-grid">
          <QuickBtn icon="users" label="Клиент" onClick={() => navigate('/clients/new')} />
          <QuickBtn icon="receipt" label="Заказ" onClick={() => navigate('/orders/new')} />
          <QuickBtn icon="box" label="Товар" onClick={() => navigate('/products')} />
          <QuickBtn icon="warehouse" label="Склад" onClick={() => navigate('/stock')} />
          <QuickBtn icon="chart" label="Статистика" onClick={() => navigate('/statistics')} />
          <QuickBtn icon="settings" label="Настройки" onClick={() => navigate('/settings')} />
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">Низкие остатки</div>
            <button className="section-link" onClick={() => navigate('/stock')}>
              Склад <Icon name="chevron-right" size={16} />
            </button>
          </div>
          {lowStock.map((p) => (
            <div className="warn-item" key={p.id}>
              <b>{p.name}</b>
              <span style={{ marginLeft: 'auto' }}>
                {p.stock} {plural(p.stock, 'шт', 'шт', 'шт')} (мин. {p.minStock})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({
  value,
  label,
  accent,
  onClick,
}: {
  value: string
  label: string
  accent?: boolean
  onClick: () => void
}) {
  return (
    <button className="stat stat-btn" onClick={onClick}>
      <span className="stat-arrow" aria-hidden="true">
        <Icon name="chevron-right" size={16} />
      </span>
      <span className={accent ? 'stat-value stat-accent' : 'stat-value'}>{value}</span>
      <span className="stat-label">{label}</span>
    </button>
  )
}

function QuickBtn({
  icon,
  label,
  onClick,
}: {
  icon: IconName
  label: string
  onClick: () => void
}) {
  return (
    <button className="quick-btn" onClick={onClick}>
      <Icon name={icon} size={22} />
      {label}
    </button>
  )
}
