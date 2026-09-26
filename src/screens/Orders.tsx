import { useEffect, useState } from 'react'
import { Badge, Button, EmptyState, Fab } from '../components/ui'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { useSortValue } from '../state/SortContext'
import { ORDER_STATUS_LABEL, type OrderStatus } from '../types'
import { formatDate, money, plural } from '../utils/format'
import { formatOrderNumber } from '../utils/orders'
import {
  ORDER_FILTERS,
  ORDER_FILTER_LABEL,
  matchesOrderFilter,
  orderFilterFromQuery,
  type OrderFilter,
} from '../utils/links'
import { statusTone } from '../utils/status'
import { cx } from '../components/ui'

// Чипы фильтра заданы в utils/links.ts: «Активные» — это «Новые» + «В работе»,
// на этот же фильтр ведёт плашка «Активные заказы» с главного экрана.
const FILTERS = ORDER_FILTERS.map((value) => ({ value, label: ORDER_FILTER_LABEL[value] }))

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
  const { route, navigate } = useRoute()
  const filterParam = route.query.get('filter')
  const [filter, setFilter] = useState<OrderFilter>(() => orderFilterFromQuery(filterParam))
  const sort = useSortValue('orders') as Sort

  // Ссылка с главного экрана (#/orders?filter=active) задаёт фильтр. Возврат на
  // вкладку «Заказы» без параметра показывает весь список.
  useEffect(() => {
    setFilter(orderFilterFromQuery(filterParam))
  }, [filterParam])

  const orders = db.getOrders()
  const filtered = orders.filter((o) => matchesOrderFilter(o, filter))
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
          title="Заказов пока нет"
          description="Создайте заказ из карточки клиента или кнопкой ниже"
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
                    {formatOrderNumber(o) ? `${formatOrderNumber(o)} · ` : ''}
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
