// Куда ведёт «Назад». Стрелочка в шапке приложения и системная кнопка Android
// должны вести в одно и то же место, поэтому правила живут здесь, а не в разметке
// экранов: шапка берёт стрелку из headerBackTarget, а кнопка — из backTarget.
import type { Route } from '../router'
import { clientCardBackFromQuery, clientsArchiveFromQuery } from './links'

// Событие «логического назад» на document. Обработчики, которым нажатие адресовано
// (открытое модальное окно, меню сортировки), вызывают preventDefault — тогда
// приложение уже не меняет экран. Так системная кнопка сначала закрывает окна.
export const BACK_EVENT = 'selfcrm:back'

export const HOME_PATH = '/'
export const CLIENTS_PATH = '/clients'
export const ORDERS_PATH = '/orders'
export const STOCK_PATH = '/stock'

// Куда ведёт стрелочка «Назад» в шапке. null — стрелочки на экране нет
// (верхний уровень раздела: списки, настройки, главная).
export function headerBackTarget(route: Route): string | null {
  const seg = route.segments
  switch (seg[0] ?? '') {
    case 'clients':
      // Карточка клиента помнит, что возврат должен вести в архив (?from=archive).
      return seg[1] ? clientCardBackFromQuery(route.query.get('from')) : null
    case 'orders':
      return seg[1] ? ORDERS_PATH : null
    case 'stock':
      return seg[1] ? STOCK_PATH : null
    case 'statistics':
      return HOME_PATH
    default:
      return null
  }
}

// Куда ведёт системная кнопка «Назад»: как стрелочка, а с верхнего уровня —
// на «Главную». null — идти некуда: мы на главной, там выход по второму нажатию.
export function backTarget(route: Route): string | null {
  const header = headerBackTarget(route)
  if (header) return header

  const root = route.segments[0] ?? ''
  if (root === '') return null
  // Архив — это режим списка клиентов, а не отдельный раздел: возвращаемся
  // к активным клиентам, а не на главную.
  if (root === 'clients' && clientsArchiveFromQuery(route.query.get('archive'))) {
    return CLIENTS_PATH
  }
  return HOME_PATH
}
