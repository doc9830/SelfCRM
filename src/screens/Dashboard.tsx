import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { isActiveStatus, isService } from '../types'
import { money, plural } from '../utils/format'
import { Icon, type IconName } from '../components/Icons'

export function Dashboard() {
  const { db } = useData()
  const { navigate } = useRoute()

  const clients = db.getClients()
  const orders = db.getOrders()
  const products = db.getProducts()

  const activeOrders = orders.filter((o) => isActiveStatus(o.status))
  const doneOrders = orders.filter((o) => o.status === 'done')
  const revenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + db.getOrderTotal(o), 0)
  const lowStock = products.filter((p) => !isService(p) && p.stock <= p.minStock)

  return (
    <div>
      <div className="stat-grid">
        <Stat value={String(clients.length)} label="Клиенты" />
        <Stat value={String(activeOrders.length)} label="Активные заказы" />
        <Stat value={String(doneOrders.length)} label="Завершённые" />
        <Stat value={money(revenue)} label="Выручка" accent />
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

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="stat">
      <div className={accent ? 'stat-value stat-accent' : 'stat-value'}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
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
