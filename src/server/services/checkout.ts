// Order creation. Everything that matters is decided here on the server, inside
// one transaction:
//   1. the cart's variants are locked (FOR UPDATE, stable order — no deadlocks)
//   2. availability and stock are re-checked against the locked rows
//   3. prices, delivery fee and total are computed from the database
//   4. the order and immutable line snapshots are written
//   5. stock is reserved through the inventory ledger
// The browser only sends contact/delivery details and its chosen options.
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { sizeLabel } from '@/lib/catalog'
import { formatMoney, shippingFeeFor, variantPrice } from '@/lib/money'
import { isValidArea, type Region } from '@/lib/regions'
import { checkoutInput } from '@/lib/validation/store'
import { ServiceError, type ServiceContext } from '@/server/context'
import * as t from '@/server/db/schema'
import { randomToken, sha256Hex } from '@/server/security/crypto'
import { enforceRateLimit, LIMITS } from '@/server/security/rate-limit'
import { applyStockChange } from './inventory'

export interface PlacedOrder {
  orderId: string
  number: string
  accessToken: string
  total: number
  paymentMethod: 'qpay' | 'cash_on_delivery'
}

export async function placeOrder(ctx: ServiceContext, visitorKey: string, raw: unknown): Promise<PlacedOrder> {
  const input = checkoutInput.parse(raw)
  await enforceRateLimit(ctx.db, LIMITS.checkout, ctx.ipHash ?? visitorKey)

  return ctx.db.transaction(async (tx) => {
    const [cart] = await tx.select({ id: t.carts.id }).from(t.carts).where(eq(t.carts.tokenHash, visitorKey)).limit(1)
    const items = cart
      ? await tx
          .select({ variantId: t.cartItems.variantId, quantity: t.cartItems.quantity })
          .from(t.cartItems)
          .where(eq(t.cartItems.cartId, cart.id))
      : []
    if (!cart || items.length === 0) throw new ServiceError('empty_cart', 'Таны сагс хоосон байна.')

    const variantIds = [...new Set(items.map((i) => i.variantId))].sort()
    // Lock the variant rows first (single-table FOR UPDATE, stable order). They stay
    // locked until this transaction ends, so concurrent checkouts queue up here.
    await tx
      .select({ id: t.productVariants.id })
      .from(t.productVariants)
      .where(inArray(t.productVariants.id, variantIds))
      .orderBy(asc(t.productVariants.id))
      .for('update')
    const locked = await tx
      .select({
        id: t.productVariants.id,
        stock: t.productVariants.stock,
        isActive: t.productVariants.isActive,
        size: t.productVariants.size,
        sku: t.productVariants.sku,
        priceOverride: t.productVariants.priceOverride,
        colorId: t.productVariants.colorId,
        colorName: t.productColors.name,
        productId: t.products.id,
        productName: t.products.name,
        productSlug: t.products.slug,
        productStatus: t.products.status,
        basePrice: t.products.basePrice,
      })
      .from(t.productVariants)
      .innerJoin(t.products, eq(t.products.id, t.productVariants.productId))
      .innerJoin(t.productColors, eq(t.productColors.id, t.productVariants.colorId))
      .where(inArray(t.productVariants.id, variantIds))
    const byId = new Map(locked.map((v) => [v.id, v]))

    const problems: string[] = []
    const lines = items.map((item) => {
      const v = byId.get(item.variantId)
      if (!v || !v.isActive || v.productStatus !== 'active') {
        problems.push(`${v?.productName ?? 'Бараа'} худалдаанд байхгүй болсон байна.`)
        return null
      }
      if (item.quantity > v.stock) {
        const label = `«${v.productName}» (${v.colorName}, ${sizeLabel(v.size)})`
        problems.push(v.stock === 0 ? `${label} дууссан байна.` : `${label}: үлдэгдэл ${v.stock} ширхэг байна.`)
        return null
      }
      const unitPrice = variantPrice(v.basePrice, v.priceOverride)
      return { variant: v, quantity: item.quantity, unitPrice, lineTotal: unitPrice * item.quantity }
    })
    if (problems.length > 0) {
      throw new ServiceError('stock_changed', `Сагсан дахь зарим барааны үлдэгдэл өөрчлөгдсөн байна. ${problems.join(' ')}`)
    }
    const valid = lines.filter((l): l is NonNullable<typeof l> => l !== null)

    const [method] = await tx
      .select()
      .from(t.shippingMethods)
      .where(and(eq(t.shippingMethods.code, input.shippingMethod), eq(t.shippingMethods.isActive, true)))
      .limit(1)
    if (!method) throw new ServiceError('invalid_shipping', 'Хүргэлтийн хэлбэрээ сонгоно уу.', { shippingMethod: 'Хүргэлтийн хэлбэрээ сонгоно уу.' })
    if (!isValidArea(method.region as Region, input.district)) {
      const message = method.region === 'ub' ? 'Улаанбаатарын дүүргээ сонгоно уу.' : 'Аймгаа сонгоно уу.'
      throw new ServiceError('invalid_area', message, { district: message })
    }

    const subtotal = valid.reduce((sum, l) => sum + l.lineTotal, 0)
    const shippingFee = shippingFeeFor(subtotal, method)
    const total = subtotal + shippingFee
    if (input.expectedTotal !== undefined && input.expectedTotal !== total) {
      throw new ServiceError(
        'total_changed',
        `Нийт дүн шинэчлэгдсэн байна: ${formatMoney(total)}. Шалгаад дахин баталгаажуулна уу.`,
        undefined,
        { total },
      )
    }

    // One customer record per phone per browser, so public demo visitors never share records.
    const [existing] = await tx
      .select({ id: t.customers.id })
      .from(t.customers)
      .where(and(eq(t.customers.phone, input.phone), eq(t.customers.visitorId, visitorKey)))
      .limit(1)
    let customerId = existing?.id
    if (customerId) {
      await tx.update(t.customers).set({ name: input.name, email: input.email }).where(eq(t.customers.id, customerId))
    } else {
      const [created] = await tx
        .insert(t.customers)
        .values({ name: input.name, phone: input.phone, email: input.email, visitorId: visitorKey, isDemo: true })
        .returning({ id: t.customers.id })
      customerId = created.id
    }

    const seq = await tx.execute<{ n: string }>(sql`select nextval('store.order_number_seq')::text as n`)
    const number = `MN-${seq.rows[0].n}`
    const accessToken = randomToken(24)

    const images = await tx
      .select({ productId: t.productImages.productId, colorId: t.productImages.colorId, url: t.productImages.url })
      .from(t.productImages)
      .where(inArray(t.productImages.productId, [...new Set(valid.map((l) => l.variant.productId))]))
      .orderBy(asc(t.productImages.sortOrder))

    const [order] = await tx
      .insert(t.orders)
      .values({
        number,
        visitorId: visitorKey,
        customerId,
        status: 'pending',
        paymentStatus: 'unpaid',
        paymentMethod: input.paymentMethod,
        customerName: input.name,
        customerPhone: input.phone,
        customerEmail: input.email,
        shippingMethodCode: method.code,
        shippingMethodName: method.name,
        shippingFee,
        district: input.district,
        address: input.address,
        deliveryNote: input.deliveryNote,
        subtotal,
        total,
        itemCount: valid.reduce((n, l) => n + l.quantity, 0),
        source: 'storefront',
        isDemo: true,
        accessTokenHash: sha256Hex(accessToken),
        placedAt: ctx.now,
      })
      .returning({ id: t.orders.id })

    await tx.insert(t.orderItems).values(
      valid.map((l) => ({
        orderId: order.id,
        productId: l.variant.productId,
        variantId: l.variant.id,
        productName: l.variant.productName,
        productSlug: l.variant.productSlug,
        colorName: l.variant.colorName,
        size: l.variant.size,
        sku: l.variant.sku,
        imageUrl:
          images.find((i) => i.productId === l.variant.productId && i.colorId === l.variant.colorId)?.url ??
          images.find((i) => i.productId === l.variant.productId)?.url ??
          null,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
      })),
    )

    for (const l of valid) {
      await applyStockChange(tx, {
        variantId: l.variant.id,
        delta: -l.quantity,
        reason: 'order_reserved',
        orderId: order.id,
        actorLabel: `Захиалга ${number}`,
      })
    }

    await tx.insert(t.orderEvents).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: 'pending',
      note: 'Захиалга вэб дэлгүүрээс үүслээ. Бараа нөөцлөгдсөн.',
      actorLabel: 'Худалдан авагч',
    })
    await tx.delete(t.cartItems).where(eq(t.cartItems.cartId, cart.id))

    return { orderId: order.id, number, accessToken, total, paymentMethod: input.paymentMethod }
  })
}
