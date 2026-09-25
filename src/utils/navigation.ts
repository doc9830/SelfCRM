// Построение маршрута до адреса клиента.
// На Android (Capacitor) открывается системный выбор навигатора через geo:-intent.
// В браузере (dev-режим) — маршрут в Яндекс.Картах в новой вкладке.

export interface RoutePoint {
  lat: number
  lng: number
  label?: string
  // Полный текстовый адрес (с домом). Если он есть, маршрут строится по нему —
  // навигатор сам уточнит точку по своей базе, а не по «центру населённого пункта».
  address?: string
}

// Нативная сборка Android (Capacitor). Признак нужен и ссылкам на клиента (geo:, tel:),
// и обратной связи: письмо передаётся системе тем же способом (utils/feedback.ts).
export function isNativeAndroid(): boolean {
  // Без окна (тесты, серверный рендер) платформы нет: проверка идёт до обращения к window.
  if (typeof window === 'undefined') return false
  const cap = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string }
    }
  ).Capacitor
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
    return cap.getPlatform ? cap.getPlatform() === 'android' : true
  }
  return false
}

// geo:-URI. При открытии на Android система сама предложит выбор приложения
// (Google Maps, Яндекс.Карты, 2ГИС и т.д.). Если задан текстовый адрес, передаём
// его как поисковый запрос `q` — навигатор сам найдёт нужный дом по своей базе.
// Иначе передаём координаты.
export function buildRouteUri(dest: RoutePoint): string {
  const address = (dest.address ?? '').trim()
  if (address) {
    return `geo:0,0?q=${encodeURIComponent(address)}`
  }
  const q = `${dest.lat},${dest.lng}${dest.label ? `(${encodeURIComponent(dest.label)})` : ''}`
  return `geo:0,0?q=${q}`
}

export function openRoute(dest: RoutePoint): void {
  if (!dest) return
  const hasCoords = Number.isFinite(dest.lat) && Number.isFinite(dest.lng)
  const address = (dest.address ?? '').trim()
  if (!hasCoords && !address) return

  if (isNativeAndroid()) {
    // `_system` заставляет Capacitor передать ссылку операционной системе,
    // которая показывает выбор приложения для навигации.
    window.open(buildRouteUri(dest), '_system')
    return
  }

  // В браузере (dev-режим) — маршрут в Яндекс.Картах. Адрес передаём как текст,
  // координаты — как есть (их кодировать не нужно).
  const target = address ? encodeURIComponent(address) : `${dest.lat},${dest.lng}`
  const url = `https://yandex.ru/maps/?rtext=~${target}&rtt=auto`
  window.open(url, '_blank', 'noopener')
}

// tel:-URI для звонка клиенту. Убираем из номера всё, кроме цифр и ведущего «+»,
// чтобы получить корректную ссылку на набор (E.164 для международных номеров).
export function buildTelUri(phone: string): string {
  return `tel:${(phone ?? '').replace(/[^\d+]/g, '')}`
}

// Открывает звонилку. На Android (Capacitor) ссылка передаётся системе через
// `_system` (как и geo:-маршрут). В браузере — обычный tel: на текущей странице.
export function openTel(phone: string): void {
  const clean = (phone ?? '').trim()
  if (!clean) return
  const uri = buildTelUri(clean)
  if (isNativeAndroid()) {
    window.open(uri, '_system')
  } else {
    window.location.href = uri
  }
}

// ----- Мессенджеры -----
//
// Интеграции с Telegram и WhatsApp нет: приложение только открывает переписку с
// клиентом по его номеру — в установленном мессенджере или в веб-версии.
// Телефон приводим к международному виду: «8 900…» и «900…» → «7900…».

export function phoneDigits(phone: string): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  if (digits.length === 10) return `7${digits}`
  return digits
}

// Веб-ссылка Telegram: открывает чат с номером (в браузере и в приложении).
export function buildTelegramUri(phone: string): string {
  return `https://t.me/+${phoneDigits(phone)}`
}

// Приложение Telegram на Android: схема tg:// надёжнее веб-ссылки.
export function buildTelegramAppUri(phone: string): string {
  return `tg://resolve?phone=${phoneDigits(phone)}`
}

// Веб-ссылка WhatsApp (работает и в браузере, и в приложении).
export function buildWhatsAppUri(phone: string): string {
  return `https://wa.me/${phoneDigits(phone)}`
}

// Приложение WhatsApp на Android.
export function buildWhatsAppAppUri(phone: string): string {
  return `whatsapp://send?phone=${phoneDigits(phone)}`
}

function openMessenger(phone: string, webUri: string, appUri: string): void {
  if (!phoneDigits(phone)) return
  if (isNativeAndroid()) {
    window.open(appUri, '_system')
    return
  }
  window.open(webUri, '_blank', 'noopener')
}

export function openTelegram(phone: string): void {
  openMessenger(phone, buildTelegramUri(phone), buildTelegramAppUri(phone))
}

export function openWhatsApp(phone: string): void {
  openMessenger(phone, buildWhatsAppUri(phone), buildWhatsAppAppUri(phone))
}
