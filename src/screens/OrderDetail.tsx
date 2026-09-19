import { useRef, useState } from 'react'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Textarea, cx } from '../components/ui'
import { Icon } from '../components/Icons'
import { SuggestField, type SuggestOption } from '../components/SuggestField'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  emptyContractor,
  isService,
  type Order,
  type OrderItem,
  type OrderStatus,
  type Product,
} from '../types'
import { fromDateInput, toDateInput } from '../utils/dates'
import { formatDate, formatShortDate, marginHint, money } from '../utils/format'
import { orderHeading, orderTitle } from '../utils/orders'
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

  const setStatus = (status: OrderStatus) => {
    db.saveOrder({ ...order, status })
    refresh()
  }

  return (
    <div>
      <Card className="detail-block">
        <div className="order-head">
          <span className="order-title">{orderTitle(order)}</span>
          <Badge tone={statusTone(order.status)}>{ORDER_STATUS_LABEL[order.status]}</Badge>
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

      <div className="detail-actions" style={{ flexWrap: 'wrap' }}>
        {order.status !== 'done' && order.status !== 'cancelled' && (
          <Button variant="primary" icon="check" onClick={() => setStatus('done')}>
            Завершить
          </Button>
        )}
        {order.status !== 'in_progress' && order.status !== 'done' && (
          <Button variant="secondary" onClick={() => setStatus('in_progress')}>
            В работу
          </Button>
        )}
        {order.status !== 'cancelled' && (
          <Button variant="danger" onClick={() => setStatus('cancelled')}>
            Отменить
          </Button>
        )}
      </div>

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
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
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

  const clients = db.getClients()
  const canPickProduct = products.length > 0

  const clientOptions: SuggestOption[] = clients.map((c) => ({
    id: c.id,
    label: c.name,
    sub: c.phone || undefined,
  }))
  const selectedClient = clients.find((c) => c.id === clientId)
  const selectedClientOption: SuggestOption | null = selectedClient
    ? { id: selectedClient.id, label: selectedClient.name, sub: selectedClient.phone || undefined }
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
                        onChange={(e) => patchItem(i, { price: toNumber(e.target.value) })}
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
                          onChange={(e) => patchItem(i, { cost: toNumber(e.target.value) })}
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


