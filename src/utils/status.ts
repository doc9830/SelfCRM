import type { OrderStatus } from '../types'
import type { BadgeTone } from '../components/ui'

export function statusTone(status: OrderStatus): BadgeTone {
  switch (status) {
    case 'new':
      return 'blue'
    case 'in_progress':
      return 'amber'
    case 'done':
      return 'green'
    case 'cancelled':
      return 'red'
  }
}
