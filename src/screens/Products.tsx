import { useState } from 'react'
import { Badge, Button, EmptyState, Fab, Field, Input, Modal, Textarea } from '../components/ui'
import { Icon } from '../components/Icons'
import { useData } from '../state/DataContext'
import type { Product } from '../types'
import { money, plural } from '../utils/format'
import { uid } from '../utils/id'

export function Products() {
  const { db, refresh } = useData()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Product | 'new' | null>(null)

  const products = db.getProducts()
  const filtered = products.filter((p) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={18} />
          <input
            placeholder="Поиск товара"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="box"
          title={query ? 'Ничего не найдено' : 'Пока нет товаров'}
          description={query ? 'Попробуйте изменить запрос' : 'Добавьте первый товар'}
          action={
            !query ? (
              <Button icon="plus" onClick={() => setEditing('new')}>
                Добавить товар
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="list">
          {filtered.map((p) => (
            <button key={p.id} className="list-item" onClick={() => setEditing(p)}>
              <span className="list-item-main">
                <span className="list-item-title">{p.name}</span>
                <span className="list-item-sub">
                  {p.sku || '—'} · {money(p.price)}
                </span>
              </span>
              <Badge tone={p.stock <= p.minStock ? 'red' : 'neutral'}>
                {p.stock} {plural(p.stock, 'шт', 'шт', 'шт')}
              </Badge>
            </button>
          ))}
        </div>
      )}

      <Fab onClick={() => setEditing('new')} label="Добавить товар" />

      {editing && (
        <ProductForm
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(product) => {
            db.saveProduct(product)
            refresh()
            setEditing(null)
          }}
          onDelete={
            editing === 'new'
              ? undefined
              : () => {
                  if (window.confirm('Удалить товар? Связанные позиции в заказах сохранятся.')) {
                    db.deleteProduct(editing.id)
                    refresh()
                    setEditing(null)
                  }
                }
          }
        />
      )}
    </div>
  )
}

function ProductForm({
  initial,
  onSave,
  onClose,
  onDelete,
}: {
  initial?: Product
  onSave: (product: Product) => void
  onClose: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [sku, setSku] = useState(initial?.sku ?? '')
  const [price, setPrice] = useState(initial ? String(initial.price) : '')
  const [stock, setStock] = useState(initial ? String(initial.stock) : '')
  const [minStock, setMinStock] = useState(initial ? String(initial.minStock) : '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [error, setError] = useState('')

  const submit = () => {
    if (!name.trim()) {
      setError('Укажите название товара')
      return
    }
    onSave({
      id: initial?.id ?? uid(),
      name: name.trim(),
      sku: sku.trim(),
      price: toNumber(price),
      stock: Math.round(toNumber(stock)),
      minStock: Math.round(toNumber(minStock)),
      description: description.trim(),
    })
  }

  return (
    <Modal title={initial ? 'Изменить товар' : 'Новый товар'} onClose={onClose}>
      <div className="form">
        <Field label="Название *" error={error}>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (error) setError('')
            }}
            autoFocus
          />
        </Field>
        <Field label="Артикул">
          <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU-001" />
        </Field>
        <div className="item-card-row">
          <Field label="Цена, ₽">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="На складе">
            <Input
              type="number"
              inputMode="numeric"
              step="1"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Минимальный остаток"
          hint="При достижении остатка приложение покажет предупреждение"
        >
          <Input
            type="number"
            inputMode="numeric"
            step="1"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
          />
        </Field>
        <Field label="Описание">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="form-actions">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" icon="check" onClick={submit}>
            Сохранить
          </Button>
        </div>
        {onDelete && (
          <Button variant="danger" icon="trash" full onClick={onDelete}>
            Удалить товар
          </Button>
        )}
      </div>
    </Modal>
  )
}

function toNumber(value: string): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

