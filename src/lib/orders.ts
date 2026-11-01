// Order and payment vocabulary and the order status machine (isomorphic).
// Stock is reserved when an order is placed; cancelling an order returns it.

export const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Хүлээгдэж буй',
  confirmed: 'Баталгаажсан',
  processing: 'Бэлтгэж буй',
  shipped: 'Хүргэлтэд гарсан',
  delivered: 'Хүргэгдсэн',
  cancelled: 'Цуцлагдсан',
}

/** What the button that moves an order *into* a status says. */
export const STATUS_ACTION_LABELS: Record<OrderStatus, string> = {
  pending: 'Хүлээгдэж буй болгох',
  confirmed: 'Баталгаажуулах',
  processing: 'Бэлтгэж эхлэх',
  shipped: 'Хүргэлтэд гаргах',
  delivered: 'Хүргэгдсэн гэж тэмдэглэх',
  cancelled: 'Захиалга цуцлах',
}

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from]
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/** Reserved stock goes back on the shelf when an order is cancelled before it ships. */
export function restoresStock(from: OrderStatus, to: OrderStatus): boolean {
  return to === 'cancelled' && from !== 'cancelled'
}

export const OPEN_STATUSES: readonly OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped']

export type PaymentStatus = 'unpaid' | 'simulated' | 'paid' | 'refunded'
export type PaymentMethod = 'qpay' | 'cash_on_delivery'

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Төлөгдөөгүй',
  simulated: 'Туршилтын төлбөр',
  paid: 'Төлсөн',
  refunded: 'Буцаан олгосон',
}

export const PAYMENT_STATUS_HINTS: Record<PaymentStatus, string> = {
  unpaid: 'Төлбөр хараахан хийгдээгүй.',
  simulated: 'Демо горимд дуурайлгасан төлбөр — бодит мөнгө шилжээгүй.',
  paid: 'Төлбөрийн үйлчилгээ баталгаажуулсан эсвэл ажилтан бүртгэсэн.',
  refunded: 'Төлбөрийг буцаан олгосон.',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  qpay: 'QPay',
  cash_on_delivery: 'Хүргэлтээр төлөх',
}
