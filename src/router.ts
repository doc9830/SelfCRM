import { useEffect, useState } from 'react'

export interface Route {
  path: string
  segments: string[]
  query: URLSearchParams
}

// Разбор адреса вынесен в отдельную функцию: по нему решают и экраны, и
// системная кнопка «Назад» (см. utils/back.ts), поэтому правила парсинга — часть контракта.
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/'
  const [pathPart, queryPart] = raw.split('?')
  const segments = pathPart.split('/').filter(Boolean)
  const query = new URLSearchParams(queryPart ?? '')
  return { path: pathPart, segments, query }
}

export function useRoute(): { route: Route; navigate: (path: string) => void } {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = (path: string) => {
    if (window.location.hash === `#${path}`) return
    window.location.hash = path
  }

  return { route, navigate }
}

export function go(path: string): void {
  window.location.hash = path
}

