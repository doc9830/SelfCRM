import { getLimits } from '../db/limits'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { isActiveStatus } from '../types'
import { money, plural } from '../utils/format'
import { Icon, type IconName } from '../components/Icons'

export function Dashboard() {
  const { db, plan } = useData()
  const { navigate } = useRoute()

  const clients = db.getClients()
  const orders = db.getOrders()
  const products = db.getProducts()
  const limits = getLimits(plan)

  const activeOrders = orders.filter((o) => isActiveStatus(o.status))
  const doneOrders = orders.filter((o) => o.status === 'done')
  const revenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + db.getOrderTotal(o), 0)
  const lowStock = products.filter((p) => p.stock <= p.minStock)

  const clientsLeft = Number.isFinite(limits.maxClients)
    ? Math.max(0, limits.maxClients - clients.length)
    : null

  return (
    <div>
      <div className="stat-grid">
        <Stat value={String(clients.length)} label="Клиенты" />
        <Stat value={String(activeOrders.length)} label="Активные заказы" />
        <Stat value={String(doneOrders.length)} label="Завершённые" />
        <Stat value={money(revenue)} label="Выручка" accent />
      </div>

      {clientsLeft !== null && clientsLeft <= 5 && (
        <div className="limit-banner" style={{ marginTop: 14 }}>
          <span className="limit-banner-icon">
            <Icon name="lock" size={18} />
          </span>
          <span className="limit-banner-text">
            Осталось мест для клиентов: {clientsLeft} из {limits.maxClients} (бесплатная версия).
          </span>
        </div>
      )}

      <div className="section">
        <div className="section-title" style={{ marginBottom: 10 }}>
          Быстрые действия
        </div>
        <div className="quick-grid">
          <QuickBtn icon="users" label="Клиент" onClick={() => navigate('/clients/new')} />
          <QuickBtn icon="receipt" label="Заказ" onClick={() => navigate('/orders/new')} />
          <QuickBtn icon="box" label="Товар" onClick={() => navigate('/products')} />
          <QuickBtn icon="warehouse" label="Склад" onClick={() => navigate('/stock')} />
        </div>
      </div>

      {limits.warehouse && lowStock.length > 0 && (
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
