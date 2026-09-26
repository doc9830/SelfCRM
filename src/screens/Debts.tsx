// Список «К оплате»: заказы, по которым осталось внести деньги.
//
// Открывается плашкой с главного экрана. Строки — те же, что в остальных списках
// CRM, а нажатие ведёт в обычную карточку заказа: отдельной карточки для долгов
// нет, платят всё равно в заказе. Порядок — от самого большого долга к меньшему
// (см. `ordersWithDue`), поэтому список сам подсказывает, с кого начинать.
import { Button, EmptyState } from '../components/ui'
import { Icon } from '../components/Icons'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { formatDate, money, plural, round2 } from '../utils/format'
import { clientLabel, orderTitle } from '../utils/orders'
import { ordersWithDue } from '../utils/payments'

export function Debts() {
  const { db } = useData()
  const { navigate } = useRoute()

  const entries = ordersWithDue(db.getOrders())
  const total = round2(entries.reduce((sum, entry) => sum + entry.state.remaining, 0))

  if (entries.length === 0) {
    return (
      <EmptyState
        icon="wallet"
        title="К оплате ничего нет"
        description="Все заказы оплачены — долгов по клиентам не осталось."
        action={
          <Button icon="receipt" onClick={() => navigate('/orders')}>
            К заказам
          </Button>
        }
      />
    )
  }

  return (
    <div>
      <div className="debt-total">
        <span className="debt-total-label">Осталось получить</span>
        <span className="debt-total-value">{money(total)}</span>
        <span className="debt-total-sub">
          {entries.length} {plural(entries.length, 'заказ', 'заказа', 'заказов')} с остатком
        </span>
      </div>

      <div className="list">
        {entries.map(({ order, state }) => (
          <button
            key={order.id}
            className="list-item"
            onClick={() => navigate(`/orders/${order.id}`)}
          >
            <span className="list-item-main">
              <span className="list-item-title">
                {clientLabel(order.clientId ? db.getClient(order.clientId) : undefined, order.clientId)}
              </span>
              <span className="list-item-sub">
                {orderTitle(order)} · {formatDate(order.date)}
              </span>
              <span className="list-item-sub">
                Оплачено {money(state.paid)} из {money(state.total)}
              </span>
            </span>
            <span className="list-item-end">
              <span className="debt-due">{money(state.remaining)}</span>
              <span className="debt-due-label">к оплате</span>
            </span>
            <Icon name="chevron-right" size={16} />
          </button>
        ))}
      </div>
    </div>
  )
}
