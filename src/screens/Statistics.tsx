import { useMemo, useState } from 'react'
import { Badge, Button, EmptyState, Field, Input, cx } from '../components/ui'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from '../types'
import { formatDate, money, plural } from '../utils/format'
import { statusTone } from '../utils/status'
import {
  filterOrdersByRange,
  groupItemRevenue,
  groupRevenue,
  periodRange,
  summarizeOrders,
  type DateRange,
  type PeriodKey,
} from '../utils/stats'

const PERIODS: Array<{ value: PeriodKey; label: string }> = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: '7 дней' },
  { value: 'month', label: 'Месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
  { value: 'all', label: 'Всё время' },
  { value: 'custom', label: 'Период' },
]

const NO_CLIENT = '__none__'

export function Statistics() {
  const { db, version } = useData()
  const { navigate } = useRoute()
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { range, orders, summary, clients, items } = useMemo(() => {
    const bounds = periodRange(period, new Date(), { from, to })
    const inRange = filterOrdersByRange(db.getOrders(), bounds)
    return {
      range: bounds,
      orders: inRange,
      summary: summarizeOrders(inRange),
      clients: groupRevenue(inRange, (o) => o.clientId ?? NO_CLIENT),
      items: groupItemRevenue(inRange),
    }
    // version в зависимостях: пересчитываем статистику после изменений данных.
  }, [db, version, period, from, to])

  const clientName = (id: string) =>
    id === NO_CLIENT ? 'Без клиента' : db.getClient(id)?.name ?? 'Удалённый клиент'

  return (
    <div>
      <div className="chips">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            className={cx('chip', period === p.value && 'chip-active')}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="item-card-row" style={{ marginBottom: 12 }}>
          <Field label="С даты">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="По дату">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="field-hint" style={{ marginBottom: 10 }}>
        {rangeLabel(range)}
      </div>

      <div className="stat-grid">
        <Stat value={money(summary.revenue)} label="Выручка" accent />
        <Stat value={String(summary.count)} label="Заказов" />
        <Stat value={money(summary.average)} label="Средний чек" />
        <Stat value={String(summary.byStatus.done)} label="Завершено" />
      </div>

      <div className="section">
        <div className="section-title" style={{ marginBottom: 10 }}>
          Статусы заказов
        </div>
        <div className="chips" style={{ marginBottom: 0 }}>
          {ORDER_STATUSES.map((status) => (
            <Badge key={status} tone={statusTone(status)}>
              {ORDER_STATUS_LABEL[status]}: {summary.byStatus[status]}
            </Badge>
          ))}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="section">
          <EmptyState
            icon="chart"
            title="Нет данных за период"
            description="Измените период или создайте заказы"
            action={
              <Button icon="receipt" onClick={() => navigate('/orders')}>
                К заказам
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {items.length > 0 && (
            <div className="section">
              <div className="section-title" style={{ marginBottom: 10 }}>
                Топ товаров и услуг
              </div>
              {items.slice(0, 5).map((entry, index) => (
                <div className="top-row" key={entry.key}>
                  <span className="top-rank">{index + 1}</span>
                  <span className="top-name">{entry.label}</span>
                  <span className="top-qty">
                    {entry.qty} {plural(entry.qty, 'шт', 'шт', 'шт')}
                  </span>
                  <span className="top-total">{money(entry.total)}</span>
                </div>
              ))}
            </div>
          )}

          {clients.length > 0 && (
            <div className="section">
              <div className="section-title" style={{ marginBottom: 10 }}>
                Топ клиентов
              </div>
              {clients.slice(0, 5).map((entry, index) => (
                <div className="top-row" key={entry.key}>
                  <span className="top-rank">{index + 1}</span>
                  <span className="top-name">{clientName(entry.key)}</span>
                  <span className="top-qty">
                    {entry.qty} {plural(entry.qty, 'заказ', 'заказа', 'заказов')}
                  </span>
                  <span className="top-total">{money(entry.total)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function rangeLabel(bounds: DateRange): string {
  const from = bounds.from !== null ? formatDate(new Date(bounds.from).toISOString()) : null
  const to = bounds.to !== null ? formatDate(new Date(bounds.to).toISOString()) : null
  if (from && to) return `Период: ${from} — ${to}`
  if (from) return `Период: с ${from}`
  if (to) return `Период: по ${to}`
  return 'Период: за всё время'
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="stat">
      <div className={accent ? 'stat-value stat-accent' : 'stat-value'}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

