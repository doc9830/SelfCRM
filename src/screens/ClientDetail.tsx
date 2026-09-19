import { useState } from 'react'
import { AddressField } from '../components/AddressField'
import { Icon } from '../components/Icons'
import { Badge, Button, Card, EmptyState, Field, Input, Textarea } from '../components/ui'
import type { AddressEntry } from '../db/addresses'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { ORDER_STATUS_LABEL, type Client } from '../types'
import { formatDate, money, plural } from '../utils/format'
import { uid } from '../utils/id'
import { openRoute, openTel, openTelegram, openWhatsApp } from '../utils/navigation'
import { formatOrderNumber } from '../utils/orders'
import { orderPaymentState } from '../utils/payments'
import { statusTone } from '../utils/status'

export function ClientDetail({ id }: { id: string }) {
  const { db, refresh } = useData()
  const { navigate } = useRoute()
  const isNew = id === 'new'

  const existing = isNew ? undefined : db.getClient(id)
  const [editing, setEditing] = useState(isNew)

  if (!isNew && !existing) {
    return (
      <EmptyState
        icon="users"
        title="Клиент не найден"
        action={<Button onClick={() => navigate('/clients')}>К списку</Button>}
      />
    )
  }

  if (editing) {
    return (
      <ClientForm
        initial={existing}
        onCancel={() => (isNew ? navigate('/clients') : setEditing(false))}
        onSave={(client) => {
          db.saveClient(client)
          refresh()
          navigate('/clients')
        }}
      />
    )
  }

  const client = existing as Client
  const orders = db.getOrdersByClient(client.id)
  const total = orders.reduce((s, o) => s + db.getOrderTotal(o), 0)

  return (
    <div>
      <Card className="detail-block">
        <div className="order-head" style={{ marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>{client.name}</h2>
          {client.archived && <Badge tone="neutral">В архиве</Badge>}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Клиент с {formatDate(client.createdAt)}
          {client.archived && client.archivedAt ? ` · в архиве с ${formatDate(client.archivedAt)}` : ''}
        </div>
        {client.archived && (
          <div className="field-hint" style={{ marginTop: 6 }}>
            Заказы и история сохранены. Восстановите клиента, чтобы снова оформлять заказы.
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          {client.phone ? (
            <div className="detail-row">
              <span className="detail-label">Телефон</span>
              <div className="detail-phone">
                <button
                  type="button"
                  className="phone-value"
                  onClick={() => openTel(client.phone)}
                >
                  {client.phone}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => openTel(client.phone)}
                >
                  <Icon name="phone" size={16} />
                  Вызов
                </button>
                {/* Мессенджеры: приложение только открывает переписку по номеру. */}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => openTelegram(client.phone)}
                >
                  <Icon name="telegram" size={16} />
                  Telegram
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => openWhatsApp(client.phone)}
                >
                  <Icon name="whatsapp" size={16} />
                  WhatsApp
                </button>
              </div>
            </div>
          ) : (
            <DetailRow label="Телефон" value="—" />
          )}
          <DetailRow label="Email" value={client.email || '—'} />
          <DetailRow label="Комментарий" value={client.comment || '—'} />
          {client.address && <DetailRow label="Адрес" value={client.address} />}
          {client.cadastralNumber && (
            <DetailRow label="Кадастровый номер" value={client.cadastralNumber} />
          )}
        </div>
      </Card>

      {client.address && (
        <div style={{ marginTop: -4, marginBottom: 16 }}>
          <Button
            variant="outline"
            icon="navigation"
            full
            onClick={() =>
              openRoute({
                lat: client.latitude ?? 0,
                lng: client.longitude ?? 0,
                label: client.name,
                address: client.address,
              })
            }
          >
            Маршрут
          </Button>
        </div>
      )}

      <div className="detail-actions">
        <Button variant="secondary" icon="edit" full onClick={() => setEditing(true)}>
          Изменить
        </Button>
        {client.archived ? (
          <Button
            variant="primary"
            icon="refresh"
            full
            onClick={() => {
              db.restoreClient(client.id)
              refresh()
            }}
          >
            Восстановить
          </Button>
        ) : (
          <Button variant="primary" icon="plus" full onClick={() => navigate(`/orders/new?client=${client.id}`)}>
            Заказ
          </Button>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <div className="section-title">История заказов</div>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {orders.length} · {money(total)}
          </span>
        </div>

        {orders.length === 0 ? (
          <EmptyState
            icon="receipt"
            title="Заказов пока нет"
            description="Создайте первый заказ для этого клиента"
          />
        ) : (
          <div className="list">
            {orders.map((o) => {
              const payment = orderPaymentState(o)
              return (
                <button key={o.id} className="list-item" onClick={() => navigate(`/orders/${o.id}`)}>
                  <span className="list-item-main">
                    <span className="list-item-title">
                      {formatOrderNumber(o) ? `${formatOrderNumber(o)} · ` : ''}
                      {formatDate(o.date)}
                    </span>
                    <span className="list-item-sub">
                      {o.items.length} {plural(o.items.length, 'позиция', 'позиции', 'позиций')} ·{' '}
                      {ORDER_STATUS_LABEL[o.status]}
                      {payment.remaining > 0 && o.status !== 'cancelled'
                        ? ` · к оплате ${money(payment.remaining)}`
                        : ''}
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
      </div>

      {client.archived ? (
        <Button
          variant="danger"
          icon="trash"
          full
          style={{ marginTop: 20 }}
          onClick={() => {
            const count = orders.length
            const question =
              count > 0
                ? `Удалить клиента и все его заказы (${count})? Действие необратимо, товары вернутся на склад.`
                : 'Удалить клиента навсегда? Действие необратимо.'
            if (window.confirm(question)) {
              db.deleteClient(client.id)
              refresh()
              navigate('/clients')
            }
          }}
        >
          Удалить навсегда
        </Button>
      ) : (
        <Button
          variant="secondary"
          icon="archive"
          full
          style={{ marginTop: 20 }}
          onClick={() => {
            if (
              window.confirm(
                'Отправить клиента в архив? Заказы, суммы и история склада сохранятся, а клиент исчезнет из списка и из выбора при создании заказа.',
              )
            ) {
              db.archiveClient(client.id)
              refresh()
            }
          }}
        >
          В архив
        </Button>
      )}
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

function ClientForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Client
  onSave: (client: Client) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [addressText, setAddressText] = useState(initial?.address ?? '')
  const [addressEntry, setAddressEntry] = useState<AddressEntry | null>(
    initial && initial.latitude != null && initial.longitude != null
      ? {
          id: '',
          cadastralNumber: initial.cadastralNumber ?? '',
          address: initial.address ?? '',
          lat: initial.latitude,
          lng: initial.longitude,
        }
      : null,
  )
  const [error, setError] = useState('')

  const submit = () => {
    if (!name.trim()) {
      setError('Укажите имя клиента')
      return
    }
    const hasCoords = addressEntry && (addressEntry.lat !== 0 || addressEntry.lng !== 0)
    onSave({
      id: initial?.id ?? uid(),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      comment: comment.trim(),
      address: addressText.trim() || undefined,
      cadastralNumber: addressEntry?.cadastralNumber || undefined,
      latitude: hasCoords && addressEntry ? addressEntry.lat : undefined,
      longitude: hasCoords && addressEntry ? addressEntry.lng : undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    })
  }

  return (
    <div className="form">
      <Field label="Имя *" error={error}>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (error) setError('')
          }}
          placeholder="Иван Петров"
          autoFocus
        />
      </Field>
      <Field label="Телефон">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 900 000-00-00" />
      </Field>
      <Field label="Email">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="mail@example.com"
        />
      </Field>
      <Field label="Адрес">
        <AddressField
          initialAddress={addressText}
          initialEntry={addressEntry}
          onChange={(value, entry) => {
            setAddressText(value)
            setAddressEntry(entry)
          }}
        />
      </Field>
      <Field label="Комментарий">
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Заметки о клиенте" />
      </Field>

      <div className="form-actions">
        <Button variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button variant="primary" icon="check" onClick={submit}>
          Сохранить
        </Button>
      </div>
    </div>
  )
}

