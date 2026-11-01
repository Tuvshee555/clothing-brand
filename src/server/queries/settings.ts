import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'
import type { Policies, SizeGuide, StoreInfo } from '@/lib/settings'
import { db } from '@/server/db'
import type { Database } from '@/server/db/client'
import * as t from '@/server/db/schema'
import { DEFAULT_POLICIES, DEFAULT_SIZE_GUIDE, DEFAULT_STORE_INFO } from '@/server/seed/content'
import { SETTINGS_TAG } from './catalog'

async function readSetting<T>(database: Database, key: string, fallback: T): Promise<T> {
  const [row] = await database.select({ value: t.settings.value }).from(t.settings).where(eq(t.settings.key, key)).limit(1)
  return (row?.value as T | undefined) ?? fallback
}

export function loadStoreInfo(database: Database) {
  return readSetting<StoreInfo>(database, 'store', DEFAULT_STORE_INFO)
}

export function loadPolicies(database: Database) {
  return readSetting<Policies>(database, 'policies', DEFAULT_POLICIES)
}

export function loadShippingMethods(database: Database, { activeOnly = true } = {}) {
  return database
    .select()
    .from(t.shippingMethods)
    .where(activeOnly ? eq(t.shippingMethods.isActive, true) : undefined)
    .orderBy(asc(t.shippingMethods.sortOrder))
}

/** Store info, policies, size guide and delivery options for public pages (cached). */
export async function getStoreContent() {
  'use cache'
  cacheTag(SETTINGS_TAG)
  cacheLife('hours')
  const [info, policies, sizeGuide, shipping] = await Promise.all([
    loadStoreInfo(db),
    loadPolicies(db),
    readSetting<SizeGuide>(db, 'size_guide', DEFAULT_SIZE_GUIDE),
    loadShippingMethods(db),
  ])
  return {
    info,
    policies,
    sizeGuide,
    shipping: shipping.map((s) => ({
      code: s.code,
      name: s.name,
      description: s.description,
      region: s.region as 'ub' | 'countryside',
      fee: s.fee,
      freeThreshold: s.freeThreshold,
      eta: s.eta,
    })),
  }
}
export type StoreContent = Awaited<ReturnType<typeof getStoreContent>>
