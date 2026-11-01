// Database schema. Every table lives in the dedicated `store` Postgres schema so
// the store never collides with another application sharing the database.
//
// Invariants enforced here (not only in code):
//  - money is integer tögrög, prices are > 0, stock is >= 0
//  - every colour × size combination is its own variant row with its own SKU and stock
//  - order lines snapshot name / variant / price, so later catalogue edits never
//    rewrite an existing order
//  - every stock change is a row in inventory_transactions (append-only ledger)
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const store = pgSchema('store')

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const productStatus = store.enum('product_status', ['draft', 'active', 'archived'])
export const audience = store.enum('audience', ['women', 'men', 'unisex'])
export const orderStatus = store.enum('order_status', [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
])
/** `simulated` = a demo payment: no money moved. `paid` only comes from a real provider or staff recording cash. */
export const paymentStatus = store.enum('payment_status', ['unpaid', 'simulated', 'paid', 'refunded'])
export const paymentMethod = store.enum('payment_method', ['qpay', 'cash_on_delivery'])
export const inventoryReason = store.enum('inventory_reason', [
  'initial',
  'order_reserved',
  'order_cancelled',
  'restock',
  'adjustment',
  'damaged',
  'return',
])
export const userRole = store.enum('user_role', ['owner', 'manager', 'staff', 'demo'])

export const orderNumberSeq = store.sequence('order_number_seq', { startWith: 10001, increment: 1 })

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const categories = store
  .table('categories', {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    description: text(),
    imageUrl: text(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  })
  .enableRLS()

export const collections = store
  .table('collections', {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    eyebrow: text(),
    description: text(),
    imageUrl: text(),
    sortOrder: integer().notNull().default(0),
    isFeatured: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  })
  .enableRLS()

export const products = store
  .table(
    'products',
    {
      id: uuid().primaryKey().defaultRandom(),
      slug: text().notNull().unique(),
      name: text().notNull(),
      categoryId: uuid()
        .notNull()
        .references(() => categories.id, { onDelete: 'restrict' }),
      audience: audience().notNull().default('unisex'),
      shortDescription: text().notNull(),
      description: text().notNull(),
      material: text().notNull(),
      care: text().notNull(),
      fit: text(),
      basePrice: integer().notNull(),
      status: productStatus().notNull().default('draft'),
      isFeatured: boolean().notNull().default(false),
      isNewArrival: boolean().notNull().default(false),
      /** Free-form search/assistant facets, e.g. winter, layering, cashmere. */
      tags: text().array().notNull().default(sql`'{}'::text[]`),
      sortOrder: integer().notNull().default(0),
      seoTitle: text(),
      seoDescription: text(),
      isDemo: boolean().notNull().default(true),
      publishedAt: timestamp({ withTimezone: true }),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (t) => [
      index('products_status_category_idx').on(t.status, t.categoryId),
      index('products_featured_idx').on(t.isFeatured),
      check('products_base_price_positive', sql`${t.basePrice} > 0`),
    ],
  )
  .enableRLS()

export const productCollections = store
  .table(
    'product_collections',
    {
      productId: uuid()
        .notNull()
        .references(() => products.id, { onDelete: 'cascade' }),
      collectionId: uuid()
        .notNull()
        .references(() => collections.id, { onDelete: 'cascade' }),
      sortOrder: integer().notNull().default(0),
    },
    (t) => [primaryKey({ columns: [t.productId, t.collectionId] }), index('product_collections_collection_idx').on(t.collectionId)],
  )
  .enableRLS()

export const productColors = store
  .table(
    'product_colors',
    {
      id: uuid().primaryKey().defaultRandom(),
      productId: uuid()
        .notNull()
        .references(() => products.id, { onDelete: 'cascade' }),
      /** Stable key used in SKUs and URLs, e.g. "black". */
      code: text().notNull(),
      name: text().notNull(),
      hex: text().notNull(),
      sortOrder: integer().notNull().default(0),
    },
    (t) => [uniqueIndex('product_colors_product_code_uq').on(t.productId, t.code)],
  )
  .enableRLS()

export const productImages = store
  .table(
    'product_images',
    {
      id: uuid().primaryKey().defaultRandom(),
      productId: uuid()
        .notNull()
        .references(() => products.id, { onDelete: 'cascade' }),
      /** When set, the photo shows this colour; the gallery switches with the colour selector. */
      colorId: uuid().references(() => productColors.id, { onDelete: 'set null' }),
      url: text().notNull(),
      alt: text().notNull(),
      width: integer().notNull().default(1440),
      height: integer().notNull().default(1800),
      sortOrder: integer().notNull().default(0),
      /** Where the photo came from (licence record), e.g. "Burst — Photo by …". */
      credit: text(),
      createdAt: createdAt(),
    },
    (t) => [index('product_images_product_idx').on(t.productId, t.sortOrder)],
  )
  .enableRLS()

export const productVariants = store
  .table(
    'product_variants',
    {
      id: uuid().primaryKey().defaultRandom(),
      productId: uuid()
        .notNull()
        .references(() => products.id, { onDelete: 'cascade' }),
      colorId: uuid()
        .notNull()
        .references(() => productColors.id, { onDelete: 'restrict' }),
      size: text().notNull(),
      sku: text().notNull().unique(),
      /** Overrides the product's base price for this variant only. */
      priceOverride: integer(),
      stock: integer().notNull().default(0),
      lowStockThreshold: integer().notNull().default(2),
      isActive: boolean().notNull().default(true),
      sortOrder: integer().notNull().default(0),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (t) => [
      uniqueIndex('product_variants_combo_uq').on(t.productId, t.colorId, t.size),
      index('product_variants_product_idx').on(t.productId),
      check('product_variants_stock_non_negative', sql`${t.stock} >= 0`),
      check('product_variants_price_positive', sql`${t.priceOverride} is null or ${t.priceOverride} > 0`),
      check('product_variants_threshold_non_negative', sql`${t.lowStockThreshold} >= 0`),
    ],
  )
  .enableRLS()

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const users = store
  .table('users', {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull().unique(),
    name: text().notNull(),
    /** Null for the public demo account, which can only be entered through the demo button. */
    passwordHash: text(),
    role: userRole().notNull(),
    isActive: boolean().notNull().default(true),
    lastLoginAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  })
  .enableRLS()

export const sessions = store
  .table(
    'sessions',
    {
      /** sha256 of the cookie token — the raw token is never stored. */
      id: text().primaryKey(),
      userId: uuid()
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
      expiresAt: timestamp({ withTimezone: true }).notNull(),
      userAgent: text(),
      /** Demo sessions are scoped to the visitor's own browser data. */
      visitorId: text(),
      createdAt: createdAt(),
    },
    (t) => [index('sessions_user_idx').on(t.userId)],
  )
  .enableRLS()

export const customers = store
  .table(
    'customers',
    {
      id: uuid().primaryKey().defaultRandom(),
      name: text().notNull(),
      phone: text().notNull(),
      email: text(),
      /** Public demo checkouts are kept per browser so visitors never see each other's details. */
      visitorId: text(),
      isDemo: boolean().notNull().default(true),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (t) => [
      uniqueIndex('customers_phone_visitor_uq').on(t.phone, sql`coalesce(${t.visitorId}, '')`),
      index('customers_visitor_idx').on(t.visitorId),
    ],
  )
  .enableRLS()

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export const carts = store
  .table(
    'carts',
    {
      id: uuid().primaryKey().defaultRandom(),
      tokenHash: text().notNull().unique(),
      visitorId: text().notNull(),
      expiresAt: timestamp({ withTimezone: true }).notNull(),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (t) => [index('carts_expires_idx').on(t.expiresAt)],
  )
  .enableRLS()

export const cartItems = store
  .table(
    'cart_items',
    {
      id: uuid().primaryKey().defaultRandom(),
      cartId: uuid()
        .notNull()
        .references(() => carts.id, { onDelete: 'cascade' }),
      variantId: uuid()
        .notNull()
        .references(() => productVariants.id, { onDelete: 'cascade' }),
      quantity: integer().notNull(),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (t) => [
      uniqueIndex('cart_items_cart_variant_uq').on(t.cartId, t.variantId),
      check('cart_items_quantity_range', sql`${t.quantity} between 1 and 20`),
    ],
  )
  .enableRLS()

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export const shippingMethods = store
  .table(
    'shipping_methods',
    {
      id: uuid().primaryKey().defaultRandom(),
      code: text().notNull().unique(),
      name: text().notNull(),
      description: text().notNull(),
      /** "ub" uses Ulaanbaatar districts, "countryside" uses provinces. */
      region: text().notNull(),
      fee: integer().notNull(),
      /** Orders at or above this subtotal ship free (null = never). */
      freeThreshold: integer(),
      eta: text().notNull(),
      isActive: boolean().notNull().default(true),
      sortOrder: integer().notNull().default(0),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (t) => [
      check('shipping_methods_fee_non_negative', sql`${t.fee} >= 0`),
      check('shipping_methods_region', sql`${t.region} in ('ub', 'countryside')`),
    ],
  )
  .enableRLS()

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const orders = store
  .table(
    'orders',
    {
      id: uuid().primaryKey().defaultRandom(),
      number: text().notNull().unique(),
      visitorId: text(),
      customerId: uuid()
        .notNull()
        .references(() => customers.id, { onDelete: 'restrict' }),
      status: orderStatus().notNull().default('pending'),
      paymentStatus: paymentStatus().notNull().default('unpaid'),
      paymentMethod: paymentMethod().notNull(),
      customerName: text().notNull(),
      customerPhone: text().notNull(),
      customerEmail: text(),
      shippingMethodCode: text().notNull(),
      shippingMethodName: text().notNull(),
      shippingFee: integer().notNull(),
      district: text().notNull(),
      address: text().notNull(),
      deliveryNote: text(),
      subtotal: integer().notNull(),
      total: integer().notNull(),
      itemCount: integer().notNull(),
      /** storefront | seed | admin */
      source: text().notNull().default('storefront'),
      isDemo: boolean().notNull().default(true),
      /** sha256 of the secret in the confirmation link. */
      accessTokenHash: text().notNull(),
      placedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      confirmedAt: timestamp({ withTimezone: true }),
      shippedAt: timestamp({ withTimezone: true }),
      deliveredAt: timestamp({ withTimezone: true }),
      cancelledAt: timestamp({ withTimezone: true }),
      cancelReason: text(),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (t) => [
      index('orders_status_placed_idx').on(t.status, t.placedAt),
      index('orders_placed_idx').on(t.placedAt),
      index('orders_visitor_idx').on(t.visitorId),
      index('orders_customer_idx').on(t.customerId),
      check('orders_amounts_non_negative', sql`${t.subtotal} >= 0 and ${t.shippingFee} >= 0`),
      check('orders_total_matches', sql`${t.total} = ${t.subtotal} + ${t.shippingFee}`),
      check('orders_item_count_positive', sql`${t.itemCount} > 0`),
    ],
  )
  .enableRLS()

export const orderItems = store
  .table(
    'order_items',
    {
      id: uuid().primaryKey().defaultRandom(),
      orderId: uuid()
        .notNull()
        .references(() => orders.id, { onDelete: 'cascade' }),
      productId: uuid().references(() => products.id, { onDelete: 'set null' }),
      variantId: uuid().references(() => productVariants.id, { onDelete: 'set null' }),
      productName: text().notNull(),
      productSlug: text().notNull(),
      colorName: text().notNull(),
      size: text().notNull(),
      sku: text().notNull(),
      imageUrl: text(),
      unitPrice: integer().notNull(),
      quantity: integer().notNull(),
      lineTotal: integer().notNull(),
    },
    (t) => [
      index('order_items_order_idx').on(t.orderId),
      index('order_items_variant_idx').on(t.variantId),
      check('order_items_unit_price_positive', sql`${t.unitPrice} > 0`),
      check('order_items_quantity_range', sql`${t.quantity} between 1 and 20`),
      check('order_items_line_total', sql`${t.lineTotal} = ${t.unitPrice} * ${t.quantity}`),
    ],
  )
  .enableRLS()

export const orderEvents = store
  .table(
    'order_events',
    {
      id: uuid().primaryKey().defaultRandom(),
      orderId: uuid()
        .notNull()
        .references(() => orders.id, { onDelete: 'cascade' }),
      fromStatus: orderStatus(),
      toStatus: orderStatus().notNull(),
      note: text(),
      actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
      actorLabel: text().notNull(),
      createdAt: createdAt(),
    },
    (t) => [index('order_events_order_idx').on(t.orderId, t.createdAt)],
  )
  .enableRLS()

export const payments = store
  .table(
    'payments',
    {
      id: uuid().primaryKey().defaultRandom(),
      orderId: uuid()
        .notNull()
        .references(() => orders.id, { onDelete: 'cascade' }),
      provider: text().notNull(),
      /** mock | sandbox | production */
      mode: text().notNull(),
      /** pending | paid | cancelled */
      status: text().notNull().default('pending'),
      amount: integer().notNull(),
      providerInvoiceId: text(),
      qrText: text(),
      isSimulated: boolean().notNull(),
      paidAt: timestamp({ withTimezone: true }),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (t) => [index('payments_order_idx').on(t.orderId), check('payments_amount_positive', sql`${t.amount} > 0`)],
  )
  .enableRLS()

// ---------------------------------------------------------------------------
// Inventory ledger
// ---------------------------------------------------------------------------

export const inventoryTransactions = store
  .table(
    'inventory_transactions',
    {
      id: uuid().primaryKey().defaultRandom(),
      variantId: uuid()
        .notNull()
        .references(() => productVariants.id, { onDelete: 'restrict' }),
      delta: integer().notNull(),
      stockAfter: integer().notNull(),
      reason: inventoryReason().notNull(),
      note: text(),
      orderId: uuid().references(() => orders.id, { onDelete: 'set null' }),
      actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
      actorLabel: text().notNull(),
      createdAt: createdAt(),
    },
    (t) => [
      index('inventory_tx_variant_idx').on(t.variantId, t.createdAt),
      index('inventory_tx_created_idx').on(t.createdAt),
      check('inventory_tx_delta_non_zero', sql`${t.delta} <> 0`),
      check('inventory_tx_stock_after_non_negative', sql`${t.stockAfter} >= 0`),
    ],
  )
  .enableRLS()

// ---------------------------------------------------------------------------
// Store operation
// ---------------------------------------------------------------------------

export const settings = store
  .table('settings', {
    key: text().primaryKey(),
    value: jsonb().notNull(),
    updatedAt: updatedAt(),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  })
  .enableRLS()

export const newsletterSubscribers = store
  .table('newsletter_subscribers', {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull().unique(),
    source: text().notNull().default('footer'),
    isDemo: boolean().notNull().default(true),
    createdAt: createdAt(),
  })
  .enableRLS()

export const auditLogs = store
  .table(
    'audit_logs',
    {
      id: uuid().primaryKey().defaultRandom(),
      actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
      actorRole: text().notNull(),
      action: text().notNull(),
      entityType: text().notNull(),
      entityId: text(),
      metadata: jsonb().notNull().default({}),
      createdAt: createdAt(),
    },
    (t) => [index('audit_logs_created_idx').on(t.createdAt)],
  )
  .enableRLS()

export const rateLimits = store
  .table('rate_limits', {
    key: text().primaryKey(),
    count: integer().notNull(),
    windowStartedAt: timestamp({ withTimezone: true }).notNull(),
  })
  .enableRLS()

export const aiUsage = store
  .table(
    'ai_usage',
    {
      id: uuid().primaryKey().defaultRandom(),
      /** llm | rules */
      mode: text().notNull(),
      model: text(),
      inputTokens: integer().notNull().default(0),
      outputTokens: integer().notNull().default(0),
      /** Estimated cost in millionths of a US dollar. */
      costMicroUsd: integer().notNull().default(0),
      toolCalls: integer().notNull().default(0),
      ok: boolean().notNull().default(true),
      visitorHash: text(),
      createdAt: createdAt(),
    },
    (t) => [index('ai_usage_created_idx').on(t.createdAt)],
  )
  .enableRLS()

// ---------------------------------------------------------------------------
// Relations (for nested reads)
// ---------------------------------------------------------------------------

export const categoriesRelations = relations(categories, ({ many }) => ({ products: many(products) }))

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  colors: many(productColors),
  images: many(productImages),
  variants: many(productVariants),
  collections: many(productCollections),
}))

export const productCollectionsRelations = relations(productCollections, ({ one }) => ({
  product: one(products, { fields: [productCollections.productId], references: [products.id] }),
  collection: one(collections, { fields: [productCollections.collectionId], references: [collections.id] }),
}))

export const collectionsRelations = relations(collections, ({ many }) => ({ products: many(productCollections) }))

export const productColorsRelations = relations(productColors, ({ one, many }) => ({
  product: one(products, { fields: [productColors.productId], references: [products.id] }),
  variants: many(productVariants),
}))

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
  color: one(productColors, { fields: [productImages.colorId], references: [productColors.id] }),
}))

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  color: one(productColors, { fields: [productVariants.colorId], references: [productColors.id] }),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  items: many(orderItems),
  events: many(orderEvents),
  payments: many(payments),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}))

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
}))

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}))

export const customersRelations = relations(customers, ({ many }) => ({ orders: many(orders) }))

export const cartsRelations = relations(carts, ({ many }) => ({ items: many(cartItems) }))

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  variant: one(productVariants, { fields: [cartItems.variantId], references: [productVariants.id] }),
}))

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one }) => ({
  variant: one(productVariants, { fields: [inventoryTransactions.variantId], references: [productVariants.id] }),
  order: one(orders, { fields: [inventoryTransactions.orderId], references: [orders.id] }),
}))
