import { useState } from 'react'
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from '../components/ui'
import { Icon } from '../components/Icons'
import { getLimits } from '../db/limits'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  emptyContractor,
  type Order,
  type OrderItem,
  type OrderStatus,
  type Product,
} from '../types'
import { fromDateInput, toDateInput } from '../utils/dates'
import { formatDate, money } from '../utils/format'
import { statusTone } from '../utils/status'

export function OrderDetail({ id, presetClientId }: { id: string; presetClientId?: string | null }) {
  const { db, plan, refresh } = useData()
  const { navigate } = useRoute()
  const isNew = id === 'new'

  const existing = isNew ? undefined : db.getOrder(id)
  const [editing, setEditing] = useState(isNew)

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
  const limits = getLimits(plan)

  const setStatus = (status: OrderStatus) => {
    db.saveOrder({ ...order, status })
    refresh()
  }

  return (
    <div>
      <Card className="detail-block">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Badge tone={statusTone(order.status)}>{ORDER_STATUS_LABEL[order.status]}</Badge>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{money(total)}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <DetailRow label="Клиент" value={client?.name ?? 'Без клиента'} />
          <DetailRow label="Дата" value={formatDate(order.date)} />
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
        {order.comment && (
          <div style={{ marginTop: 12 }}>
            <div className="detail-label">Комментарий</div>
            <div style={{ marginTop: 4 }}>{order.comment}</div>
          </div>
        )}
      </Card>

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
            disabled={!limits.pdf}
            onClick={() => {
              void import('../pdf/documents')
                .then(({ generateReceiptPdf }) =>
                  generateReceiptPdf({
                    order,
                    client,
                    contractor: db.getSettings().contractor ?? emptyContractor(),
                  }),
                )
                .catch((e) => {
                  window.alert(e instanceof Error ? e.message : 'Не удалось сформировать чек')
                })
            }}
          >
            Чек (PDF)
          </Button>
          {!limits.pdf && (
            <div className="field-hint" style={{ marginTop: 6 }}>
              Генерация чека доступна в полной версии.
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
  const { db, plan } = useData()
  const [clientId, setClientId] = useState(initial.clientId ?? '')
  const [date, setDate] = useState(toDateInput(initial.date))
  const [status, setStatus] = useState<OrderStatus>(initial.status)
  const [comment, setComment] = useState(initial.comment ?? '')
  const [items, setItems] = useState<OrderItem[]>(
    initial.items.length ? initial.items.map((it) => ({ ...it })) : [db.createEmptyItem()],
  )
  const [error, setError] = useState('')

  const clients = db.getClients()
  const canPickProduct = plan === 'FULL' && products.length > 0

  const patchItem = (index: number, patch: Partial<OrderItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
    if (error) setError('')
  }

  const addItem = () => setItems((prev) => [...prev, db.createEmptyItem()])

  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index))

  const total = items.reduce((sum, it) => sum + it.price * it.qty, 0)

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
      clientId: clientId || null,
      date: fromDateInput(date),
      status,
      comment: comment.trim(),
      items: clean,
    })
  }

  return (
    <div className="form">
      <Field label="Клиент">
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Без клиента</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
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
        <div className="section-head">
          <div className="section-title">Позиции</div>
          <Button size="sm" variant="secondary" icon="plus" onClick={addItem}>
            Добавить
          </Button>
        </div>

        {error && (
          <div className="field-error" style={{ marginBottom: 8 }}>
            {error}
          </div>
        )}

        <div className="items-editor">
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
                    <Select
                      value={item.productId ?? ''}
                      onChange={(e) => {
                        const productId = e.target.value
                        const product = products.find((p) => p.id === productId)
                        patchItem(
                          i,
                          product
                            ? { productId, name: product.name, price: product.price }
                            : { productId: null },
                        )
                      }}
                    >
                      <option value="">Позиция вручную</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {money(p.price)}
                        </option>
                      ))}
                    </Select>
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
                  </div>
                  <div style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 13 }}>
                    Сумма: <b style={{ color: 'var(--text)' }}>{money(lineSum)}</b>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="total-row">
        <span>Итого</span>
        <span className="total-value">{money(total)}</span>
      </div>

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


