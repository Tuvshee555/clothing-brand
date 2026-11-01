// Idempotent seed: safe to run any number of times. It only *adds* what is
// missing (keyed by slug, code, e-mail or order number) and never overwrites
// rows, so edits made in /admin survive a re-run. Everything runs in one
// transaction, so a failed run leaves the database unchanged.
import { and, eq, isNull } from 'drizzle-orm'
import { shippingFeeFor } from '@/lib/money'
import type { Database } from '@/server/db/client'
import * as t from '@/server/db/schema'
import { hashPassword } from '@/server/auth/password'
import { applyStockChange } from '@/server/services/inventory'
import { randomToken, sha256Hex } from '@/server/security/crypto'
import { CATEGORIES, COLLECTIONS, PRODUCTS, SAMPLE_CUSTOMERS, SAMPLE_ORDERS, type SampleOrder } from './catalog-data'
import { DEFAULT_POLICIES, DEFAULT_SHIPPING_METHODS, DEFAULT_SIZE_GUIDE, DEFAULT_STORE_INFO } from './content'

export const DEMO_USER_EMAIL = 'demo@manan.example'

const catalogImage = (key: string) => `/images/catalog/${key}.webp`
const editorialImage = (key: string) => `/images/editorial/${key}.webp`

function skuFor(code: string, colorCode: string, size: string) {
  const color = colorCode
    .split('-')
    .map((p) => p.slice(0, 3))
    .join('')
    .toUpperCase()
    .slice(0, 6)
  const sz = size === 'ONE SIZE' ? 'OS' : size.replace(/\s+/g, '')
  return `MN-${code}-${color}-${sz}`
}

/** Units of a variant sold in (non-cancelled) sample orders — added to the initial count. */
function soldInSamples(slug: string, color: string, size: string): number {
  return SAMPLE_ORDERS.filter((o) => o.status !== 'cancelled')
    .flatMap((o) => o.lines)
    .filter((l) => l.slug === slug && l.color === color && l.size === size)
    .reduce((n, l) => n + l.qty, 0)
}

export interface SeedOptions {
  owner?: { email: string; password: string; name: string } | null
  sampleOrders?: boolean
  now?: Date
}

export async function seed(db: Database, opts: SeedOptions = {}): Promise<string[]> {
  const log: string[] = []
  const now = opts.now ?? new Date()
  await db.transaction(async (tx) => {
    // --- Settings ------------------------------------------------------------
    const settingRows = [
      { key: 'store', value: DEFAULT_STORE_INFO },
      { key: 'policies', value: DEFAULT_POLICIES },
      { key: 'size_guide', value: DEFAULT_SIZE_GUIDE },
    ]
    const insertedSettings = await tx.insert(t.settings).values(settingRows).onConflictDoNothing().returning({ key: t.settings.key })
    log.push(`settings: +${insertedSettings.length}`)

    const insertedShipping = await tx.insert(t.shippingMethods).values(DEFAULT_SHIPPING_METHODS).onConflictDoNothing().returning({ id: t.shippingMethods.id })
    log.push(`shipping methods: +${insertedShipping.length}`)

    // --- Categories & collections -------------------------------------------
    const insertedCats = await tx.insert(t.categories).values(CATEGORIES).onConflictDoNothing().returning({ id: t.categories.id })
    log.push(`categories: +${insertedCats.length}`)
    const insertedCols = await tx
      .insert(t.collections)
      .values(
        COLLECTIONS.map((c) => ({
          slug: c.slug,
          name: c.name,
          eyebrow: c.eyebrow,
          description: c.description,
          imageUrl: editorialImage(c.image),
          sortOrder: c.sortOrder,
          isFeatured: c.isFeatured,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: t.collections.id })
    log.push(`collections: +${insertedCols.length}`)

    const categoryId = new Map((await tx.select({ id: t.categories.id, slug: t.categories.slug }).from(t.categories)).map((c) => [c.slug, c.id]))
    const collectionId = new Map((await tx.select({ id: t.collections.id, slug: t.collections.slug }).from(t.collections)).map((c) => [c.slug, c.id]))

    // --- Products --------------------------------------------------------------
    let productsAdded = 0
    let variantsAdded = 0
    for (const [index, p] of PRODUCTS.entries()) {
      const [exists] = await tx.select({ id: t.products.id }).from(t.products).where(eq(t.products.slug, p.slug)).limit(1)
      if (exists) continue
      const catId = categoryId.get(p.category)
      if (!catId) throw new Error(`Unknown category ${p.category} for ${p.slug}`)
      const [product] = await tx
        .insert(t.products)
        .values({
          slug: p.slug,
          name: p.name,
          categoryId: catId,
          audience: p.audience,
          shortDescription: p.shortDescription,
          description: p.description,
          material: p.material,
          care: p.care,
          fit: p.fit,
          basePrice: p.basePrice,
          status: 'active',
          isFeatured: !!p.isFeatured,
          isNewArrival: !!p.isNewArrival,
          tags: p.tags,
          sortOrder: index + 1,
          isDemo: true,
          publishedAt: new Date(now.getTime() - p.publishedDaysAgo * 86_400_000),
        })
        .returning({ id: t.products.id })
      productsAdded++

      for (const [ci, color] of p.colors.entries()) {
        const [c] = await tx
          .insert(t.productColors)
          .values({ productId: product.id, code: color.code, name: color.name, hex: color.hex, sortOrder: ci })
          .returning({ id: t.productColors.id })
        await tx.insert(t.productImages).values(
          color.images.map((key, ii) => ({
            productId: product.id,
            colorId: c.id,
            url: catalogImage(key),
            alt: `${p.imageAlt} — ${color.name.toLowerCase()}${ii > 0 ? `, ${ii + 1}-р зураг` : ''}`,
            sortOrder: ci * 10 + ii,
            credit: 'Burst (Shopify) — лицензтэй стокийн зураг',
          })),
        )
        const counts = p.stock[color.code]
        if (!counts || counts.length !== p.sizes.length) throw new Error(`Stock grid mismatch for ${p.slug}/${color.code}`)
        for (const [si, size] of p.sizes.entries()) {
          const [variant] = await tx
            .insert(t.productVariants)
            .values({
              productId: product.id,
              colorId: c.id,
              size,
              sku: skuFor(p.code, color.code, size),
              priceOverride: p.priceOverrides?.[size] ?? null,
              stock: 0,
              lowStockThreshold: p.category === 'accessories' ? 2 : 2,
              sortOrder: ci * 100 + si,
            })
            .returning({ id: t.productVariants.id })
          variantsAdded++
          const initial = counts[si] + (opts.sampleOrders === false ? 0 : soldInSamples(p.slug, color.code, size))
          if (initial > 0) {
            await applyStockChange(tx, { variantId: variant.id, delta: initial, reason: 'initial', note: 'Анхны тооллого (жишээ өгөгдөл)', actorLabel: 'Систем' })
          }
        }
      }
      for (const slug of p.collections ?? []) {
        const colId = collectionId.get(slug)
        if (colId) await tx.insert(t.productCollections).values({ productId: product.id, collectionId: colId }).onConflictDoNothing()
      }
    }
    log.push(`products: +${productsAdded}, variants: +${variantsAdded}`)

    // --- Users -----------------------------------------------------------------
    const demo = await tx
      .insert(t.users)
      .values({ email: DEMO_USER_EMAIL, name: 'Демо зочин', role: 'demo', passwordHash: null })
      .onConflictDoNothing()
      .returning({ id: t.users.id })
    log.push(`demo user: ${demo.length ? 'created' : 'exists'}`)
    if (opts.owner) {
      const email = opts.owner.email.trim().toLowerCase()
      const [existing] = await tx.select({ id: t.users.id }).from(t.users).where(eq(t.users.email, email)).limit(1)
      if (!existing) {
        await tx.insert(t.users).values({ email, name: opts.owner.name, role: 'owner', passwordHash: await hashPassword(opts.owner.password) })
        log.push('owner: created')
      } else {
        log.push('owner: exists (password unchanged)')
      }
    }

    // --- Sample orders ---------------------------------------------------------
    if (opts.sampleOrders !== false) {
      const added = await seedSampleOrders(tx, now)
      log.push(`sample orders: +${added}`)
    }
  })
  return log
}

async function seedSampleOrders(tx: Database, now: Date): Promise<number> {
  const methods = new Map((await tx.select().from(t.shippingMethods)).map((m) => [m.code, m]))
  let added = 0
  for (const sample of SAMPLE_ORDERS) {
    const [exists] = await tx.select({ id: t.orders.id }).from(t.orders).where(eq(t.orders.number, sample.number)).limit(1)
    if (exists) continue
    const person = SAMPLE_CUSTOMERS.find((c) => c.key === sample.customer)!
    let [customer] = await tx
      .select({ id: t.customers.id })
      .from(t.customers)
      .where(and(eq(t.customers.phone, person.phone), isNull(t.customers.visitorId)))
      .limit(1)
    if (!customer) {
      ;[customer] = await tx
        .insert(t.customers)
        .values({ name: person.name, phone: person.phone, email: person.email, visitorId: null, isDemo: true })
        .returning({ id: t.customers.id })
    }

    const lines = []
    for (const l of sample.lines) {
      const product = PRODUCTS.find((p) => p.slug === l.slug)!
      const sku = skuFor(product.code, l.color, l.size)
      const [v] = await tx
        .select({
          id: t.productVariants.id,
          productId: t.productVariants.productId,
          priceOverride: t.productVariants.priceOverride,
          colorId: t.productVariants.colorId,
          colorName: t.productColors.name,
          basePrice: t.products.basePrice,
          name: t.products.name,
        })
        .from(t.productVariants)
        .innerJoin(t.products, eq(t.products.id, t.productVariants.productId))
        .innerJoin(t.productColors, eq(t.productColors.id, t.productVariants.colorId))
        .where(eq(t.productVariants.sku, sku))
        .limit(1)
      if (!v) throw new Error(`Sample order ${sample.number}: variant ${sku} missing`)
      const [image] = await tx
        .select({ url: t.productImages.url })
        .from(t.productImages)
        .where(and(eq(t.productImages.productId, v.productId), eq(t.productImages.colorId, v.colorId)))
        .orderBy(t.productImages.sortOrder)
        .limit(1)
      const unitPrice = v.priceOverride ?? v.basePrice
      lines.push({ ...l, variantId: v.id, productId: v.productId, name: v.name, colorName: v.colorName, sku, unitPrice, imageUrl: image?.url ?? null })
    }

    const method = methods.get(sample.shipping)!
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0)
    const shippingFee = shippingFeeFor(subtotal, method)
    const placedAt = new Date(now.getTime() - sample.hoursAgo * 3_600_000)
    const at = (hours: number) => new Date(Math.min(now.getTime() - 60_000, placedAt.getTime() + hours * 3_600_000))
    const reached = (s: SampleOrder['status']) => {
      const order = ['pending', 'confirmed', 'processing', 'shipped', 'delivered']
      return sample.status !== 'cancelled' && order.indexOf(sample.status) >= order.indexOf(s)
    }

    const [order] = await tx
      .insert(t.orders)
      .values({
        number: sample.number,
        visitorId: null,
        customerId: customer.id,
        status: sample.status,
        // Sample payments are demo payments: never "paid".
        paymentStatus: sample.paid ? 'simulated' : 'unpaid',
        paymentMethod: sample.payment,
        customerName: person.name,
        customerPhone: person.phone,
        customerEmail: person.email,
        shippingMethodCode: method.code,
        shippingMethodName: method.name,
        shippingFee,
        district: sample.district,
        address: sample.address,
        deliveryNote: null,
        subtotal,
        total: subtotal + shippingFee,
        itemCount: lines.reduce((n, l) => n + l.qty, 0),
        source: 'seed',
        isDemo: true,
        accessTokenHash: sha256Hex(randomToken(24)),
        placedAt,
        confirmedAt: reached('confirmed') ? at(2) : null,
        shippedAt: reached('shipped') ? at(30) : null,
        deliveredAt: reached('delivered') ? at(60) : null,
        cancelledAt: sample.status === 'cancelled' ? at(3) : null,
        cancelReason: sample.cancelReason ?? null,
        createdAt: placedAt,
      })
      .returning({ id: t.orders.id })

    await tx.insert(t.orderItems).values(
      lines.map((l) => ({
        orderId: order.id,
        productId: l.productId,
        variantId: l.variantId,
        productName: l.name,
        productSlug: l.slug,
        colorName: l.colorName,
        size: l.size,
        sku: l.sku,
        imageUrl: l.imageUrl,
        unitPrice: l.unitPrice,
        quantity: l.qty,
        lineTotal: l.unitPrice * l.qty,
      })),
    )

    for (const l of lines) {
      await applyStockChange(tx, { variantId: l.variantId, delta: -l.qty, reason: 'order_reserved', orderId: order.id, actorLabel: `Захиалга ${sample.number}` })
    }

    const events: { from: SampleOrder['status'] | null; to: SampleOrder['status']; at: Date; note: string | null; actor: string }[] = [
      { from: null, to: 'pending', at: placedAt, note: 'Жишээ захиалга вэб дэлгүүрээс үүссэн.', actor: 'Худалдан авагч' },
    ]
    if (sample.status === 'cancelled') {
      events.push({ from: 'pending', to: 'cancelled', at: at(3), note: sample.cancelReason ?? null, actor: 'Эзэмшигч' })
      for (const l of lines) {
        await applyStockChange(tx, { variantId: l.variantId, delta: l.qty, reason: 'order_cancelled', orderId: order.id, actorLabel: 'Эзэмшигч', note: `${sample.number} цуцлагдсан` })
      }
    } else {
      if (reached('confirmed')) events.push({ from: 'pending', to: 'confirmed', at: at(2), note: sample.payment === 'qpay' && sample.paid ? 'Туршилтын QPay төлбөр бүртгэгдлээ.' : null, actor: 'Эзэмшигч' })
      if (reached('processing')) events.push({ from: 'confirmed', to: 'processing', at: at(20), note: null, actor: 'Эзэмшигч' })
      if (reached('shipped')) events.push({ from: 'processing', to: 'shipped', at: at(30), note: null, actor: 'Эзэмшигч' })
      if (reached('delivered')) events.push({ from: 'shipped', to: 'delivered', at: at(60), note: null, actor: 'Эзэмшигч' })
    }
    await tx.insert(t.orderEvents).values(events.map((e) => ({ orderId: order.id, fromStatus: e.from, toStatus: e.to, note: e.note, actorLabel: e.actor, createdAt: e.at })))

    if (sample.payment === 'qpay') {
      await tx.insert(t.payments).values({
        orderId: order.id,
        provider: 'qpay',
        mode: 'mock',
        status: sample.paid ? 'paid' : sample.status === 'cancelled' ? 'cancelled' : 'pending',
        amount: subtotal + shippingFee,
        providerInvoiceId: `sim-sample-${sample.number}`,
        qrText: null,
        isSimulated: true,
        paidAt: sample.paid ? at(1) : null,
        createdAt: placedAt,
      })
    }
    added++
  }
  return added
}
