import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, EmptyState, Field, Input, cx } from '../components/ui'
import { useRoute } from '../router'
import { useData } from '../state/DataContext'
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from '../types'
import { money, plural } from '../utils/format'
import { statisticsPeriodFromQuery } from '../utils/links'
import { clientLabel, NO_CLIENT_ID } from '../utils/orders'
import { rangeLabel } from '../reports/report'
import { statusTone } from '../utils/status'
import {
  filterOrdersByRange,
  groupItemRevenue,
  groupRevenue,
  periodRange,
  summarizeOrders,
  type DateRange,
  type PeriodKey,
} from '../utils/stats'

const PERIODS: Array<{ value: PeriodKey; label: string }> = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: '7 дней' },
  { value: 'month', label: 'Месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
  { value: 'all', label: 'Всё время' },
  { value: 'custom', label: 'Период' },
]

const NO_CLIENT = NO_CLIENT_ID

export function Statistics() {
  const { db, version } = useData()
  const { route, navigate } = useRoute()
  const periodParam = route.query.get('period')
  const [period, setPeriod] = useState<PeriodKey>(
    () => statisticsPeriodFromQuery(periodParam) ?? 'month',
  )
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // Состояние выгрузки: сборка файла асинхронная (её видно по кнопке), а результат
  // объясняется текстом — «ничего не произошло» быть не должно.
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportNote, setExportNote] = useState('')

  // Плашка «Выручка» на главном экране ведёт на #/statistics?period=month.
  useEffect(() => {
    const fromQuery = statisticsPeriodFromQuery(periodParam)
    if (fromQuery) setPeriod(fromQuery)
  }, [periodParam])

  const { range, orders, summary, clients, items } = useMemo(() => {
    const bounds = periodRange(period, new Date(), { from, to })
    const inRange = filterOrdersByRange(db.getOrders(), bounds)
    return {
      range: bounds,
      orders: inRange,
      summary: summarizeOrders(inRange),
      clients: groupRevenue(inRange, (o) => o.clientId ?? NO_CLIENT),
      items: groupItemRevenue(inRange),
    }
    // version в зависимостях: пересчитываем статистику после изменений данных.
  }, [db, version, period, from, to])

  // Имя клиента — общая подпись (utils/orders.ts): то же имя попадёт в отчёт.
  const clientName = (id: string) => clientLabel(id === NO_CLIENT ? undefined : db.getClient(id), id)

  // Выгрузка: данные отчёта собираются по выбранному здесь периоду — тому же, что
  // виден на экране. Модуль выгрузки подгружается по нажатию (в нём библиотека
  // сборки .xlsx), а исходы объясняются текстом под кнопкой.
  const exportExcel = () => {
    if (exportBusy) return
    setExportBusy(true)
    setExportError('')
    setExportNote('')
    void import('../reports/export')
      .then(({ exportReport }) =>
        exportReport({
          orders: db.getOrders(),
          clients: db.getClients(true),
          period,
          custom: { from, to },
        }),
      )
      .then(({ fileName, delivery }) => {
        if (delivery.kind === 'native' || delivery.kind === 'shared') {
          setExportNote('Файл готов — выберите, куда его сохранить или отправить.')
          return
        }
        if (delivery.kind === 'downloaded') {
          setExportNote(`${fileName} скачан в «Загрузки».`)
          return
        }
        if (delivery.kind === 'cancelled') {
          setExportNote('Отправка отменена — можно попробовать ещё раз.')
          return
        }
        if (delivery.kind === 'unsupported') {
          setExportError('В этой версии Telegram файл отдать нечем — откройте приложение в браузере.')
          return
        }
        if (delivery.result.kind === 'opened') {
          setExportNote('Отчёт уходит в «Загрузки» — файл откроется в Excel или таблицах.')
          return
        }
        if (delivery.result.kind === 'copied') {
          setExportNote('Ссылка на файл скопирована — откройте её в браузере, чтобы скачать отчёт.')
          return
        }
        setExportError('Не удалось передать файл — попробуйте ещё раз.')
      })
      .catch((error) => setExportError(exportErrorMessage(error)))
      .finally(() => setExportBusy(false))
  }

  return (
    <div>
      <div className="chips">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            className={cx('chip', period === p.value && 'chip-active')}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="item-card-row" style={{ marginBottom: 12 }}>
          <Field label="С даты">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="По дату">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="field-hint" style={{ marginBottom: 10 }}>
        {rangeLabel(range)}
      </div>

      <div className="stat-grid">
        <Stat value={money(summary.revenue)} label="Выручка" accent hint="завершённые заказы" />
        <Stat value={money(summary.inWork)} label="В работе" hint="новые и в работе" />
        <Stat
          value={money(summary.profit)}
          label="Прибыль"
          profit
          hint="выручка минус себестоимость"
        />
        <Stat value={money(summary.average)} label="Средний чек" hint="по завершённым" />
        <Stat value={String(summary.count)} label="Заказов" />
        <Stat value={String(summary.byStatus.done)} label="Завершено" />
      </div>

      {summary.cost > 0 && (
        <div className="field-hint" style={{ marginTop: 8 }}>
          Себестоимость проданного: {money(summary.cost)}
        </div>
      )}

      {/* Выгрузка в Excel за тот же период, что выбран чипами выше. */}
      <div className="section" style={{ marginTop: 16 }}>
        <Button
          variant="outline"
          icon="download"
          full
          disabled={exportBusy}
          onClick={exportExcel}
        >
          {exportBusy ? 'Готовим файл…' : 'Экспорт в Excel'}
        </Button>
        <div className="field-hint" style={{ marginTop: 6 }}>
          Пять листов: сводка, продажи, позиции, клиенты и товары за этот период
        </div>
        {exportNote && (
          <div className="field-hint" style={{ marginTop: 6 }}>
            {exportNote}
          </div>
        )}
        {exportError && (
          <div className="field-error" style={{ marginTop: 6 }}>
            {exportError}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title" style={{ marginBottom: 10 }}>
          Статусы заказов
        </div>
        <div className="chips" style={{ marginBottom: 0 }}>
          {ORDER_STATUSES.map((status) => (
            <Badge key={status} tone={statusTone(status)}>
              {ORDER_STATUS_LABEL[status]}: {summary.byStatus[status]}
            </Badge>
          ))}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="section">
          <EmptyState
            icon="chart"
            title="Нет данных за период"
            description="Измените период или создайте заказы"
            action={
              <Button icon="receipt" onClick={() => navigate('/orders')}>
                К заказам
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {items.length > 0 && (
            <div className="section">
              <div className="section-head">
                <div className="section-title">Топ товаров и услуг</div>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>по завершённым</span>
              </div>
              {items.slice(0, 5).map((entry, index) => (
                <div className="top-row" key={entry.key}>
                  <span className="top-rank">{index + 1}</span>
                  <span className="top-name">{entry.label}</span>
                  <span className="top-qty">
                    {entry.qty} {plural(entry.qty, 'шт', 'шт', 'шт')}
                  </span>
                  <span className="top-total">
                    {money(entry.total)}
                    {entry.profit > 0 && entry.profit !== entry.total && (
                      <span className="top-profit">прибыль +{money(entry.profit)}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {clients.length > 0 && (
            <div className="section">
              <div className="section-head">
                <div className="section-title">Топ клиентов</div>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>по завершённым</span>
              </div>
              {clients.slice(0, 5).map((entry, index) => (
                <div className="top-row" key={entry.key}>
                  <span className="top-rank">{index + 1}</span>
                  <span className="top-name">{clientName(entry.key)}</span>
                  <span className="top-qty">
                    {entry.qty} {plural(entry.qty, 'заказ', 'заказа', 'заказов')}
                  </span>
                  <span className="top-total">{money(entry.total)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Сообщение об ошибке выгрузки. Свои сообщения (мост, доставка) написаны
// по-русски и объясняют причину; всё остальное — технический текст библиотек и сети,
// который пользователю ничего не говорит, поэтому заменяется понятной фразой.
function exportErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : ''
  return /[А-Яа-я]/.test(text) ? text : 'Не удалось собрать отчёт — попробуйте ещё раз.'
}

function Stat({
  value,
  label,
  accent,
  profit,
  hint,
}: {
  value: string
  label: string
  accent?: boolean
  profit?: boolean
  hint?: string
}) {
  return (
    <div className="stat">
      <div className={cx('stat-value', accent && 'stat-accent', profit && 'stat-profit')}>{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}

