import { useRef, useState, type ChangeEvent } from 'react'
import { Button, Card, Field, Input } from '../components/ui'
import { Icon } from '../components/Icons'
import { downloadBackup, readBackupFile } from '../db/backup'
import { parseAddresses, saveAddresses } from '../db/addresses'
import { seedDemo } from '../db/seed'
import { getLimits } from '../db/limits'
import { useData } from '../state/DataContext'
import { useTheme } from '../state/ThemeContext'
import { emptyContractor, type Contractor } from '../types'
import { fetchLatestRelease, isNewerVersion, openExternal, type ReleaseInfo } from '../updates'
import { APP_VERSION } from '../version'

const isDev = import.meta.env.DEV

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'error'; message: string }
  | { status: 'up-to-date' }
  | { status: 'available'; release: ReleaseInfo }

export function Settings() {
  const { db, plan, refresh } = useData()
  const { theme, toggleTheme } = useTheme()
  const fileRef = useRef<HTMLInputElement>(null)
  const addressFileRef = useRef<HTMLInputElement>(null)
  const limits = getLimits(plan)

  const clientsCount = db.getClients().length
  const ordersCount = db.getOrders().length
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' })

  const checkUpdates = async () => {
    setUpdate({ status: 'checking' })
    try {
      const release = await fetchLatestRelease()
      if (!release) {
        setUpdate({ status: 'error', message: 'Релизы не найдены' })
        return
      }
      if (isNewerVersion(release.version, APP_VERSION)) {
        setUpdate({ status: 'available', release })
      } else {
        setUpdate({ status: 'up-to-date' })
      }
    } catch (e) {
      setUpdate({
        status: 'error',
        message: e instanceof Error ? e.message : 'Не удалось проверить обновления',
      })
    }
  }

  const togglePlan = (full: boolean) => {
    db.updateSettings({ plan: full ? 'FULL' : 'FREE' })
    refresh()
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const json = await readBackupFile(file)
      db.importData(json)
      refresh()
      window.alert('Данные восстановлены из резервной копии')
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось импортировать данные')
    }
  }

  const handleAddressImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const text = await file.text()
      const list = parseAddresses(text)
      saveAddresses(list)
      window.alert(`База адресов загружена: ${list.length} записей`)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось загрузить базу адресов')
    }
  }

  return (
    <div>
      <Card className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-title">Тёмная тема</div>
            <div className="settings-row-desc" style={{ marginTop: 4 }}>
              Комфортное отображение при слабом освещении
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={toggleTheme}
              aria-label="Тёмная тема"
            />
            <span className="switch-track" />
          </label>
        </div>
      </Card>

      <Card className="settings-group">
        <div className="section-title" style={{ marginBottom: 6 }}>
          Тариф
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">
              {plan === 'FULL' ? (
                <span className="plan-badge plan-full">Полная версия</span>
              ) : (
                <span className="plan-badge plan-free">Бесплатная</span>
              )}
            </div>
            <div className="settings-row-desc" style={{ marginTop: 6 }}>
              {plan === 'FULL'
                ? 'Без ограничений: клиенты, заказы, товары, склад, PDF, резервные копии.'
                : 'До 20 клиентов и 50 заказов. Товары, склад, PDF и бэкапы — в полной версии.'}
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={plan === 'FULL'}
              onChange={(e) => togglePlan(e.target.checked)}
              aria-label="Полная версия"
            />
            <span className="switch-track" />
          </label>
        </div>

        <div className="settings-row">
          <span className="settings-row-desc">Клиенты</span>
          <span style={{ fontWeight: 600 }}>
            {clientsCount} / {Number.isFinite(limits.maxClients) ? limits.maxClients : '∞'}
          </span>
        </div>
        <div className="settings-row">
          <span className="settings-row-desc">Заказы</span>
          <span style={{ fontWeight: 600 }}>
            {ordersCount} / {Number.isFinite(limits.maxOrders) ? limits.maxOrders : '∞'}
          </span>
        </div>
      </Card>

      <Card className="settings-group">
        <div className="section-title" style={{ marginBottom: 6 }}>
          Исполнитель
        </div>
        <div className="settings-row-desc" style={{ marginBottom: 12 }}>
          Реквизиты, которые попадают в чек (PDF): название, ИНН, ОГРН и контакты.
        </div>
        <ContractorForm />
      </Card>

      <Card className="settings-group">
        <div className="section-title" style={{ marginBottom: 6 }}>
          Резервная копия
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">Экспорт</div>
            <div className="settings-row-desc">Скачать все данные в JSON-файл</div>
          </div>
          <Button
            size="sm"
            variant={limits.backup ? 'secondary' : 'ghost'}
            icon="download"
            disabled={!limits.backup}
            onClick={() => downloadBackup(db)}
          >
            Скачать
          </Button>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">Импорт</div>
            <div className="settings-row-desc">Восстановить данные из файла</div>
          </div>
          <Button
            size="sm"
            variant={limits.backup ? 'secondary' : 'ghost'}
            icon="upload"
            disabled={!limits.backup}
            onClick={() => fileRef.current?.click()}
          >
            Загрузить
          </Button>
        </div>
        {!limits.backup && (
          <div className="limit-banner" style={{ marginBottom: 0, marginTop: 8 }}>
            <span className="limit-banner-icon">
              <Icon name="lock" size={18} />
            </span>
            <span className="limit-banner-text">Резервные копии доступны в полной версии.</span>
          </div>
        )}
      </Card>

      <Card className="settings-group">
        <div className="section-title" style={{ marginBottom: 6 }}>
          Данные
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">База адресов</div>
            <div className="settings-row-desc">Импорт кадастровых адресов (JSON)</div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon="upload"
            onClick={() => addressFileRef.current?.click()}
          >
            Импорт
          </Button>
        </div>
        {isDev && (
          <div className="settings-row">
            <div>
              <div className="settings-row-title">Демо-данные</div>
              <div className="settings-row-desc">Заполнить примером (включает полную версию)</div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              icon="plus"
              onClick={() => {
                seedDemo(db)
                refresh()
              }}
            >
              Заполнить
            </Button>
          </div>
        )}
        <div className="settings-row">
          <div>
            <div className="settings-row-title">Сбросить все данные</div>
            <div className="settings-row-desc">Удалить клиентов, заказы и товары</div>
          </div>
          <Button
            size="sm"
            variant="danger"
            icon="trash"
            onClick={() => {
              if (window.confirm('Удалить все данные? Это действие необратимо.')) {
                db.reset()
                refresh()
              }
            }}
          >
            Сбросить
          </Button>
        </div>
      </Card>

      <Card className="settings-group">
        <div className="section-title" style={{ marginBottom: 6 }}>
          Обновления
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">Проверить обновления</div>
            <div className="settings-row-desc">Текущая версия {APP_VERSION}</div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon="refresh"
            disabled={update.status === 'checking'}
            onClick={() => void checkUpdates()}
          >
            {update.status === 'checking' ? 'Проверка…' : 'Проверить'}
          </Button>
        </div>

        {update.status === 'error' && (
          <div className="limit-banner" style={{ marginTop: 8, marginBottom: 0 }}>
            <span className="limit-banner-text">{update.message}</span>
          </div>
        )}

        {update.status === 'up-to-date' && (
          <div className="field-hint" style={{ marginTop: 8 }}>
            У вас установлена последняя версия.
          </div>
        )}

        {update.status === 'available' && (
          <div style={{ marginTop: 10 }}>
            <div className="settings-row-title" style={{ marginBottom: 4 }}>
              Доступна версия {update.release.version}
            </div>
            {update.release.notes && (
              <div
                className="settings-row-desc"
                style={{ whiteSpace: 'pre-wrap', marginBottom: 10 }}
              >
                {update.release.notes.slice(0, 1200)}
              </div>
            )}
            <Button
              size="sm"
              variant="primary"
              icon="download"
              onClick={() => void openExternal(update.release.apkUrl ?? update.release.url)}
            >
              Скачать обновление
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <div className="settings-row-title">SelfCRM</div>
        <div className="settings-row-desc" style={{ marginTop: 4 }}>
          Версия {APP_VERSION} · Один пользователь · Данные хранятся локально на устройстве
        </div>
      </Card>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          void handleImport(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={addressFileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          void handleAddressImport(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

function ContractorForm() {
  const { db, refresh } = useData()
  const contractor = db.getSettings().contractor ?? emptyContractor()
  const [form, setForm] = useState<Contractor>(contractor)
  const [saved, setSaved] = useState(false)

  const setField =
    (key: keyof Contractor) =>
    (e: ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const save = () => {
    db.updateSettings({
      contractor: {
        name: form.name.trim(),
        inn: form.inn.trim(),
        ogrn: form.ogrn.trim(),
        kpp: form.kpp.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
      },
    })
    refresh()
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="form">
      <Field label="Название / ФИО">
        <Input value={form.name} onChange={setField('name')} placeholder="ИП Иванов Иван Иванович" />
      </Field>
      <div className="item-card-row">
        <Field label="ИНН">
          <Input value={form.inn} onChange={setField('inn')} inputMode="numeric" placeholder="770000000000" />
        </Field>
        <Field label="ОГРН">
          <Input value={form.ogrn} onChange={setField('ogrn')} inputMode="numeric" placeholder="1234567890123" />
        </Field>
      </div>
      <Field label="КПП">
        <Input value={form.kpp} onChange={setField('kpp')} inputMode="numeric" placeholder="770001001" />
      </Field>
      <Field label="Телефон">
        <Input value={form.phone} onChange={setField('phone')} placeholder="+7 900 000-00-00" />
      </Field>
      <Field label="Email">
        <Input value={form.email} onChange={setField('email')} type="email" placeholder="mail@example.com" />
      </Field>
      <Field label="Адрес">
        <Input value={form.address} onChange={setField('address')} placeholder="г. Москва, ул. Примерная, д. 1" />
      </Field>
      <div className="form-actions">
        <Button variant="primary" icon="check" onClick={save}>
          {saved ? 'Сохранено' : 'Сохранить'}
        </Button>
      </div>
    </div>
  )
}

