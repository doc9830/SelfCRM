import { useState } from 'react'
import { Badge, Button, EmptyState, Fab, LimitBanner } from '../components/ui'
import { checkOrderLimit } from '../db/limits'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { ORDER_STATUS_LABEL, type OrderStatus } from '../types'
import { formatDate, money, plural } from '../utils/format'
import { statusTone } from '../utils/status'
import { cx } from '../components/ui'

type Filter = 'all' | OrderStatus

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done', label: 'Завершённые' },
  { value: 'cancelled', label: 'Отменённые' },
]

export function Orders() {
  const { db, plan } = useData()
  const { navigate } = useRoute()
  const [filter, setFilter] = useState<Filter>('all')

  const orders = db.getOrders()
  const limitCheck = checkOrderLimit(plan, orders.length)

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter)

  return (
    <div>
      {!limitCheck.ok && (
        <LimitBanner
          text={limitCheck.reason ?? ''}
          action={
            <Button size="sm" variant="secondary" onClick={() => navigate('/settings')}>
              Открыть
            </Button>
          }
        />
      )}

      <div className="chips">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={cx('chip', filter === f.value && 'chip-active')}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="Заказов нет"
          description="Создайте первый заказ"
          action={
            limitCheck.ok ? (
              <Button icon="plus" onClick={() => navigate('/orders/new')}>
                Создать заказ
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="list">
          {filtered.map((o) => {
            const client = o.clientId ? db.getClient(o.clientId) : undefined
            return (
              <button key={o.id} className="list-item" onClick={() => navigate(`/orders/${o.id}`)}>
                <span className="list-item-main">
                  <span className="list-item-title">{client?.name ?? 'Без клиента'}</span>
                  <span className="list-item-sub">
                    {formatDate(o.date)} · {o.items.length}{' '}
                    {plural(o.items.length, 'позиция', 'позиции', 'позиций')}
                  </span>
                </span>
                <span className="list-item-end">
                  <span className="list-item-price">{money(db.getOrderTotal(o))}</span>
                  <Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {limitCheck.ok && <Fab onClick={() => navigate('/orders/new')} label="Создать заказ" />}
    </div>
  )
}
