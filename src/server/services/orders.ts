// Order lifecycle after checkout: status changes (with stock restored on
// cancellation), QPay invoices and the demo payment simulation, and cash
// payments recorded by staff.
import { and, desc, eq } from 'drizzle-orm'
import { canTransition, ORDER_STATUS_LABELS, restoresStock, type OrderStatus } from '@/lib/orders'
import { markPaidInput, orderStatusInput } from '@/lib/validation/admin'
import { actorLabel, audit } from '@/server/audit'
import { ERR, ServiceError, type Actor, type ServiceContext } from '@/server/context'
import type { Database } from '@/server/db/client'
import * as t from '@/server/db/schema'
import { getQPay } from '@/server/payments'
import { sha256Hex, safeEqual } from '@/server/security/crypto'
import { applyStockChange } from './inventory'

type Order = typeof t.orders.$inferSelect

/** Demo visitors may only act on orders their own browser placed (never on sample orders). */
export function demoCanTouch(actor: Actor, order: Pick<Order, 'visitorId' | 'source'>): boolean {
  return actor.role !== 'demo' || (order.source === 'storefront' && !!actor.visitorKey && order.visitorId === actor.visitorKey)
}

export async function transitionOrder(ctx: ServiceContext & { actor: Actor }, raw: unknown) {
  const input = orderStatusInput.parse(raw)
  return ctx.db.transaction(async (tx) => {
    const [order] = await tx.select().from(t.orders).where(eq(t.orders.id, input.orderId)).for('update')
    if (!order) throw ERR.notFound('Захиалга')
    if (!demoCanTouch(ctx.actor, order)) {
      throw new ServiceError(
        'demo_scope',
        'Демо горимд зөвхөн та өөрөө дэлгүүрээс үүсгэсэн захиалгын төлөвийг өөрчилнө. Жишээ захиалгууд зөвхөн харагдана.',
      )
    }
    const from = order.status as OrderStatus
    const to = input.to
    if (!canTransition(from, to)) {
      throw new ServiceError('invalid_transition', `«${ORDER_STATUS_LABELS[from]}» төлөвөөс «${ORDER_STATUS_LABELS[to]}» руу шилжих боломжгүй.`)
    }
    if (to === 'cancelled' && !input.note) {
      throw new ServiceError('reason_required', 'Цуцлах шалтгаанаа бичнэ үү.', { note: 'Цуцлах шалтгаанаа бичнэ үү.' })
    }

    const label = actorLabel(ctx.actor)
    let restored = 0
    if (restoresStock(from, to)) {
      const items = await tx
        .select({ variantId: t.orderItems.variantId, quantity: t.orderItems.quantity })
        .from(t.orderItems)
        .where(eq(t.orderItems.orderId, order.id))
      for (const item of items) {
        if (!item.variantId) continue
        await applyStockChange(tx, {
          variantId: item.variantId,
          delta: item.quantity,
          reason: 'order_cancelled',
          orderId: order.id,
          actorUserId: ctx.actor.userId,
          actorLabel: label,
          note: `${order.number} цуцлагдсан`,
        })
        restored += item.quantity
      }
    }

    const now = ctx.now
    await tx
      .update(t.orders)
      .set({
        status: to,
        ...(to === 'confirmed' ? { confirmedAt: now } : {}),
        ...(to === 'shipped' ? { shippedAt: now } : {}),
        ...(to === 'delivered' ? { deliveredAt: now } : {}),
        ...(to === 'cancelled' ? { cancelledAt: now, cancelReason: input.note } : {}),
      })
      .where(eq(t.orders.id, order.id))
    await tx.insert(t.orderEvents).values({
      orderId: order.id,
      fromStatus: from,
      toStatus: to,
      note: input.note ?? (restored > 0 ? `${restored} ширхэг бараа агуулахад буцлаа.` : null),
      actorUserId: ctx.actor.userId,
      actorLabel: label,
    })
    if (to === 'cancelled' && order.paymentMethod === 'qpay' && order.paymentStatus === 'unpaid') {
      await tx.update(t.payments).set({ status: 'cancelled' }).where(and(eq(t.payments.orderId, order.id), eq(t.payments.status, 'pending')))
    }
    await audit(tx, ctx.actor, 'order.status_changed', { type: 'order', id: order.id }, { number: order.number, from, to, restored })
    return { number: order.number, from, to, restored }
  })
}

/** Staff record that cash/card was received on delivery. Not available to the public demo. */
export async function recordCashPayment(ctx: ServiceContext & { actor: Actor }, raw: unknown) {
  const { orderId } = markPaidInput.parse(raw)
  if (ctx.actor.role === 'demo') throw ERR.demoReadOnly()
  return ctx.db.transaction(async (tx) => {
    const [order] = await tx.select().from(t.orders).where(eq(t.orders.id, orderId)).for('update')
    if (!order) throw ERR.notFound('Захиалга')
    if (order.paymentMethod !== 'cash_on_delivery') throw new ServiceError('wrong_method', 'Энэ захиалга хүргэлтээр төлөх захиалга биш.')
    if (order.status === 'cancelled') throw new ServiceError('cancelled', 'Цуцлагдсан захиалгад төлбөр бүртгэхгүй.')
    if (order.paymentStatus !== 'unpaid') throw new ServiceError('already_paid', 'Төлбөр аль хэдийн бүртгэгдсэн байна.')
    await tx.update(t.orders).set({ paymentStatus: 'paid' }).where(eq(t.orders.id, order.id))
    await tx.insert(t.orderEvents).values({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: order.status,
      note: 'Хүргэлтийн үед төлбөр хүлээн авсныг бүртгэв.',
      actorUserId: ctx.actor.userId,
      actorLabel: actorLabel(ctx.actor),
    })
    await audit(tx, ctx.actor, 'order.payment_recorded', { type: 'order', id: order.id }, { number: order.number, amount: order.total })
    return { number: order.number }
  })
}

// ---------------------------------------------------------------------------
// Customer side: order page access and QPay
// ---------------------------------------------------------------------------

/** The order if this browser placed it or the visitor holds its secret link. */
export async function findCustomerOrder(db: Database, number: string, access: { token?: string | null; visitorKey?: string | null }) {
  if (!/^MN-\d{5,9}$/.test(number)) return null
  const [order] = await db.select().from(t.orders).where(eq(t.orders.number, number)).limit(1)
  if (!order) return null
  const tokenOk = !!access.token && access.token.length < 100 && safeEqual(sha256Hex(access.token), order.accessTokenHash)
  const visitorOk = !!access.visitorKey && order.visitorId === access.visitorKey
  return tokenOk || visitorOk ? order : null
}

/** Creates (or returns) the QPay invoice for an unpaid QPay order. Never inside a DB transaction. */
export async function ensureQpayInvoice(db: Database, order: Order, callbackBase: string) {
  if (order.paymentMethod !== 'qpay' || order.paymentStatus !== 'unpaid' || order.status === 'cancelled') return null
  const [pending] = await db
    .select()
    .from(t.payments)
    .where(and(eq(t.payments.orderId, order.id), eq(t.payments.status, 'pending')))
    .orderBy(desc(t.payments.createdAt))
    .limit(1)
  if (pending) return pending
  const qpay = getQPay()
  const invoice = await qpay.createInvoice({
    reference: order.number,
    amount: order.total,
    description: `${order.number} захиалгын төлбөр`,
    receiverCode: order.customerPhone,
    callbackUrl: `${callbackBase}/api/payments/qpay/callback?order=${encodeURIComponent(order.number)}`,
  })
  const [payment] = await db
    .insert(t.payments)
    .values({
      orderId: order.id,
      provider: 'qpay',
      mode: qpay.mode,
      status: 'pending',
      amount: order.total,
      providerInvoiceId: invoice.providerInvoiceId,
      qrText: invoice.qrText,
      isSimulated: qpay.mode === 'mock',
    })
    .returning()
  return payment
}

/**
 * The demo's "simulate payment" button. Only works for a simulated (mock)
 * invoice: the order is marked `simulated` — never `paid` — and confirmed.
 */
export async function simulateQpayPayment(ctx: ServiceContext, number: string, access: { token?: string | null; visitorKey?: string | null }) {
  const order = await findCustomerOrder(ctx.db, number, access)
  if (!order) throw ERR.notFound('Захиалга')
  return ctx.db.transaction(async (tx) => {
    const [locked] = await tx.select().from(t.orders).where(eq(t.orders.id, order.id)).for('update')
    if (locked.status === 'cancelled') throw new ServiceError('cancelled', 'Цуцлагдсан захиалгад төлбөр хийх боломжгүй.')
    if (locked.paymentMethod !== 'qpay') throw new ServiceError('wrong_method', 'Энэ захиалгыг хүргэлтээр төлөхөөр сонгосон байна.')
    if (locked.paymentStatus !== 'unpaid') return { number: locked.number, already: true }
    const [payment] = await tx
      .select()
      .from(t.payments)
      .where(and(eq(t.payments.orderId, locked.id), eq(t.payments.status, 'pending')))
      .orderBy(desc(t.payments.createdAt))
      .limit(1)
    if (!payment) throw new ServiceError('no_invoice', 'Төлбөрийн нэхэмжлэх үүсээгүй байна. Хуудсаа сэргээнэ үү.')
    if (!payment.isSimulated || payment.mode !== 'mock') {
      throw new ServiceError('real_payment', 'Бодит QPay горимд төлбөрийг банкны аппликейшнээр хийнэ.')
    }
    await tx.update(t.payments).set({ status: 'paid', paidAt: ctx.now }).where(eq(t.payments.id, payment.id))
    const confirm = locked.status === 'pending'
    await tx
      .update(t.orders)
      .set({ paymentStatus: 'simulated', ...(confirm ? { status: 'confirmed' as const, confirmedAt: ctx.now } : {}) })
      .where(eq(t.orders.id, locked.id))
    await tx.insert(t.orderEvents).values({
      orderId: locked.id,
      fromStatus: locked.status,
      toStatus: confirm ? 'confirmed' : locked.status,
      note: 'Туршилтын QPay төлбөр бүртгэгдлээ (бодит мөнгө шилжээгүй). Захиалга автоматаар баталгаажлаа.',
      actorLabel: 'QPay (симуляц)',
    })
    return { number: locked.number, already: false }
  })
}

/** Real QPay only: asks QPay whether the invoice is paid and records it. Never trusts the caller. */
export async function verifyQpayPayment(ctx: ServiceContext, number: string): Promise<'paid' | 'unpaid' | 'skipped'> {
  const [order] = await ctx.db.select().from(t.orders).where(eq(t.orders.number, number)).limit(1)
  if (!order || order.paymentStatus !== 'unpaid' || order.status === 'cancelled') return 'skipped'
  const [payment] = await ctx.db
    .select()
    .from(t.payments)
    .where(and(eq(t.payments.orderId, order.id), eq(t.payments.status, 'pending')))
    .orderBy(desc(t.payments.createdAt))
    .limit(1)
  if (!payment?.providerInvoiceId || payment.isSimulated) return 'skipped'
  const check = await getQPay().checkInvoice(payment.providerInvoiceId)
  if (!check.paid || check.paidAmount < order.total) return 'unpaid'
  await ctx.db.transaction(async (tx) => {
    const [locked] = await tx.select().from(t.orders).where(eq(t.orders.id, order.id)).for('update')
    if (locked.paymentStatus !== 'unpaid') return
    await tx.update(t.payments).set({ status: 'paid', paidAt: ctx.now }).where(eq(t.payments.id, payment.id))
    const confirm = locked.status === 'pending'
    await tx
      .update(t.orders)
      .set({ paymentStatus: 'paid', ...(confirm ? { status: 'confirmed' as const, confirmedAt: ctx.now } : {}) })
      .where(eq(t.orders.id, locked.id))
    await tx.insert(t.orderEvents).values({
      orderId: locked.id,
      fromStatus: locked.status,
      toStatus: confirm ? 'confirmed' : locked.status,
      note: 'QPay төлбөр баталгаажлаа.',
      actorLabel: 'QPay',
    })
  })
  return 'paid'
}
