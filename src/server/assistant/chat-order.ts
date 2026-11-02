// The assistant's order adapter (Lorentz commerce/placeOrder.ts at 69e4110,
// adapted): a confirmed chat draft becomes an order through the *same*
// order-creation core as the cart checkout (createOrderInTx), so stock locking,
// server pricing, snapshots and the inventory ledger are identical.
//
// Reservation policy (owner-configurable in the AI Chatbot settings):
//   - at most `maxQuantityPerItem` units of one option per chat order;
//   - at most `maxActiveOrders` unpaid chat orders per browser at a time, counted
//     after that browser's expired holds are released, under an advisory lock so
//     two tabs confirming at the same moment cannot both pass. (The demo counts per
//     browser rather than per phone: public visitors share the example numbers.);
//   - the order holds its stock for `reservationMinutes`, then is cancelled.
// One order per draft: the idempotency key is unique in the database, so a
// repeated or concurrent "тийм" returns the existing order instead of a second one.
import { and, desc, eq, gt, sql } from 'drizzle-orm'
import type { AssistantSettings } from '@/lib/assistant/settings'
import { reservationPolicy } from '@/lib/chat/reservation'
import { checkoutInput } from '@/lib/validation/store'
import { ServiceError, type ServiceContext } from '@/server/context'
import * as t from '@/server/db/schema'
import { enforceRateLimit, LIMITS } from '@/server/security/rate-limit'
import { createOrderInTx } from '@/server/services/checkout'
import { releaseExpiredChatOrders } from '@/server/services/reservations'
import type { ChatOrderRequest, ChatOrderResult } from './purchase'

export const idempotencyKeyFor = (request: Pick<ChatOrderRequest, 'conversationId' | 'draftId'>) => `chat:${request.conversationId}:${request.draftId}`

async function existingOrder(ctx: ServiceContext, key: string) {
  const [order] = await ctx.db.select().from(t.orders).where(eq(t.orders.idempotencyKey, key)).limit(1)
  return order ?? null
}

function resultOf(order: typeof t.orders.$inferSelect, minutes: number, duplicate: boolean): ChatOrderResult {
  return {
    number: order.number,
    total: order.total,
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    expiresAt: order.expiresAt?.toISOString() ?? null,
    reservationMinutes: minutes,
    duplicate,
  }
}

const isUniqueViolation = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } }
  return e?.code === '23505' || e?.cause?.code === '23505'
}

export async function placeChatOrder(
  ctx: ServiceContext,
  visitorKey: string,
  request: ChatOrderRequest,
  settings: AssistantSettings,
): Promise<ChatOrderResult> {
  if (!settings.chatOrdersEnabled) throw new ServiceError('disabled', 'Чатаар захиалга одоогоор хаалттай.')
  const policy = reservationPolicy(settings)
  const key = idempotencyKeyFor(request)

  // Already created from this draft (a retried "тийм"): return it, never a second order.
  const before = await existingOrder(ctx, key)
  if (before) return resultOf(before, policy.minutes, true)

  if (!Number.isInteger(request.quantity) || request.quantity < 1) throw new ServiceError('invalid_quantity', 'Тоо ширхэг буруу байна.')
  if (request.quantity > policy.maxQuantityPerItem) throw new ServiceError('quantity_limit', `Чатаар нэг бараанаас хамгийн ихдээ ${policy.maxQuantityPerItem} ширхэг захиална.`)

  // The same validation as the checkout form.
  const details = checkoutInput.parse({
    name: request.name,
    phone: request.phone,
    email: '',
    shippingMethod: request.shippingMethod,
    district: request.district,
    address: request.address,
    deliveryNote: 'Туслахаар (чатаар) захиалсан',
    paymentMethod: 'qpay',
    acceptDemo: true,
    expectedTotal: request.expectedTotal,
  })
  await enforceRateLimit(ctx.db, LIMITS.checkout, ctx.ipHash ?? visitorKey)

  try {
    const outcome = await ctx.db.transaction(async (tx) => {
      // Serialise this browser's chat orders: the checks below are then exact.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`chat-order:${visitorKey}`}))`)
      // A confirmation that queued behind this one's twin: the order exists now.
      const [twin] = await tx.select({ id: t.orders.id }).from(t.orders).where(eq(t.orders.idempotencyKey, key)).limit(1)
      if (twin) return { orderId: twin.id, duplicate: true }
      // An earlier hold whose deadline passed must not count against the customer.
      await releaseExpiredChatOrders(tx, { now: ctx.now, visitorKey, inTx: true, limit: 20 })
      const active = await tx
        .select({ number: t.orders.number, total: t.orders.total, expiresAt: t.orders.expiresAt })
        .from(t.orders)
        .where(
          and(
            eq(t.orders.source, 'assistant'),
            eq(t.orders.visitorId, visitorKey),
            eq(t.orders.status, 'pending'),
            eq(t.orders.paymentStatus, 'unpaid'),
            gt(t.orders.expiresAt, ctx.now),
          ),
        )
        .orderBy(desc(t.orders.placedAt))
        .limit(policy.maxActiveOrders)
      if (active.length >= policy.maxActiveOrders) {
        throw new ServiceError('reservation_limit', 'Төлбөр хүлээгдэж буй чат захиалга байна.', undefined, {
          number: active[0].number,
          total: active[0].total,
          expiresAt: active[0].expiresAt?.toISOString() ?? null,
        })
      }
      const placed = await createOrderInTx(tx, ctx, {
        visitorKey,
        lines: [{ variantId: request.variantId, quantity: request.quantity }],
        details,
        source: 'assistant',
        stockChangedPrefix: 'Барааны үлдэгдэл өөрчлөгдсөн байна.',
        eventNote: 'Захиалгыг худалдаачин туслах чатаар баталгаажуулсны дараа үүсгэв. Бараа нөөцлөгдсөн.',
        actorLabel: 'Худалдааны туслах',
        idempotencyKey: key,
        expiresAt: new Date(ctx.now.getTime() + policy.minutes * 60_000),
        conversationId: request.conversationId,
      })
      await tx
        .update(t.chatConversations)
        .set({ customerName: details.name, customerPhone: details.phone })
        .where(eq(t.chatConversations.id, request.conversationId))
      return { orderId: placed.orderId, duplicate: false }
    })
    const [order] = await ctx.db.select().from(t.orders).where(eq(t.orders.id, outcome.orderId)).limit(1)
    return resultOf(order, policy.minutes, outcome.duplicate)
  } catch (err) {
    // Two confirmations raced: the other one created the order.
    if (isUniqueViolation(err)) {
      const raced = await existingOrder(ctx, key)
      if (raced) return resultOf(raced, policy.minutes, true)
    }
    throw err
  }
}
