import { useState } from 'react'
import { Button, Card, Field, Input, Textarea, cx } from '../components/ui'
import { useData } from '../state/DataContext'
import {
  FEEDBACK_CONTACT_MAX,
  FEEDBACK_EMAIL,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_TOPICS,
  FEEDBACK_TOPIC_LABEL,
  collectDiagnostics,
  copyText,
  feedbackContactError,
  feedbackLetterText,
  feedbackMailto,
  feedbackMessageError,
  openMailto,
  type FeedbackTopic,
} from '../utils/feedback'

// Экран «Обратная связь» (маршрут /feedback) открывается из настроек. Вид обращения может
// прийти из адреса: «Сообщить об ошибке» показывает форму с уже отмеченной темой.
//
// Приложение письмо не отправляет: оно собирает готовый текст (`utils/feedback.ts`) и
// передаёт его почтовой программе. Если та не открылась, письмо можно скопировать текстом —
// поэтому под кнопкой всегда есть и адрес, и «Скопировать текст письма».
export function Feedback({ presetTopic }: { presetTopic?: FeedbackTopic | null }) {
  const { db } = useData()
  const [topic, setTopic] = useState<FeedbackTopic>(presetTopic ?? 'idea')
  const [message, setMessage] = useState('')
  // Контакт подставляем из реквизитов исполнителя: свои данные уже введены, а ответ придёт
  // на адрес, с которого ушло письмо, — отдельный контакт нужен, только если он другой.
  const [contact, setContact] = useState(() => db.getSettings().contractor?.email ?? '')
  const [attach, setAttach] = useState(true)
  const [error, setError] = useState('')
  const [opened, setOpened] = useState(false)
  const [copied, setCopied] = useState<'address' | 'letter' | null>(null)

  const diagnostics = attach
    ? collectDiagnostics({
        clients: db.getClients(true).length,
        orders: db.getOrders().length,
        products: db.getProducts().length,
      })
    : null

  const draft = { topic, message, contact, attachDiagnostics: attach }

  const send = () => {
    const problem = feedbackMessageError(message) ?? feedbackContactError(contact)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    openMailto(feedbackMailto(draft, diagnostics))
    setOpened(true)
  }

  const copy = async (what: 'address' | 'letter') => {
    const text = what === 'address' ? FEEDBACK_EMAIL : feedbackLetterText(draft, diagnostics)
    const done = await copyText(text)
    if (!done) {
      setError('Скопировать не удалось — выделите текст вручную')
      return
    }
    setError('')
    setCopied(what)
    window.setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="form">
      <Card className="settings-group">
        <div className="section-title" style={{ marginBottom: 6 }}>
          Куда уйдёт письмо
        </div>
        <div className="settings-row-desc" style={{ marginBottom: 8 }}>
          Письмо откроется в вашей почтовой программе — с готовым текстом, отправить его нужно
          самому. Приложение не отправляет данные само и не ходит в сеть.
        </div>
        <div className="feedback-mail">
          <span>{FEEDBACK_EMAIL}</span>
          <Button size="sm" variant="secondary" icon="mail" onClick={() => void copy('address')}>
            {copied === 'address' ? 'Скопировано' : 'Копировать'}
          </Button>
        </div>
      </Card>

      <Card className="settings-group">
        <div className="field">
          <span className="field-label">Что написать?</span>
          <div className="chips" style={{ marginBottom: 0 }}>
            {FEEDBACK_TOPICS.map((item) => (
              <button
                key={item}
                type="button"
                className={cx('chip', topic === item && 'chip-active')}
                onClick={() => setTopic(item)}
              >
                {FEEDBACK_TOPIC_LABEL[item]}
              </button>
            ))}
          </div>
        </div>

        <Field
          label="Сообщение"
          error={error}
          hint={`${message.trim().length} из ${FEEDBACK_MESSAGE_MAX} символов`}
        >
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={FEEDBACK_MESSAGE_MAX}
            rows={7}
            placeholder="Например: при повторении заказа не переносится комментарий к позиции"
          />
        </Field>

        <Field label="Контакт для ответа" hint="Необязательно — если отвечать нужно на другой адрес">
          <Input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={FEEDBACK_CONTACT_MAX}
            placeholder="почта или телефон"
          />
        </Field>

        <div className="settings-row">
          <div>
            <div className="settings-row-title">Приложить технические данные</div>
            <div className="settings-row-desc">
              Версия SelfCRM, платформа и количество записей — без имён клиентов и сумм
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={attach}
              onChange={() => setAttach((value) => !value)}
              aria-label="Приложить технические данные"
            />
            <span className="switch-track" />
          </label>
        </div>
      </Card>

      <Button variant="primary" icon="mail" full onClick={send}>
        Открыть письмо
      </Button>
      {opened && (
        <div className="field-hint" style={{ marginTop: 8 }}>
          Письмо передано почтовой программе. Если она не открылась — скопируйте текст и
          отправьте его на {FEEDBACK_EMAIL} из любой почты.
        </div>
      )}
      <Button variant="secondary" icon="doc" full style={{ marginTop: 10 }} onClick={() => void copy('letter')}>
        {copied === 'letter' ? 'Текст скопирован' : 'Скопировать текст письма'}
      </Button>
      <div className="field-hint" style={{ marginTop: 8, textAlign: 'center' }}>
        Письмо уходит с вашего адреса — ответ придёт туда же.
      </div>
    </div>
  )
}
