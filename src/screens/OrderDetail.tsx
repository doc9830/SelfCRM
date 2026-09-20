import { useRef, useState } from 'react'
import { Button, Card, EmptyState, Field, Input, Modal, MoneyInput, Select, Textarea, blockNonNumericKeys, cx } from '../components/ui'
import { Icon } from '../components/Icons'
import { SuggestField, type SuggestOption } from '../components/SuggestField'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  REMINDER_KINDS,
  emptyContractor,
  isService,
  type Order,
  type OrderItem,
  type OrderStatus,
  type Product,
  type ReminderKind,
} from '../types'
import { fromDateInput, toDateInput } from '../utils/dates'
import { formatDate, formatShortDate, marginHint, money } from '../utils/format'
import { orderHeading, orderTitle } from '../utils/orders'
import {
  REMINDER_KIND_HINT,
  REMINDER_KIND_ICON,
  REMINDER_KIND_LABEL,
  defaultReminderDueAt,
  reminderDueAtFromInputs,
  reminderHintText,
  reminderTextError,
  reminderTextForKind,
  reminderTime,
  reminderWhenLabel,
} from '../utils/reminders'
import {
  PAYMENT_STATUS_LABEL,
  addPayment,
  orderPaymentState,
  removePayment,
  type PaymentState,
} from '../utils/payments'
import { orderCost, orderProfit } from '../utils/stats'
import { statusTone } from '../utils/status'

export function OrderDetail({ id, presetClientId }: { id: string; presetClientId?: string | null }) {
  const { db, refresh } = useData()
  const { navigate } = useRoute()
  const isNew = id === 'new'

  const existing = isNew ? undefined : db.getOrder(id)
  const [editing, setEditing] = useState(isNew)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState('')
  // Окно «Добавить оплату» — состояние хука выше ранних выходов (правила хуков).
  const [paymentOpen, setPaymentOpen] = useState(false)
  // Окно создания напоминания — по тем же причинам тоже до ранних выходов.
  const [reminderOpen, setReminderOpen] = useState(false)

  if (!isNew && !existing) {
    return (
      <EmptyState
        icon="receipt"
        title="Заказ не найден"
        action={<Button onClick={() => navigate('/orders')}>К списку</Button>}
      />
    )
  }

  if (editing) {
    const initial = existing ?? db.createOrderDraft(presetClientId ?? null)
    return (
      <OrderForm
        initial={initial}
        products={db.getProducts()}
        onCancel={() => (isNew ? navigate('/orders') : setEditing(false))}
        onSave={(order) => {
          db.saveOrder(order)
          refresh()
          navigate('/orders')
        }}
        onDelete={
          isNew
            ? undefined
            : () => {
                if (window.confirm('Удалить заказ?')) {
                  db.deleteOrder(id)
                  refresh()
                  navigate('/orders')
                }
              }
        }
      />
    )
  }

  const order = existing as Order
  const client = order.clientId ? db.getClient(order.clientId) : undefined
  const total = db.getOrderTotal(order)
  const payment = orderPaymentState(order)
  const payments = order.payments ?? []
  const reminders = db.getOrderReminders(order.id)

  const setStatus = (status: OrderStatus) => {
    if (status === order.status) return
    // Отмена возвращает товары на склад и убирает заказ из выручки — спрашиваем.
    if (
      status === 'cancelled' &&
      !window.confirm('Отменить заказ? Товары вернутся на склад, заказ выпадет из выручки.')
    ) {
      return
    }
    db.saveOrder({ ...order, status })
    refresh()
  }

  return (
    <div>
      <Card className="detail-block">
        <div className="order-head">
          <span className="order-title">{orderTitle(order)}</span>
        </div>

        {/* Статус меняется одним тапом: активный сегмент окрашен в цвет статуса. */}
        <div className="status-picker" role="group" aria-label="Статус заказа">
          {ORDER_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={cx(
                'status-option',
                order.status === status && 'status-option-active',
                order.status === status && `badge-${statusTone(status)}`,
              )}
              aria-pressed={order.status === status}
              onClick={() => setStatus(status)}
            >
              {ORDER_STATUS_LABEL[status]}
            </button>
          ))}
        </div>
        <div className="order-total">
          <span className="order-total-label">Сумма заказа</span>
          <span className="order-total-value">{money(total)}</span>
        </div>

        {/* Полоса оплаты: цвет и подпись меняются по мере внесения платежей. */}
        <div className="pay">
          <div className="pay-head">
            <span className={cx('pay-status', `pay-status-${payment.status}`)}>
              {PAYMENT_STATUS_LABEL[payment.status]}
            </span>
            <span className="pay-sum">
              {money(payment.paid)} из {money(payment.total)}
            </span>
          </div>
          <div className={cx('pay-track', `pay-track-${payment.status}`)}>
            <div className={cx('pay-fill', `pay-fill-${payment.status}`)} style={{ width: `${payment.percent}%` }} />
          </div>
          {payment.remaining > 0 ? (
            <div className="pay-hint">Осталось оплатить {money(payment.remaining)}</div>
          ) : (
            <div className="pay-hint">
              {payment.status === 'overpaid' ? 'Внесено больше суммы заказа' : 'Заказ оплачен полностью'}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <DetailRow label="Дата" value={formatDate(order.date)} />
          <DetailRow label="Клиент" value={client?.name ?? 'Без клиента'} />
        </div>
      </Card>

      <Card className="detail-block">
        <div className="section-title" style={{ marginBottom: 8 }}>
          Позиции
        </div>
        {order.items.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Нет позиций</div>
        ) : (
          <div>
            {order.items.map((item, i) => (
              <div className="detail-row" key={i}>
                <span>
                  {item.name} <span style={{ color: 'var(--text-muted)' }}>× {item.qty}</span>
                </span>
                <span style={{ fontWeight: 600 }}>{money(item.price * item.qty)}</span>
              </div>
            ))}
          </div>
        )}
        {orderCost(order) > 0 && (
          <div className="field-hint" style={{ marginTop: 8 }}>
            Себестоимость {money(orderCost(order))} · прибыль{' '}
            <b style={{ color: 'var(--success)' }}>{money(orderProfit(order))}</b>
          </div>
        )}
        {order.comment && (
          <div style={{ marginTop: 12 }}>
            <div className="detail-label">Комментарий</div>
            <div style={{ marginTop: 4 }}>{order.comment}</div>
          </div>
        )}
      </Card>

      <Card className="detail-block">
        <div className="section-title" style={{ marginBottom: 8 }}>
          Оплата
        </div>
        <div className="payment-totals">
          <div>
            <div className="payment-total-label">Оплачено</div>
            <div className="payment-total-value">{money(payment.paid)}</div>
          </div>
          <div>
            <div className="payment-total-label">Остаток</div>
            <div className="payment-total-value">{money(payment.remaining)}</div>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="payment-empty">
            Предоплата и последующие платежи появятся здесь
          </div>
        ) : (
          <div>
            {payments.map((item) => (
              <div className="payment-row" key={item.id}>
                <span className="payment-when">{formatShortDate(item.date)}</span>
                <span className="payment-note">{item.comment || 'Оплата'}</span>
                <span className="payment-sum">{money(item.amount)}</span>
                <button
                  className="icon-btn"
                  aria-label="Удалить платёж"
                  onClick={() => {
                    db.saveOrder(removePayment(order, item.id))
                    refresh()
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button
          className="items-add"
          variant="secondary"
          icon="wallet"
          full
          onClick={() => setPaymentOpen(true)}
        >
          Добавить оплату
        </Button>
      </Card>

      {paymentOpen && (
        <PaymentModal
          order={order}
          onClose={() => setPaymentOpen(false)}
          onSaved={() => {
            refresh()
            setPaymentOpen(false)
          }}
        />
      )}

      {/* Напоминания живут внутри заказа: список и кнопка создания — перед чеком. */}
      <Card className="detail-block">
        <div className="section-title" style={{ marginBottom: 8 }}>
          Напоминания
        </div>
        {reminders.length === 0 ? (
          <div className="payment-empty">Напоминаний по заказу нет</div>
        ) : (
          <div className="reminder-list">
            {reminders.map((reminder) => (
              <div
                className={cx('reminder-row', reminder.done && 'reminder-row-done')}
                key={reminder.id}
              >
                <button
                  type="button"
                  className={cx('reminder-check', reminder.done && 'reminder-check-on')}
                  aria-pressed={Boolean(reminder.done)}
                  aria-label={
                    reminder.done ? 'Вернуть напоминание в активные' : 'Отметить выполненным'
                  }
                  onClick={() => {
                    db.toggleReminder(order.id, reminder.id)
                    refresh()
                  }}
                >
                  {reminder.done && <Icon name="check" size={14} />}
                </button>
                <span className="reminder-kind">
                  <Icon name={REMINDER_KIND_ICON[reminder.kind]} size={16} />
                </span>
                <span className="reminder-main">
                  <span className="reminder-text">{reminder.text}</span>
                  <span className="reminder-when">{reminderWhenLabel(reminder.dueAt)}</span>
                </span>
                <button
                  className="icon-btn"
                  aria-label="Удалить напоминание"
                  onClick={() => {
                    db.deleteReminder(order.id, reminder.id)
                    refresh()
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <Button
          className="items-add"
          variant="secondary"
          icon="bell"
          full
          onClick={() => setReminderOpen(true)}
        >
          Напомнить
        </Button>
      </Card>

      {reminderOpen && (
        <ReminderModal
          order={order}
          onClose={() => setReminderOpen(false)}
          onSaved={() => {
            refresh()
            setReminderOpen(false)
          }}
        />
      )}

      {order.status === 'done' && (
        <div style={{ marginTop: 16 }}>
          <Button
            variant="primary"
            icon="doc"
            full
            onClick={() => {
              setPdfBusy(true)
              setPdfError('')
              void import('../pdf/documents')
                .then(({ generateReceiptPdf }) =>
                  generateReceiptPdf({
                    order,
                    client,
                    contractor: db.getSettings().contractor ?? emptyContractor(),
                  }),
                )
                .catch((e) => {
                  setPdfError(e instanceof Error ? e.message : 'Не удалось сформировать чек')
                })
                .finally(() => setPdfBusy(false))
            }}
          >
            {pdfBusy ? 'Формирование…' : 'Чек (PDF)'}
          </Button>
          {pdfError && (
            <div className="field-error" style={{ marginTop: 6 }}>
              {pdfError}
            </div>
          )}
        </div>
      )}

      <div className="detail-actions">
        <Button variant="outline" icon="edit" full onClick={() => setEditing(true)}>
          Изменить
        </Button>
        <Button
          variant="danger"
          icon="trash"
          full
          onClick={() => {
            if (window.confirm('Удалить заказ? Остатки вернутся на склад.')) {
              db.deleteOrder(order.id)
              refresh()
              navigate('/orders')
            }
          }}
        >
          Удалить
        </Button>
      </div>
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

// Окно платежа: сумма, комментарий и кнопка «Полностью», которая подставляет
// остаток — после сохранения заказ сразу помечается как оплаченный.
function PaymentModal({
  order,
  onSaved,
  onClose,
}: {
  order: Order
  onSaved: () => void
  onClose: () => void
}) {
  const { db } = useData()
  const state = orderPaymentState(order)
  const [amount, setAmount] = useState(state.remaining > 0 ? String(state.remaining) : '')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    const value = Number(amount)
    if (amount.trim() === '' || !Number.isFinite(value) || value <= 0) {
      setError('Укажите сумму больше нуля')
      return
    }
    db.saveOrder(addPayment(order, value, comment))
    onSaved()
  }

  return (
    <Modal title="Добавить оплату" onClose={onClose}>
      <div className="form">
        <div className="payment-totals">
          <div>
            <div className="payment-total-label">Сумма заказа</div>
            <div className="payment-total-value">{money(state.total)}</div>
          </div>
          <div>
            <div className="payment-total-label">Остаток</div>
            <div className="payment-total-value">{money(state.remaining)}</div>
          </div>
        </div>

        {state.remaining > 0 && (
          <div className="chips" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className="chip"
              onClick={() => {
                setAmount(String(state.remaining))
                if (error) setError('')
              }}
            >
              Полностью · {money(state.remaining)}
            </button>
          </div>
        )}

        <Field label="Сумма, ₽" error={error}>
          <MoneyInput
            value={amount}
            onChange={(next) => {
              setAmount(next)
              if (error) setError('')
            }}
            autoFocus
          />
        </Field>
        <Field label="Комментарий" hint="Например: предоплата, наличные, перевод">
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Предоплата" />
        </Field>

        <div className="form-actions">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" icon="check" onClick={submit}>
            Внести оплату
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// Окно напоминания: вид («о чём»), срок (сегодня / завтра / свои дата и время)
// и текст. Текст подставляется по виду, его можно изменить; для «Другого» он
// обязателен, потому что подсказки у этого вида нет.
function ReminderModal({
  order,
  onSaved,
  onClose,
}: {
  order: Order
  onSaved: () => void
  onClose: () => void
}) {
  const { db } = useData()
  const [kind, setKind] = useState<ReminderKind>('call')
  const [day, setDay] = useState<'today' | 'tomorrow' | 'custom'>('today')
  const [customDate, setCustomDate] = useState(() => toDateInput(defaultReminderDueAt('today')))
  const [customTime, setCustomTime] = useState(() => reminderTime(defaultReminderDueAt('today')))
  const [text, setText] = useState(() => reminderHintText('call'))
  const [error, setError] = useState('')

  const pickKind = (next: ReminderKind) => {
    setKind(next)
    // Подсказку заменяем, а свой текст пользователя оставляем как есть.
    setText((current) => reminderTextForKind(next, current))
    if (error) setError('')
  }

  const dueAt =
    day === 'custom' ? reminderDueAtFromInputs(customDate, customTime) : defaultReminderDueAt(day)

  const submit = () => {
    const textError = reminderTextError(kind, text)
    if (textError) {
      setError(textError)
      return
    }
    if (new Date(dueAt).getTime() < Date.now()) {
      setError('Укажите будущую дату и время')
      return
    }
    db.addReminder(order.id, { kind, text, dueAt })
    onSaved()
  }

  return (
    <Modal title="Напомнить" onClose={onClose}>
      <div className="form">
        <div className="field">
          <span className="field-label">О чём напомнить?</span>
          <div className="reminder-kinds" role="group" aria-label="О чём напомнить">
            {REMINDER_KINDS.map((item) => (
              <button
                key={item}
                type="button"
                className={cx('reminder-kind-btn', item === kind && 'reminder-kind-btn-active')}
                aria-pressed={item === kind}
                onClick={() => pickKind(item)}
              >
                <Icon name={REMINDER_KIND_ICON[item]} size={16} />
                {REMINDER_KIND_LABEL[item]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Когда</span>
          <div className="chips" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={cx('chip', day === 'today' && 'chip-active')}
              aria-pressed={day === 'today'}
              onClick={() => {
                setDay('today')
                if (error) setError('')
              }}
            >
              Сегодня
            </button>
            <button
              type="button"
              className={cx('chip', day === 'tomorrow' && 'chip-active')}
              aria-pressed={day === 'tomorrow'}
              onClick={() => {
                setDay('tomorrow')
                if (error) setError('')
              }}
            >
              Завтра
            </button>
            <button
              type="button"
              className={cx('chip', day === 'custom' && 'chip-active')}
              aria-pressed={day === 'custom'}
              onClick={() => {
                setDay('custom')
                if (error) setError('')
              }}
            >
              Выбрать дату и время
            </button>
          </div>
          {day === 'custom' ? (
            <div className="reminder-datetime">
              <Input
                type="date"
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value)
                  if (error) setError('')
                }}
              />
              <Input
                type="time"
                value={customTime}
                onChange={(e) => {
                  setCustomTime(e.target.value)
                  if (error) setError('')
                }}
              />
            </div>
          ) : (
            <span className="field-hint">{reminderWhenLabel(dueAt)}</span>
          )}
        </div>

        <Field
          label="Комментарий"
          error={error}
          hint={kind === 'other' ? 'Для «Другого» текст обязателен' : 'Текст можно изменить'}
        >
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              if (error) setError('')
            }}
            placeholder={REMINDER_KIND_HINT[kind] || 'О чём напомнить'}
          />
        </Field>

        <div className="form-actions">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" icon="bell" onClick={submit}>
            Создать
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function OrderForm({
  initial,
  products,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Order
  products: Product[]
  onSave: (order: Order) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const { db } = useData()
  const [clientId, setClientId] = useState(initial.clientId ?? '')
  const [date, setDate] = useState(toDateInput(initial.date))
  const [status, setStatus] = useState<OrderStatus>(initial.status)
  const [comment, setComment] = useState(initial.comment ?? '')
  const [items, setItems] = useState<OrderItem[]>(
    initial.items.length ? initial.items.map((it) => ({ ...it })) : [db.createEmptyItem()],
  )
  const [error, setError] = useState('')
  // Кнопка «Добавить позицию» стоит под списком — здесь подкручиваем к новому полю.
  const itemsRef = useRef<HTMLDivElement>(null)

  // В подсказках — только активные клиенты: архивного нельзя выбрать для нового
  // заказа, но если заказ уже оформлен на архивного, показываем его с пометкой.
  const clients = db.getClients()
  const canPickProduct = products.length > 0

  const clientOptions: SuggestOption[] = clients.map((c) => ({
    id: c.id,
    label: c.name,
    sub: c.phone || undefined,
  }))
  const selectedClient = clientId ? db.getClient(clientId) : undefined
  const selectedClientOption: SuggestOption | null = selectedClient
    ? {
        id: selectedClient.id,
        label: selectedClient.archived ? `${selectedClient.name} (архив)` : selectedClient.name,
        sub: selectedClient.phone || undefined,
      }
    : null

  const productOptions: SuggestOption[] = products.map((p) => ({
    id: p.id,
    label: p.name,
    sub: [isService(p) ? 'Услуга' : p.sku, money(p.price)].filter(Boolean).join(' · '),
  }))

  const patchItem = (index: number, patch: Partial<OrderItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
    if (error) setError('')
  }

  const addItem = () => {
    setItems((prev) => [...prev, db.createEmptyItem()])
    // Новое поле появляется над кнопкой: если оно не поместилось — подкручиваем к нему.
    window.setTimeout(() => {
      const cards = itemsRef.current?.querySelectorAll('.item-card')
      cards?.[cards.length - 1]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 60)
  }

  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index))

  const total = items.reduce((sum, it) => sum + it.price * it.qty, 0)
  const totalCost = items.reduce((sum, it) => sum + (it.cost ?? 0) * it.qty, 0)
  const itemProfit = (item: OrderItem) => (item.price - (item.cost ?? 0)) * item.qty
  const itemCost = (item: OrderItem) => (item.cost ?? 0) * item.qty

  const submit = () => {
    const clean = items
      .map((it) => ({ ...it, name: it.name.trim() }))
      .filter((it) => it.name || it.qty > 0 || it.price > 0)

    if (clean.length === 0) {
      setError('Добавьте хотя бы одну позицию')
      return
    }
    for (const it of clean) {
      if (!it.name) {
        setError('Укажите название позиции')
        return
      }
      if (it.qty <= 0) {
        setError('Укажите количество больше нуля')
        return
      }
      // Цена и себестоимость — деньги: минус здесь только опечатка.
      if (it.price < 0 || (it.cost ?? 0) < 0) {
        setError('Цена и себестоимость не могут быть отрицательными')
        return
      }
    }

    onSave({
      id: initial.id,
      number: initial.number,
      clientId: clientId || null,
      date: fromDateInput(date),
      status,
      // Платежи вводятся в карточке заказа и здесь сохраняются как есть.
      payments: initial.payments ?? [],
      comment: comment.trim(),
      items: clean,
    })
  }

  return (
    <div className="form">
      <Field label="Клиент">
        <SuggestField
          selected={selectedClientOption}
          options={clientOptions}
          placeholder="Начните вводить имя или телефон…"
          icon="users"
          emptyLabel="Без клиента"
          revertOnBlur
          onSelect={(option) => setClientId(option ? option.id : '')}
        />
      </Field>

      <Field label="Дата">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <Field label="Статус">
        <Select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </Field>

      <div>
        <div className="section-title" style={{ marginBottom: 10 }}>
          Позиции
        </div>

        {error && (
          <div className="field-error" style={{ marginBottom: 8 }}>
            {error}
          </div>
        )}

        <div className="items-editor" ref={itemsRef}>
          {items.map((item, i) => {
            const lineSum = item.price * item.qty
            return (
              <div className="item-card" key={i}>
                <div className="item-card-head">
                  <span className="item-label">Позиция {i + 1}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 32, height: 32 }}
                    onClick={() => removeItem(i)}
                    aria-label="Удалить позицию"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>

                {canPickProduct && (
                  <div style={{ marginBottom: 8 }}>
                    <SuggestField
                      selected={
                        item.productId
                          ? (productOptions.find((o) => o.id === item.productId) ?? null)
                          : null
                      }
                      options={productOptions}
                      placeholder="Поиск товара или услуги…"
                      icon="box"
                      emptyLabel="Позиция вручную"
                      revertOnBlur
                      onSelect={(option) => {
                        if (!option) {
                          patchItem(i, { productId: null })
                          return
                        }
                        const product = products.find((p) => p.id === option.id)
                        if (product) {
                          // Себестоимость — снимок из каталога: по нему считается прибыль.
                          patchItem(i, {
                            productId: product.id,
                            name: product.name,
                            price: product.price,
                            cost: product.cost ?? 0,
                          })
                        }
                      }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Input
                    placeholder="Название позиции"
                    value={item.name}
                    onChange={(e) => patchItem(i, { name: e.target.value })}
                  />
                  <div className="item-card-row">
                    <Field label="Цена, ₽">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={item.price ? String(item.price) : ''}
                        onChange={(e) => patchItem(i, { price: nonNegative(e.target.value) })}
                        onKeyDown={blockNonNumericKeys}
                      />
                    </Field>
                    <Field label="Кол-во">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={item.qty ? String(item.qty) : ''}
                        onChange={(e) => patchItem(i, { qty: toNumber(e.target.value) })}
                        onKeyDown={blockNonNumericKeys}
                      />
                    </Field>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <Field
                        label="Себестоимость, ₽"
                        hint={marginHint(item.price, item.cost ?? 0)}
                      >
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          value={item.cost ? String(item.cost) : ''}
                          onChange={(e) => patchItem(i, { cost: nonNegative(e.target.value) })}
                          onKeyDown={blockNonNumericKeys}
                          placeholder="0"
                        />
                      </Field>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 13 }}>
                    Сумма: <b style={{ color: 'var(--text)' }}>{money(lineSum)}</b>
                    {itemCost(item) > 0 && (
                      <>
                        {' · прибыль '}
                        <b style={{ color: 'var(--success)' }}>{money(itemProfit(item))}</b>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <Button className="items-add" variant="secondary" icon="plus" full onClick={addItem}>
          Добавить позицию
        </Button>
      </div>

      <div className="total-row">
        <span>Итого</span>
        <span className="total-value">{money(total)}</span>
      </div>
      {totalCost > 0 && (
        <div className="field-hint" style={{ textAlign: 'right', marginTop: 6 }}>
          Себестоимость {money(totalCost)} · прибыль{' '}
          <b style={{ color: 'var(--success)' }}>{money(total - totalCost)}</b>
        </div>
      )}

      <Field label="Комментарий">
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Дополнительная информация"
        />
      </Field>

      <div className="form-actions">
        <Button variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button variant="primary" icon="check" onClick={submit}>
          Сохранить
        </Button>
      </div>

      {onDelete && (
        <Button variant="danger" icon="trash" full onClick={onDelete}>
          Удалить заказ
        </Button>
      )}
    </div>
  )
}

function toNumber(value: string): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// Цена, себестоимость и количество — неотрицательные: поле остаётся
// type="number" (в нём цифровая клавиатура), а минус отсекаем на вводе.
function nonNegative(value: string): number {
  return Math.max(0, toNumber(value))
}


