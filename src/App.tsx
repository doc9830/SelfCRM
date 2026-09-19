import { Layout } from './components/Layout'
import { UpdateToast } from './components/UpdateToast'
import { useRoute } from './router'
import { ClientDetail } from './screens/ClientDetail'
import { Clients } from './screens/Clients'
import { Dashboard } from './screens/Dashboard'
import { OrderDetail } from './screens/OrderDetail'
import { Orders } from './screens/Orders'
import { Products } from './screens/Products'
import { Settings } from './screens/Settings'
import { Statistics } from './screens/Statistics'
import { Stock } from './screens/Stock'
import { StockProduct } from './screens/StockProduct'
import { clientCardBackFromQuery, clientsArchiveFromQuery } from './utils/links'

export function App() {
  return (
    <>
      {renderScreen()}
      <UpdateToast />
    </>
  )
}

function renderScreen() {
  const { route } = useRoute()
  const seg = route.segments
  const root = seg[0] ?? ''

  switch (root) {
    case '':
      return (
        <Layout title="Главная">
          <Dashboard />
        </Layout>
      )

    case 'clients':
      if (seg[1]) {
        return (
          <Layout title="Клиент" back={clientCardBackFromQuery(route.query.get('from'))}>
            <ClientDetail id={seg[1]} />
          </Layout>
        )
      }
      return (
        <Layout title={clientsArchiveFromQuery(route.query.get('archive')) ? 'Архив' : 'Клиенты'}>
          <Clients />
        </Layout>
      )

    case 'orders':
      if (seg[1]) {
        return (
          <Layout title={seg[1] === 'new' ? 'Новый заказ' : 'Заказ'} back="/orders">
            <OrderDetail id={seg[1]} presetClientId={route.query.get('client')} />
          </Layout>
        )
      }
      return (
        <Layout title="Заказы">
          <Orders />
        </Layout>
      )

    case 'products':
      return (
        <Layout title="Товары">
          <Products />
        </Layout>
      )

    case 'stock':
      if (seg[1]) {
        return (
          <Layout title="Движение товара" back="/stock">
            <StockProduct id={seg[1]} />
          </Layout>
        )
      }
      return (
        <Layout title="Склад">
          <Stock />
        </Layout>
      )

    case 'statistics':
      return (
        <Layout title="Статистика" back="/">
          <Statistics />
        </Layout>
      )

    case 'settings':
      return (
        <Layout title="Настройки">
          <Settings />
        </Layout>
      )

    default:
      return (
        <Layout title="Главная">
          <Dashboard />
        </Layout>
      )
  }
}
