import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_VERSION } from '../version'
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_EMAIL,
  FEEDBACK_MESSAGE_MIN,
  FEEDBACK_SUBJECT_MAX,
  collectDiagnostics,
  feedbackBody,
  feedbackContactError,
  feedbackLetterText,
  feedbackMailto,
  feedbackMessageError,
  feedbackSubject,
  openMailto,
  platformLabel,
  type FeedbackDiagnostics,
  type FeedbackDraft,
} from './feedback'

const draft = (partial: Partial<FeedbackDraft> = {}): FeedbackDraft => ({
  topic: 'bug',
  message: 'При повторении заказа не переносится комментарий к позиции',
  contact: '',
  attachDiagnostics: true,
  ...partial,
})

const diagnostics: FeedbackDiagnostics = {
  version: '1.5.1',
  platform: 'Android (приложение)',
  clients: 12,
  orders: 40,
  products: 8,
}

// Заглушки окружения снимаем после каждого теста: иначе «окно» попадёт в следующие.
afterEach(() => vi.unstubAllGlobals())

describe('feedbackSubject', () => {
  it('собирает тему из версии, вида обращения и начала сообщения', () => {
    expect(feedbackSubject(draft(), diagnostics)).toBe(
      'SelfCRM 1.5.1 — Ошибка: При повторении заказа не переносится комментарий к позиции',
    )
  })

  it('берёт версию приложения, если технические данные не приложены', () => {
    expect(feedbackSubject(draft({ message: 'Мелкая правка', topic: 'idea' }), null)).toBe(
      `SelfCRM ${APP_VERSION} — Идея: Мелкая правка`,
    )
  })

  it('оставляет в теме только первую непустую строку', () => {
    const message = '\n\nПервая строка\nВторая строка, которая в тему не попадает'
    expect(feedbackSubject(draft({ message }), diagnostics)).toBe(
      'SelfCRM 1.5.1 — Ошибка: Первая строка',
    )
  })

  it('сокращает длинное начало сообщения и укладывается в предел', () => {
    const subject = feedbackSubject(draft({ message: 'Очень длинное описание проблемы '.repeat(10) }), diagnostics)
    expect(subject.length).toBeLessThanOrEqual(FEEDBACK_SUBJECT_MAX)
    expect(subject.endsWith('…')).toBe(true)
  })
})

describe('feedbackBody', () => {
  it('собирает письмо: вид обращения, сообщение и контакт', () => {
    const body = feedbackBody(draft({ contact: 'ivan@example.com' }), diagnostics)
    expect(body).toContain('Вид обращения: Ошибка')
    expect(body).toContain('При повторении заказа не переносится комментарий к позиции')
    expect(body).toContain('Контакт для ответа: ivan@example.com')
  })

  it('без контакта пишет, что его нет', () => {
    expect(feedbackBody(draft({ contact: '   ' }), null)).toContain('Контакт для ответа: не указан')
  })

  it('добавляет технические данные, когда их приложили', () => {
    const body = feedbackBody(draft(), diagnostics)
    expect(body).toContain('— Технические данные —')
    expect(body).toContain('Версия: SelfCRM 1.5.1')
    expect(body).toContain('Платформа: Android (приложение)')
    expect(body).toContain('клиентов 12, заказов 40, товаров 8')
  })

  it('без технических данных версии и платформы в письме нет', () => {
    const body = feedbackBody(draft({ attachDiagnostics: false }), null)
    expect(body).not.toContain('Технические данные')
    expect(body).not.toContain('Платформа')
  })

  it('приводит переносы строк к «\\n»: в письме не остаётся «\\r»', () => {
    const body = feedbackBody(draft({ message: 'Первая строка\r\nВторая строка' }), null)
    expect(body).toContain('Первая строка\nВторая строка')
    expect(body).not.toContain('\r')
  })

  it('сокращает слишком длинное сообщение, чтобы письмо целиком уложилось в предел', () => {
    const body = feedbackBody(draft({ message: 'очень длинное сообщение '.repeat(300) }), diagnostics)
    expect(body.length).toBeLessThanOrEqual(FEEDBACK_BODY_MAX)
    expect(body).toContain('…')
    // Технические данные и контакт при сокращении сообщения не теряются.
    expect(body).toContain('— Технические данные —')
    expect(body).toContain('Контакт для ответа')
  })
})

describe('feedbackMailto', () => {
  it('строит ссылку на адрес обратной связи с темой и текстом письма', () => {
    const url = feedbackMailto(draft({ message: 'Не сохраняется заказ' }), diagnostics)
    expect(url.startsWith(`mailto:${FEEDBACK_EMAIL}?subject=`)).toBe(true)

    const [subject, body] = url.slice(url.indexOf('?') + 1).split('&body=')
    expect(decodeURIComponent(subject.slice('subject='.length))).toBe(
      feedbackSubject(draft({ message: 'Не сохраняется заказ' }), diagnostics),
    )
    expect(decodeURIComponent(body)).toBe(feedbackBody(draft({ message: 'Не сохраняется заказ' }), diagnostics))
  })

  it('кодирует кириллицу и переносы строк, оставляя ссылку одной строкой', () => {
    const url = feedbackMailto(draft(), diagnostics)
    expect(url).not.toContain('\n')
    expect(url).toContain('%0A')
    expect(url).not.toContain('Ошибка')
  })
})

describe('feedbackLetterText', () => {
  it('собирает адрес, тему и текст — письмо можно отправить вручную', () => {
    const text = feedbackLetterText(draft({ message: 'Мелкая правка' }), diagnostics)
    expect(text.startsWith(`Кому: ${FEEDBACK_EMAIL}\n`)).toBe(true)
    expect(text).toContain('Тема: SelfCRM 1.5.1 — Ошибка: Мелкая правка')
    expect(text).toContain('Сообщение:')
  })
})

describe('проверки формы', () => {
  it('без сообщения просит его написать', () => {
    expect(feedbackMessageError('   ')).toBe('Напишите, что случилось или что хочется изменить')
  })

  it('слишком короткое сообщение не пропускает', () => {
    expect(feedbackMessageError('ок')).toBe('Слишком коротко: опишите хотя бы одной фразой')
    expect(feedbackMessageError('а'.repeat(FEEDBACK_MESSAGE_MIN))).toBeNull()
  })

  it('длинный контакт не пропускает, пустой — пропускает', () => {
    expect(feedbackContactError('')).toBeNull()
    expect(feedbackContactError('  +7 900 000-00-00  ')).toBeNull()
    expect(feedbackContactError('a'.repeat(121))).toBe('Контакт длиннее 120 символов')
  })
})

describe('collectDiagnostics', () => {
  it('прикладывает версию приложения, платформу и счётчики базы', () => {
    const info = collectDiagnostics({ clients: 3, orders: 7, products: 5 })
    expect(info.version).toBe(APP_VERSION)
    expect(info.platform).toBe('Браузер')
    expect(info).toMatchObject({ clients: 3, orders: 7, products: 5 })
  })
})

describe('openMailto и платформа', () => {
  it('без окна (проверки, серверный рендер) открыть письмо нечем', () => {
    expect(openMailto('mailto:a@b')).toBe('failed')
    expect(platformLabel()).toBe('Браузер')
  })

  it('в браузере открывает mailto: на текущей странице', () => {
    const location: { href?: string } = {}
    vi.stubGlobal('window', { location })
    expect(openMailto('mailto:a@b')).toBe('app')
    expect(location.href).toBe('mailto:a@b')
  })

  it('на Android передаёт ссылку операционной системе', () => {
    const open = vi.fn()
    vi.stubGlobal('window', {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
      open,
    })
    expect(openMailto('mailto:a@b')).toBe('system')
    expect(open).toHaveBeenCalledWith('mailto:a@b', '_system')
    expect(platformLabel()).toBe('Android (приложение)')
  })

  it('во встроенном WebView мессенджера отдаёт ссылку его API', () => {
    const openLink = vi.fn()
    vi.stubGlobal('window', {
      Telegram: { WebApp: { openLink, initData: 'query_id=AAF&user=%7B%7D' } },
      location: {},
    })
    expect(openMailto('mailto:a@b')).toBe('embedded')
    expect(openLink).toHaveBeenCalledWith('mailto:a@b')
    expect(platformLabel()).toBe('Telegram (мини-приложение)')
  })

  it('клиент назвал себя платформой — тоже мини-приложение', () => {
    const openLink = vi.fn()
    vi.stubGlobal('window', { Telegram: { WebApp: { openLink, platform: 'android' } }, location: {} })
    expect(openMailto('mailto:a@b')).toBe('embedded')
    expect(platformLabel()).toBe('Telegram (мини-приложение)')
  })

  it('объект WebApp без данных клиента Telegram не считается: скрипт есть и в браузере', () => {
    const openLink = vi.fn()
    const location: { href?: string } = {}
    vi.stubGlobal('window', {
      Telegram: { WebApp: { openLink, initData: '', platform: 'unknown' } },
      location,
    })
    expect(openMailto('mailto:a@b')).toBe('app')
    expect(openLink).not.toHaveBeenCalled()
    expect(location.href).toBe('mailto:a@b')
    expect(platformLabel()).toBe('Браузер')
  })
})
