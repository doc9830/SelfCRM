import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icons'
import { SortMenu } from './SortMenu'
import { useRoute } from '../router'
import { useTheme } from '../state/ThemeContext'
import { sortScopeForRoute } from '../state/SortContext'
import { clientsArchiveFromQuery, clientsLink } from '../utils/links'
import { cx } from './ui'

const NAV_ITEMS: Array<{ path: string; label: string; icon: IconName }> = [
  { path: '/', label: 'Главная', icon: 'home' },
  { path: '/clients', label: 'Клиенты', icon: 'users' },
  { path: '/orders', label: 'Заказы', icon: 'receipt' },
  { path: '/products', label: 'Товары', icon: 'box' },
  { path: '/stock', label: 'Склад', icon: 'warehouse' },
]

export function Layout({
  title,
  back,
  children,
}: {
  title: string
  back?: string
  children: ReactNode
}) {
  const { route, navigate } = useRoute()
  const { theme, toggleTheme } = useTheme()
  const root = route.segments[0] ?? ''
  // Сортировка доступна только на экранах-списках — там в шапке появляется значок.
  const sortScope = sortScopeForRoute(route.segments)
  // Архив клиентов: значок показывается только на списке (не в карточке клиента)
  // и остаётся подсвеченным, пока открыт архив. Второе нажатие снимает выделение.
  const clientsList = route.segments.length === 1 && root === 'clients'
  const clientsArchived = clientsList && clientsArchiveFromQuery(route.query.get('archive'))

  const isActive = (path: string) =>
    path === '/' ? root === '' : root === path.slice(1)

  return (
    <div className="app">
      <header className={cx('app-header', sortScope && 'app-header-wide')}>
        <div className="app-header-left">
          {back ? (
            <button className="icon-btn" onClick={() => navigate(back)} aria-label="Назад">
              <Icon name="back" size={22} />
            </button>
          ) : (
            <span className="app-logo">SelfCRM</span>
          )}
        </div>
        <div className="app-header-title">{title}</div>
        <div className="app-header-actions">
          {sortScope && <SortMenu scope={sortScope} />}
          {clientsList && (
            <button
              className={cx('icon-btn', clientsArchived && 'icon-btn-active')}
              onClick={() => navigate(clientsLink(!clientsArchived))}
              aria-pressed={clientsArchived}
              aria-label={clientsArchived ? 'Активные клиенты' : 'Архив клиентов'}
              title={clientsArchived ? 'Активные клиенты' : 'Архив клиентов'}
            >
              <Icon name="archive" size={22} />
            </button>
          )}
          <button
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={22} />
          </button>
          <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="Настройки">
            <Icon name="settings" size={22} />
          </button>
        </div>
      </header>

      <main className="app-main">{children}</main>

      <nav className="app-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            className={cx('nav-item', isActive(item.path) && 'nav-item-active')}
            onClick={() => navigate(item.path)}
          >
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
