// The chat order reservation policy, pure (Lorentz commerce/reservationPolicy.ts
// at 69e4110): how long an unpaid chat order holds its stock, how many unpaid
// chat orders one customer may hold at once, and how many units of one option a
// chat order may contain. The order adapter enforces all three server-side.
// Website checkout is outside these limits.

export const DEFAULT_RESERVATION_MINUTES = 60
export const DEFAULT_MAX_ACTIVE_ORDERS = 1
export const DEFAULT_MAX_QUANTITY_PER_ITEM = 5

export interface ReservationPolicy {
  minutes: number
  maxActiveOrders: number
  maxQuantityPerItem: number
}

type PolicySettings = { reservationMinutes?: unknown; maxActiveOrders?: unknown; maxQuantityPerItem?: unknown } | null | undefined

/** The owner's policy with safe defaults for missing or malformed values. */
export function reservationPolicy(settings: PolicySettings): ReservationPolicy {
  const whole = (value: unknown, fallback: number, min: number, max: number) => {
    const n = Number(value)
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback
  }
  return {
    minutes: whole(settings?.reservationMinutes, DEFAULT_RESERVATION_MINUTES, 5, 1440),
    maxActiveOrders: whole(settings?.maxActiveOrders, DEFAULT_MAX_ACTIVE_ORDERS, 1, 10),
    maxQuantityPerItem: whole(settings?.maxQuantityPerItem, DEFAULT_MAX_QUANTITY_PER_ITEM, 1, 20),
  }
}

/** "60 минут" / "2 цаг", for the order summary and confirmation. */
export function reservationWindowText(minutes: number): string {
  const whole = Math.max(1, Math.round(minutes))
  if (whole >= 120 && whole % 60 === 0) return `${whole / 60} цаг`
  return `${whole} минут`
}
