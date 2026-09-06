import type { Plan } from '../types'

export interface PlanLimits {
  maxClients: number
  maxOrders: number
  warehouse: boolean
  products: boolean
  pdf: boolean
  backup: boolean
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    maxClients: 20,
    maxOrders: 50,
    warehouse: false,
    products: false,
    pdf: false,
    backup: false,
  },
  FULL: {
    maxClients: Number.POSITIVE_INFINITY,
    maxOrders: Number.POSITIVE_INFINITY,
    warehouse: true,
    products: true,
    pdf: true,
    backup: true,
  },
}

export function getLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan]
}

export interface LimitCheck {
  ok: boolean
  reason?: string
}

export function checkClientLimit(plan: Plan, currentCount: number): LimitCheck {
  const limit = PLAN_LIMITS[plan].maxClients
  if (currentCount >= limit) {
    return {
      ok: false,
      reason: `В бесплатной версии можно вести до ${limit} клиентов. Откройте полную версию, чтобы добавить больше.`,
    }
  }
  return { ok: true }
}

export function checkOrderLimit(plan: Plan, currentCount: number): LimitCheck {
  const limit = PLAN_LIMITS[plan].maxOrders
  if (currentCount >= limit) {
    return {
      ok: false,
      reason: `В бесплатной версии можно создать до ${limit} заказов. Откройте полную версию, чтобы продолжить.`,
    }
  }
  return { ok: true }
}
