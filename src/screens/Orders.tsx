import { useState } from 'react'
import { Badge, Button, EmptyState, Fab } from '../components/ui'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { useSortValue } from '../state/SortContext'
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

// Варианты сортировки заданы в state/SortContext.tsx — их показывает значок в шапке.
type Sort = 'date-desc' | 'date-asc' | 'total-desc' | 'total-asc' | 'status'

const STATUS_RANK: Record<OrderStatus, number> = {
  new: 0,
  in_progress: 1,
  done: 2,
  cancelled: 3,
}

const at = (iso: string) => new Date(iso).getTime()

export function Orders() {
  const { db } = useData()
  const { navigate } = useRoute()
  const [filter, setFilter] = useState<Filter>('all')
  const sort = useSortValue('orders') as Sort

  const orders = db.getOrders()
  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter)
  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'date-asc':
        return at(a.date) - at(b.date)
      case 'total-desc':
        return db.getOrderTotal(b) - db.getOrderTotal(a)
      case 'total-asc':
        return db.getOrderTotal(a) - db.getOrderTotal(b)
      case 'status':
        return STATUS_RANK[a.status] - STATUS_RANK[b.status] || at(b.date) - at(a.date)
      default:
        return at(b.date) - at(a.date)
    }
  })

  return (
    <div>
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
            <Button icon="plus" onClick={() => navigate('/orders/new')}>
              Создать заказ
            </Button>
          }
        />
      ) : (
        <div className="list">
          {sorted.map((o) => {
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

      <Fab onClick={() => navigate('/orders/new')} label="Создать заказ" />
    </div>
  )
}
