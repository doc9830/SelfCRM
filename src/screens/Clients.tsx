import { useState } from 'react'
import { Badge, Button, EmptyState, Fab } from '../components/ui'
import { Icon } from '../components/Icons'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { plural } from '../utils/format'
import { clientLink, clientsArchiveFromQuery } from '../utils/links'

// Вид списка (активные или архив) хранится в адресе: `?archive=1` включает архив,
// а переключает его значок в шапке (components/Layout.tsx), а не чипы на экране.
export function Clients() {
  const { db } = useData()
  const { route, navigate } = useRoute()
  const [query, setQuery] = useState('')
  const archived = clientsArchiveFromQuery(route.query.get('archive'))

  const clients = archived ? db.getArchivedClients() : db.getClients()

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
          icon={archived ? 'archive' : 'users'}
          title={query ? 'Ничего не найдено' : archived ? 'Архив пуст' : 'Пока нет клиентов'}
          description={
            query
              ? 'Попробуйте изменить запрос'
              : archived
                ? 'Клиенты, отправленные в архив, появятся здесь: заказы и история сохраняются'
                : 'Добавьте первого клиента — его заказы и история будут собираться автоматически'
          }
          action={
            !query && !archived ? (
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
                onClick={() => navigate(clientLink(c.id, archived))}
              >
                <span className="avatar">{initials(c.name)}</span>
                <span className="list-item-main">
                  <span className="list-item-title">{c.name}</span>
                  <span className="list-item-sub">{c.phone || '—'}</span>
                </span>
                <Badge tone="neutral">
                  {count} {plural(count, 'заказ', 'заказа', 'заказов')}
                </Badge>
              </button>
            )
          })}
        </div>
      )}

      {!archived && <Fab onClick={() => navigate('/clients/new')} label="Добавить клиента" />}
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
