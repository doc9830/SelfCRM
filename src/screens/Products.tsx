import { useState } from 'react'
import { Badge, Button, EmptyState, Fab, Field, Input, IntegerInput, Modal, MoneyInput, Select, Textarea } from '../components/ui'
import { Icon } from '../components/Icons'
import { useData } from '../state/DataContext'
import { useSortValue } from '../state/SortContext'
import { isService, type Product, type ProductKind } from '../types'
import { marginHint, money, plural } from '../utils/format'
import { uid } from '../utils/id'

// Варианты сортировки заданы в state/SortContext.tsx — их показывает значок в шапке.
type Sort = 'name' | 'stock-desc' | 'stock-asc' | 'price-desc' | 'price-asc'

export function Products() {
  const { db, refresh } = useData()
  const [query, setQuery] = useState('')
  const sort = useSortValue('products') as Sort
  const [editing, setEditing] = useState<Product | 'new' | null>(null)

  const products = db.getProducts()
  const filtered = products.filter((p) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
  })
  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'stock-desc':
        return b.stock - a.stock
      case 'stock-asc':
        return a.stock - b.stock
      case 'price-desc':
        return b.price - a.price
      case 'price-asc':
        return a.price - b.price
      default:
        return a.name.localeCompare(b.name, 'ru')
    }
  })

  return (
    <div>
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={18} />
          <input
            placeholder="Поиск товара или услуги"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="box"
          title={query ? 'Ничего не найдено' : 'Добавьте товары или услуги'}
          description={
            query
              ? 'Попробуйте изменить запрос'
              : 'Товары можно учитывать на складе, а услуги со склада не списываются'
          }
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
          {sorted.map((p) => (
            <button key={p.id} className="list-item" onClick={() => setEditing(p)}>
              <span className="list-item-main">
                <span className="list-item-title">{p.name}</span>
                <span className="list-item-sub">
                  {isService(p) ? 'Услуга' : p.sku || '—'} · {money(p.price)}
                </span>
              </span>
              {isService(p) ? (
                <Badge tone="blue">Услуга</Badge>
              ) : (
                <Badge tone={p.stock <= p.minStock ? 'red' : 'neutral'}>
                  {p.stock} {plural(p.stock, 'шт', 'шт', 'шт')}
                </Badge>
              )}
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
            const created = editing === 'new'
            const initialStock = product.stock
            // У нового товара остаток создаётся движением «Поступление»: так в истории
            // видно, откуда взялось стартовое число. Остаток существующего товара
            // меняется только на складе, поэтому здесь берём актуальное значение из базы.
            const fresh = created ? undefined : db.getProduct(product.id)
            const saved = db.saveProduct(
              created ? { ...product, stock: 0 } : { ...product, stock: fresh?.stock ?? product.stock },
            )
            if (created && initialStock > 0) {
              db.applyStockMove({
                productId: saved.id,
                kind: 'in',
                value: initialStock,
                comment: 'Начальный остаток',
              })
            }
            refresh()
            setEditing(null)
          }}
          onDelete={
            editing === 'new'
              ? undefined
              : () => {
                  if (window.confirm('Удалить позицию? Связанные строки в заказах сохранятся.')) {
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
  const [cost, setCost] = useState(initial?.cost ? String(initial.cost) : '')
  const [stock, setStock] = useState(initial ? String(initial.stock) : '')
  const [minStock, setMinStock] = useState(initial ? String(initial.minStock) : '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [kind, setKind] = useState<ProductKind>(initial?.kind ?? 'product')
  const [error, setError] = useState('')

  const submit = () => {
    if (!name.trim()) {
      setError(kind === 'service' ? 'Укажите название услуги' : 'Укажите название товара')
      return
    }
    const service = kind === 'service'
    onSave({
      id: initial?.id ?? uid(),
      name: name.trim(),
      sku: sku.trim(),
      price: toNumber(price),
      // Себестоимость нужна для расчёта прибыли; у существующего товара остаток
      // меняется только на складе, поэтому берём его текущее значение.
      cost: toNumber(cost),
      stock: service ? 0 : initial ? initial.stock : Math.round(toNumber(stock)),
      minStock: service ? 0 : Math.round(toNumber(minStock)),
      description: description.trim(),
      kind,
    })
  }

  return (
    <Modal title={initial ? 'Изменить позицию' : 'Новая позиция'} onClose={onClose}>
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
        <Field
          label="Тип позиции"
          hint={
            kind === 'service'
              ? 'Услуга не учитывается на складе и всегда доступна в заказе'
              : 'Товар списывается со склада при оформлении заказа'
          }
        >
          <Select value={kind} onChange={(e) => setKind(e.target.value as ProductKind)}>
            <option value="product">Товар</option>
            <option value="service">Услуга</option>
          </Select>
        </Field>
        <div className="item-card-row">
          <Field label="Цена, ₽">
            <MoneyInput value={price} onChange={setPrice} />
          </Field>
          <Field
            label="Себестоимость, ₽"
            hint={kind === 'service' ? 'Затраты на услугу, если они есть' : 'Цена закупки одной штуки'}
          >
            <MoneyInput value={cost} onChange={setCost} />
          </Field>
        </div>
        <div className="field-hint">{marginHint(toNumber(price), toNumber(cost))}</div>
        {kind === 'product' && !initial && (
          <Field
            label="На складе"
            hint="Стартовый остаток: в разделе «Склад» он появится как «Поступление»"
          >
            <IntegerInput value={stock} onChange={setStock} />
          </Field>
        )}
        {kind === 'product' && (
          <Field
            label="Минимальный остаток"
            hint="При достижении остатка приложение покажет предупреждение"
          >
            <IntegerInput value={minStock} onChange={setMinStock} />
          </Field>
        )}
        <Field label="Описание">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        {initial && kind === 'product' && (
          <div className="field-hint">
            Остаток и история движения — в разделе «Склад»: нажмите на товар в списке.
          </div>
        )}

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
            {initial && isService(initial) ? 'Удалить услугу' : 'Удалить товар'}
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

