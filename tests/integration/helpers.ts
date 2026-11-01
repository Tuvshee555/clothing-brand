import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { inject } from 'vitest'
import type { Actor, ServiceContext } from '@/server/context'
import { createDb, createPool } from '@/server/db/client'
import * as t from '@/server/db/schema'

export type TestDb = ReturnType<typeof createDb>

/** A fresh database cloned from the seeded template. */
export async function createTestDb() {
  const adminUrl = inject('pgAdminUrl')
  const template = inject('pgTemplate')
  const name = `t_${randomUUID().replace(/-/g, '').slice(0, 16)}`
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  await admin.query(`create database ${name} template ${template}`)
  await admin.end()
  const pool = createPool(adminUrl.replace(/\/postgres$/, `/${name}`), { max: 6 })
  const db = createDb(pool)
  return {
    db,
    async cleanup() {
      await pool.end()
      const c = new pg.Client({ connectionString: adminUrl })
      await c.connect()
      await c.query(`drop database if exists ${name} with (force)`)
      await c.end()
    },
  }
}

export async function ownerActor(db: TestDb): Promise<Actor> {
  const [u] = await db.select().from(t.users).where(eq(t.users.role, 'owner')).limit(1)
  return { userId: u.id, role: 'owner', name: u.name, email: u.email, visitorKey: null }
}

export async function demoActor(db: TestDb, visitorKey: string): Promise<Actor> {
  const [u] = await db.select().from(t.users).where(eq(t.users.role, 'demo')).limit(1)
  return { userId: u.id, role: 'demo', name: u.name, email: u.email, visitorKey }
}

export function ctx(db: TestDb, actor: Actor | null = null, ipHash = `ip-${randomUUID()}`): ServiceContext {
  return { db, actor, now: new Date(), ipHash }
}

/** A variant by product slug, colour code and size. */
export async function variant(db: TestDb, slug: string, color: string, size: string) {
  const [row] = await db
    .select({ id: t.productVariants.id, stock: t.productVariants.stock, sku: t.productVariants.sku, priceOverride: t.productVariants.priceOverride, basePrice: t.products.basePrice })
    .from(t.productVariants)
    .innerJoin(t.products, eq(t.products.id, t.productVariants.productId))
    .innerJoin(t.productColors, eq(t.productColors.id, t.productVariants.colorId))
    .where(and(eq(t.products.slug, slug), eq(t.productColors.code, color), eq(t.productVariants.size, size)))
    .limit(1)
  if (!row) throw new Error(`variant ${slug}/${color}/${size} not found`)
  return row
}

export async function stockOf(db: TestDb, variantId: string): Promise<number> {
  const [row] = await db.select({ stock: t.productVariants.stock }).from(t.productVariants).where(eq(t.productVariants.id, variantId))
  return row.stock
}

export const visitor = () => `visitor-${randomUUID()}`

export const checkoutDetails = {
  name: 'Тест Худалдан Авагч',
  phone: '9911 2233',
  email: '',
  shippingMethod: 'ub-standard',
  district: 'Хан-Уул',
  address: '15-р хороо, Тест хотхон, 3-р байр, 45 тоот',
  deliveryNote: null,
  paymentMethod: 'qpay' as const,
  acceptDemo: true,
}
