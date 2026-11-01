// Audit trail for important admin actions. Metadata must be a safe summary:
// no secrets, tokens, passwords or full addresses.
import type { Actor } from '@/server/context'
import type { Database } from '@/server/db/client'
import * as t from '@/server/db/schema'

export type AuditAction =
  | 'product.created'
  | 'product.updated'
  | 'product.status_changed'
  | 'product.image_added'
  | 'product.image_removed'
  | 'variant.created'
  | 'variant.updated'
  | 'color.created'
  | 'stock.adjusted'
  | 'order.status_changed'
  | 'order.payment_recorded'
  | 'category.saved'
  | 'collection.saved'
  | 'shipping.updated'
  | 'settings.updated'
  | 'policy.updated'
  | 'user.password_changed'
  | 'user.login'
  | 'demo.entered'

export async function audit(
  db: Database,
  actor: Actor | null,
  action: AuditAction,
  entity: { type: string; id?: string | null },
  metadata: Record<string, unknown> = {},
) {
  await db.insert(t.auditLogs).values({
    actorUserId: actor?.userId ?? null,
    actorRole: actor?.role ?? 'system',
    action,
    entityType: entity.type,
    entityId: entity.id ?? null,
    metadata,
  })
}

/** Who to show in histories ("Эзэмшигч · Б. Тэмүүлэн", "Демо зочин"). */
export function actorLabel(actor: Actor | null): string {
  if (!actor) return 'Систем'
  if (actor.role === 'demo') return 'Демо зочин'
  return actor.name
}
