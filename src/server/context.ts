// Shared types for server services. Services receive everything they need in a
// ServiceContext (no Next.js imports), which keeps them callable from server
// actions, route handlers, scripts and integration tests alike.
import type { Role } from '@/lib/roles'
import type { Database } from '@/server/db/client'

export interface Actor {
  userId: string
  role: Role
  name: string
  email: string
  /** Hashed visitor key of the browser a demo session belongs to (demo role only). */
  visitorKey: string | null
}

export interface ServiceContext {
  db: Database
  actor: Actor | null
  now: Date
  /** Hashed client IP, for rate limits (never the raw IP). */
  ipHash?: string | null
}

/** A business-rule failure with a Mongolian, user-presentable message. */
export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string>,
    /** Extra data for the caller (e.g. the corrected total after a price change). */
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

export const ERR = {
  unauthenticated: () => new ServiceError('unauthenticated', 'Нэвтэрч орно уу.'),
  forbidden: () => new ServiceError('forbidden', 'Танд энэ үйлдлийг хийх эрх байхгүй байна.'),
  demoReadOnly: () =>
    new ServiceError(
      'demo_read_only',
      'Демо горимд энэ үйлдэл хаалттай. Эзэмшигчийн бүртгэлээр нэвтэрвэл засварлах боломжтой.',
    ),
  notFound: (what = 'Мэдээлэл') => new ServiceError('not_found', `${what} олдсонгүй.`),
  rateLimited: () => new ServiceError('rate_limited', 'Хэт олон оролдлого хийлээ. Түр хүлээгээд дахин оролдоно уу.'),
}
