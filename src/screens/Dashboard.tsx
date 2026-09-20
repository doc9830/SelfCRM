import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { isActiveStatus, isService, type Order } from '../types'
import { cx } from '../components/ui'
import { money, plural } from '../utils/format'
import { ACTIVE_ORDERS_LINK, statisticsLink } from '../utils/links'
import { orderTitle } from '../utils/orders'
import {
  REMINDER_KIND_ICON,
  groupReminders,
  limitReminderGroups,
  reminderTime,
} from '../utils/reminders'
import { filterOrdersByRange, periodRange, summarizeOrders } from '../utils/stats'
import { Icon, type IconName } from '../components/Icons'

export function Dashboard() {
  const { db, refresh } = useData()
  const { navigate } = useRoute()

  const orders = db.getOrders()
  const products = db.getProducts()

  const activeOrders = orders.filter((o) => isActiveStatus(o.status))
  // Выручка — завершённые заказы текущего месяца: на этот же период ведёт плашка.
  const month = summarizeOrders(filterOrdersByRange(orders, periodRange('month')))
  const lowStock = products.filter((p) => !isService(p) && p.stock <= p.minStock)

  // Ближайшие напоминания из всех заказов: на главной это компактный обзор, сами
  // напоминания живут в карточках заказов — отдельного планировщика нет.
  const reminders = limitReminderGroups(groupReminders(db.getReminders()))

  // Подпись строки: по какому заказу и кому напомнить.
  const reminderMeta = (order: Order): string => {
    const client = order.clientId ? db.getClient(order.clientId)?.name : undefined
    return [orderTitle(order), client].filter(Boolean).join(' · ')
  }

  return (
    <div>
      {reminders.groups.length > 0 && (
        <div className="reminder-panel">
          <div className="reminder-panel-head">
            <Icon name="bell" size={17} />
            Напоминания
          </div>
          {reminders.groups.map((group) => (
            <div className="reminder-group" key={group.key}>
              <div className={cx('reminder-group-title', `reminder-group-title-${group.key}`)}>
                {group.label}
              </div>
              {group.items.map(({ order, reminder }) => (
                <div className="reminder-item" key={`${order.id}-${reminder.id}`}>
                  <button
                    type="button"
                    className="reminder-check"
                    aria-label="Отметить выполненным"
                    onClick={() => {
                      db.toggleReminder(order.id, reminder.id)
                      refresh()
                    }}
                  />
                  <button
                    type="button"
                    className="reminder-open"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <span className="reminder-main">
                      <span className="reminder-text">
                        <Icon name={REMINDER_KIND_ICON[reminder.kind]} size={15} />
                        {reminder.text}
                      </span>
                      <span className="reminder-when">
                        {reminderMeta(order)} · {reminderTime(reminder.dueAt)}
                      </span>
                    </span>
                    <Icon name="chevron-right" size={16} />
                  </button>
                </div>
              ))}
            </div>
          ))}
          {reminders.hidden > 0 && (
            <div className="field-hint" style={{ marginTop: 6 }}>
              Ещё {reminders.hidden}{' '}
              {plural(reminders.hidden, 'напоминание', 'напоминания', 'напоминаний')} — в карточках
              заказов
            </div>
          )}
        </div>
      )}

      {/* Плашки кликабельны: активные заказы открывают список новых и «в работе»,
          выручка — статистику с периодом «Месяц». */}
      <div className="stat-grid">
        <Stat
          value={String(activeOrders.length)}
          label="Активные заказы"
          onClick={() => navigate(ACTIVE_ORDERS_LINK)}
        />
        <Stat
          value={money(month.revenue)}
          label="Выручка за месяц"
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
