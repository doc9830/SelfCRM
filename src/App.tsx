import { Layout } from './components/Layout'
import { useRoute } from './router'
import { ClientDetail } from './screens/ClientDetail'
import { Clients } from './screens/Clients'
import { Dashboard } from './screens/Dashboard'
import { OrderDetail } from './screens/OrderDetail'
import { Orders } from './screens/Orders'
import { Products } from './screens/Products'
import { Settings } from './screens/Settings'
import { Stock } from './screens/Stock'

export function App() {
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
          <Layout title="Клиент" back="/clients">
            <ClientDetail id={seg[1]} />
          </Layout>
        )
      }
      return (
        <Layout title="Клиенты">
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
      return (
        <Layout title="Склад">
          <Stock />
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
