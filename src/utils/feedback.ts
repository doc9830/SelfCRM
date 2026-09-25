// Обратная связь: письмо разработчику SelfCRM.
//
// Приложение не отправляет письмо само — оно собирает готовый текст и отдаёт его почтовой
// программе пользователя (`mailto:`). Так письмо уходит с адреса отправителя (значит, на
// него можно ответить), а SelfCRM остаётся полностью локальным приложением: без сервера,
// без ключей и без запросов в сеть (см. ARCHITECTURE.md, «Обратная связь»).
//
// Текст письма, ограничения длины и проверки живут здесь, а экран (`screens/Feedback.tsx`)
// только показывает форму: так содержимое письма можно тестировать отдельно от интерфейса.
import { APP_VERSION } from '../version'
import { isNativeAndroid } from './navigation'

// Адрес, на который уходят письма: тот же, что указан в README и на странице раздачи.
export const FEEDBACK_EMAIL = 'doc9830@proton.me'

// ----- Вид обращения -----
//
// Вид попадает в тему письма и в первую строку текста: по ним письмо видно в почте,
// не открывая его.

export type FeedbackTopic = 'idea' | 'bug' | 'question'

export const FEEDBACK_TOPICS: FeedbackTopic[] = ['idea', 'bug', 'question']

export const FEEDBACK_TOPIC_LABEL: Record<FeedbackTopic, string> = {
  idea: 'Идея',
  bug: 'Ошибка',
  question: 'Вопрос',
}

export interface FeedbackDraft {
  topic: FeedbackTopic
  message: string
  // Почта или телефон для ответа — необязательно: письмо уходит с адреса пользователя,
  // но ответ на него может потеряться, поэтому контакт полезен.
  contact: string
  // Технические данные (версия, платформа, объём базы) — только с согласия пользователя.
  attachDiagnostics: boolean
}

export interface FeedbackDiagnostics {
  version: string
  platform: string
  clients: number
  orders: number
  products: number
}

// ----- Ограничения -----
//
// Пределы длины нужны из-за способа отправки: mailto:-ссылка — это адрес, внутри которого
// лежит весь текст письма, и слишком длинную ссылку почтовые программы обрезают или
// не принимают вовсе.

export const FEEDBACK_MESSAGE_MIN = 10
export const FEEDBACK_MESSAGE_MAX = 2000
export const FEEDBACK_CONTACT_MAX = 120
export const FEEDBACK_SUBJECT_MAX = 90
export const FEEDBACK_BODY_MAX = 1800

// Переносы строк приводим к «\n»: в WebView и на Android встречается «\r\n», а в mailto
// лишний «\r» превращается в «%0D» и в части клиентов выглядит как пустые строки.
function normalize(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

// Первая непустая строка сообщения: попадает в тему письма.
function firstLine(text: string): string {
  const line = normalize(text)
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean)
  return (line ?? '').replace(/\s+/g, ' ')
}

// Обрезает текст до предела, помечая сокращение многоточием.
function truncate(text: string, max: number): string {
  const value = text.trim()
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

// Тема письма: «SelfCRM 1.5.1 — Ошибка: не сохраняется заказ». Начало сообщения в теме
// помогает разобрать почту, не открывая каждое письмо.
export function feedbackSubject(draft: FeedbackDraft, diagnostics: FeedbackDiagnostics | null = null): string {
  const version = diagnostics?.version ?? APP_VERSION
  const label = FEEDBACK_TOPIC_LABEL[draft.topic]
  const snippet = firstLine(draft.message)
  return truncate(`SelfCRM ${version} — ${label}${snippet ? `: ${snippet}` : ''}`, FEEDBACK_SUBJECT_MAX)
}

function diagnosticsLines(diagnostics: FeedbackDiagnostics): string[] {
  return [
    `Версия: SelfCRM ${diagnostics.version}`,
    `Платформа: ${diagnostics.platform}`,
    `Записей в базе: клиентов ${diagnostics.clients}, заказов ${diagnostics.orders}, товаров ${diagnostics.products}`,
  ]
}

// Текст письма. Технические данные добавляются, только если пользователь оставил галочку:
// в них нет ни имён клиентов, ни сумм, ни содержимого заказов — только версия, платформа
// и количество записей.
export function feedbackBody(draft: FeedbackDraft, diagnostics: FeedbackDiagnostics | null): string {
  const compose = (message: string) =>
    [
      `Вид обращения: ${FEEDBACK_TOPIC_LABEL[draft.topic]}`,
      '',
      'Сообщение:',
      message,
      '',
      `Контакт для ответа: ${draft.contact.trim() || 'не указан'}`,
      ...(diagnostics ? ['', '— Технические данные —', ...diagnosticsLines(diagnostics)] : []),
    ].join('\n')

  const message = truncate(normalize(draft.message), FEEDBACK_MESSAGE_MAX)
  const body = compose(message)
  if (body.length <= FEEDBACK_BODY_MAX) return body

  // Сообщение сокращаем ровно настолько, чтобы письмо целиком уложилось в предел:
  // терять из-за длины контакт и технические данные не нужно.
  const excess = body.length - FEEDBACK_BODY_MAX
  return compose(truncate(message, Math.max(1, message.length - excess)))
}

// Готовая mailto:-ссылка: адрес получателя, тема и текст письма.
export function feedbackMailto(draft: FeedbackDraft, diagnostics: FeedbackDiagnostics | null): string {
  const subject = encodeURIComponent(feedbackSubject(draft, diagnostics))
  const body = encodeURIComponent(feedbackBody(draft, diagnostics))
  return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`
}

// Текст для копирования: адрес, тема и тело. Нужен, если почтовая программа не открылась —
// тогда письмо можно отправить вручную, из любого сервиса.
export function feedbackLetterText(draft: FeedbackDraft, diagnostics: FeedbackDiagnostics | null): string {
  const head = [`Кому: ${FEEDBACK_EMAIL}`, `Тема: ${feedbackSubject(draft, diagnostics)}`, '']
  return [...head, feedbackBody(draft, diagnostics)].join('\n')
}

// ----- Проверки формы -----

export function feedbackMessageError(message: string): string | null {
  const text = normalize(message).trim()
  if (!text) return 'Напишите, что случилось или что хочется изменить'
  if (text.length < FEEDBACK_MESSAGE_MIN) return 'Слишком коротко: опишите хотя бы одной фразой'
  return null
}

export function feedbackContactError(contact: string): string | null {
  const text = normalize(contact).trim()
  return text.length > FEEDBACK_CONTACT_MAX ? `Контакт длиннее ${FEEDBACK_CONTACT_MAX} символов` : null
}

// Счётчики для технических данных собирает экран (у него есть база), а версию приложения
// и название платформы добавляет эта функция.
export function collectDiagnostics(counts: {
  clients: number
  orders: number
  products: number
}): FeedbackDiagnostics {
  return { version: APP_VERSION, platform: platformLabel(), ...counts }
}

// ----- Открытие письма -----

// Встроенный WebView мессенджера (Telegram Mini App и подобные) не открывает внешние
// приложения обычной ссылкой: переход внутри него игнорируется. Такой WebView даёт свой
// способ открыть ссылку — им и пользуемся. Это проверка возможности, а не зависимость
// от мессенджера: без его скрипта поле остаётся пустым.
interface OpenLinkHost {
  openLink?: (url: string) => void
}

function embeddedHost(): OpenLinkHost | null {
  if (typeof window === 'undefined') return null
  const telegram = (window as { Telegram?: { WebApp?: OpenLinkHost } }).Telegram
  return telegram?.WebApp?.openLink ? telegram.WebApp : null
}

// Куда в итоге попало письмо: в системное приложение (Android), в почтовую программу
// на текущей странице, во встроенный браузер мессенджера или никуда.
export type MailtoTarget = 'system' | 'app' | 'embedded' | 'failed'

export function openMailto(url: string): MailtoTarget {
  if (typeof window === 'undefined') return 'failed'

  const host = embeddedHost()
  if (host?.openLink) {
    host.openLink(url)
    return 'embedded'
  }

  if (isNativeAndroid()) {
    // Как и для geo:/tel:, ссылка передаётся операционной системе: она сама выберет
    // почтовую программу из установленных.
    window.open(url, '_system')
    return 'system'
  }

  window.location.href = url
  return 'app'
}

// Название платформы для письма: по нему видно, откуда пришло обращение.
export function platformLabel(): string {
  if (isNativeAndroid()) return 'Android (приложение)'
  if (embeddedHost()) return 'Telegram (мини-приложение)'
  return 'Браузер'
}

// Копирование в буфер обмена: основной путь — Clipboard API, а если он недоступен
// (старый WebView, запрет политики), остаётся скрытое поле и execCommand.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Ниже — запасной способ: Clipboard API отказывает без разрешения пользователя.
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    document.body.appendChild(area)
    area.select()
    const done = document.execCommand('copy')
    document.body.removeChild(area)
    return done
  } catch {
    return false
  }
}
