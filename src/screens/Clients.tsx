import { useState } from 'react'
import { Badge, Button, EmptyState, Fab, cx } from '../components/ui'
import { Icon } from '../components/Icons'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { plural } from '../utils/format'

export function Clients() {
  const { db } = useData()
  const { navigate } = useRoute()
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'active' | 'archived'>('active')

  const clients = view === 'archived' ? db.getArchivedClients() : db.getClients()

  const filtered = clients.filter((c) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <div className="chips">
        <button
          className={cx('chip', view === 'active' && 'chip-active')}
          onClick={() => setView('active')}
        >
          Активные
        </button>
        <button
          className={cx('chip', view === 'archived' && 'chip-active')}
          onClick={() => setView('archived')}
        >
          Архив
        </button>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={18} />
          <input
            placeholder="Поиск клиента"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={view === 'archived' ? 'archive' : 'users'}
          title={
            query ? 'Ничего не найдено' : view === 'archived' ? 'Архив пуст' : 'Пока нет клиентов'
          }
          description={
            query
              ? 'Попробуйте изменить запрос'
              : view === 'archived'
                ? 'Клиенты, отправленные в архив, появятся здесь: заказы и история сохраняются'
                : 'Добавьте первого клиента, чтобы начать работу'
          }
          action={
            !query && view === 'active' ? (
              <Button icon="plus" onClick={() => navigate('/clients/new')}>
                Добавить клиента
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="list">
          {filtered.map((c) => {
            const count = db.getOrdersByClient(c.id).length
            return (
              <button
                key={c.id}
                className="list-item"
                onClick={() => navigate(`/clients/${c.id}`)}
              >
                <span className="avatar">{initials(c.name)}</span>
                <span className="list-item-main">
                  <span className="list-item-title">{c.name}</span>
                  <span className="list-item-sub">{c.phone || '—'}</span>
                </span>
                {view === 'archived' && <Badge tone="neutral">Архив</Badge>}
                <Badge tone="neutral">
                  {count} {plural(count, 'заказ', 'заказа', 'заказов')}
                </Badge>
              </button>
            )
          })}
        </div>
      )}

      {view === 'active' && (
        <Fab onClick={() => navigate('/clients/new')} label="Добавить клиента" />
      )}
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
