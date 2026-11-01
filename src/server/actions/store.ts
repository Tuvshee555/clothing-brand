'use server'

import { refresh, updateTag } from 'next/cache'
import { z } from 'zod'
import { newsletterInput } from '@/lib/validation/store'
import { db } from '@/server/db'
import * as t from '@/server/db/schema'
import { appUrl } from '@/server/app-url'
import { CATALOG_TAG, getCatalog } from '@/server/queries/catalog'
import { clientIp } from '@/server/request'
import { hashIp } from '@/server/security/crypto'
import { enforceRateLimit, LIMITS } from '@/server/security/rate-limit'
import { addToCart, getCartView, updateCartItem, type CartView } from '@/server/services/cart'
import { placeOrder } from '@/server/services/checkout'
import { ensureQpayInvoice, findCustomerOrder, simulateQpayPayment, verifyQpayPayment } from '@/server/services/orders'
import { ensureVisitorKey, readVisitorKey } from '@/server/visitor'
import { toFailure, type ActionResult } from './run'

async function limitBy(rule: (typeof LIMITS)[keyof typeof LIMITS], fallback: string) {
  await enforceRateLimit(db, rule, hashIp(await clientIp()) ?? fallback)
}

export async function loadCartAction(): Promise<CartView> {
  return getCartView(db, await readVisitorKey())
}

export async function addToCartAction(variantId: string, quantity: number): Promise<ActionResult<{ cart: CartView; added: string }>> {
  try {
    const visitorKey = await ensureVisitorKey()
    await limitBy(LIMITS.cart, visitorKey)
    const result = await addToCart(db, visitorKey, { variantId, quantity })
    refresh()
    return { ok: true, data: { cart: await getCartView(db, visitorKey), added: result.productName } }
  } catch (err) {
    return toFailure(err)
  }
}

export async function updateCartAction(itemId: string, quantity: number): Promise<ActionResult<{ cart: CartView }>> {
  try {
    const visitorKey = await ensureVisitorKey()
    await limitBy(LIMITS.cart, visitorKey)
    await updateCartItem(db, visitorKey, { itemId, quantity })
    refresh()
    return { ok: true, data: { cart: await getCartView(db, visitorKey) } }
  } catch (err) {
    return toFailure(err)
  }
}

export async function placeOrderAction(input: unknown): Promise<ActionResult<{ number: string; token: string }>> {
  try {
    const visitorKey = await ensureVisitorKey()
    const placed = await placeOrder({ db, actor: null, now: new Date(), ipHash: hashIp(await clientIp()) }, visitorKey, input)
    // Stock changed: product availability on cached pages must update immediately.
    updateTag(CATALOG_TAG)
    if (placed.paymentMethod === 'qpay') {
      const order = await findCustomerOrder(db, placed.number, { visitorKey })
      // Invoice creation happens after the order transaction; if it fails the order page offers a retry.
      if (order) await ensureQpayInvoice(db, order, appUrl()).catch((err) => console.error('[qpay] invoice', err))
    }
    return { ok: true, data: { number: placed.number, token: placed.accessToken } }
  } catch (err) {
    return toFailure(err)
  }
}

export async function retryInvoiceAction(number: string, token: string | null): Promise<ActionResult<null>> {
  try {
    const visitorKey = await readVisitorKey()
    await limitBy(LIMITS.payment, visitorKey ?? 'anon')
    const order = await findCustomerOrder(db, number, { token, visitorKey })
    if (!order) return { ok: false, error: 'Захиалга олдсонгүй.' }
    await ensureQpayInvoice(db, order, appUrl())
    refresh()
    return { ok: true, data: null }
  } catch (err) {
    return toFailure(err)
  }
}

export async function simulatePaymentAction(number: string, token: string | null): Promise<ActionResult<{ already: boolean }>> {
  try {
    const visitorKey = await readVisitorKey()
    await limitBy(LIMITS.payment, visitorKey ?? 'anon')
    const result = await simulateQpayPayment({ db, actor: null, now: new Date() }, number, { token, visitorKey })
    refresh()
    return { ok: true, data: { already: result.already } }
  } catch (err) {
    return toFailure(err)
  }
}

export async function checkPaymentAction(number: string, token: string | null): Promise<ActionResult<{ status: string }>> {
  try {
    const visitorKey = await readVisitorKey()
    await limitBy(LIMITS.payment, visitorKey ?? 'anon')
    const order = await findCustomerOrder(db, number, { token, visitorKey })
    if (!order) return { ok: false, error: 'Захиалга олдсонгүй.' }
    const status = await verifyQpayPayment({ db, actor: null, now: new Date() }, order.number)
    refresh()
    return { ok: true, data: { status } }
  } catch (err) {
    return toFailure(err)
  }
}

export async function subscribeNewsletterAction(email: string): Promise<ActionResult<{ already: boolean }>> {
  try {
    await limitBy(LIMITS.newsletter, 'anon')
    const input = newsletterInput.parse({ email })
    const inserted = await db
      .insert(t.newsletterSubscribers)
      .values({ email: input.email, source: 'footer', isDemo: true })
      .onConflictDoNothing()
      .returning({ id: t.newsletterSubscribers.id })
    return { ok: true, data: { already: inserted.length === 0 } }
  } catch (err) {
    return toFailure(err)
  }
}

const slugList = z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).max(40)

/** Card data for the wishlist and "recently viewed" (slugs come from the visitor's browser). */
export async function productsBySlugsAction(slugs: string[]) {
  const parsed = slugList.safeParse(slugs)
  if (!parsed.success) return []
  const catalog = await getCatalog()
  const order = new Map(parsed.data.map((s, i) => [s, i]))
  return catalog.filter((p) => order.has(p.slug)).sort((a, b) => order.get(a.slug)! - order.get(b.slug)!)
}
