import { useState } from 'react'
import { Badge, Button, EmptyState, Fab, cx } from '../components/ui'
import { Icon } from '../components/Icons'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { collectClientTags, filterClientsByTag, sameClientTag } from '../utils/clients'
import { plural } from '../utils/format'
import { clientLink, clientTagFromQuery, clientsArchiveFromQuery, clientsLink } from '../utils/links'

// Вид списка (активные или архив) и фильтр по тегу живут в адресе: `?archive=1` включает
// архив, `?tag=Оптовик` — фильтр. Переключатель архива — значок в шапке
// (components/Layout.tsx), чипы тегов — на самом экране.
export function Clients() {
  const { db } = useData()
  const { route, navigate } = useRoute()
  const [query, setQuery] = useState('')
  const archived = clientsArchiveFromQuery(route.query.get('archive'))
  const tag = clientTagFromQuery(route.query.get('tag'))

  const clients = archived ? db.getArchivedClients() : db.getClients()
  // Чипы собираются из того же списка, что виден на экране: в архиве предлагаются только
  // теги архивных клиентов. Тег из адреса, которого в базе уже нет (последний клиент
  // потерял тег), фильтром не считается — иначе список был бы пустым без объяснения.
  const tags = collectClientTags(clients)
  const activeTag = tag && tags.some((item) => sameClientTag(item, tag)) ? tag : null
  const chips = tags.map((item) => ({ tag: item, active: tag !== null && sameClientTag(item, tag) }))

  const filtered = filterClientsByTag(clients, activeTag).filter((c) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    )
  })

  const emptyTitle = query
    ? 'Ничего не найдено'
    : activeTag
      ? 'Нет клиентов с этим тегом'
      : archived
        ? 'Архив пуст'
        : 'Пока нет клиентов'
  const emptyDescription = query
    ? 'Попробуйте изменить запрос'
    : activeTag
      ? 'Снимите фильтр или проставьте тег в карточке клиента'
      : archived
        ? 'Клиенты, отправленные в архив, появятся здесь: заказы и история сохраняются'
        : 'Добавьте первого клиента — его заказы и история будут собираться автоматически'

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

      {chips.length > 0 && (
        <div className="chips">
          <button
            className={cx('chip', !activeTag && 'chip-active')}
            onClick={() => navigate(clientsLink(archived, null))}
          >
            Все
          </button>
          {chips.map((chip) => (
            <button
              key={chip.tag}
              className={cx('chip', chip.active && 'chip-active')}
              onClick={() => navigate(clientsLink(archived, chip.tag))}
            >
              {chip.tag}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={archived ? 'archive' : 'users'}
          title={emptyTitle}
          description={emptyDescription}
          action={
            !query && !activeTag && !archived ? (
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
            const clientTags = c.tags ?? []
            return (
              <button
                key={c.id}
                className="list-item"
                onClick={() => navigate(clientLink(c.id, archived, activeTag))}
              >
                <span className="avatar">{initials(c.name)}</span>
                <span className="list-item-main">
                  <span className="list-item-title">{c.name}</span>
                  <span className="list-item-sub">{c.phone || '—'}</span>
                  {clientTags.length > 0 && (
                    <span className="tag-row">
                      {clientTags.map((item) => (
                        <span className="tag-pill" key={item}>
                          {item}
                        </span>
                      ))}
                    </span>
                  )}
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
