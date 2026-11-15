// Admin roles and the permission matrix. Isomorphic: the server enforces these,
// the UI only uses them to decide what to show or disable.

export const ROLES = ['owner', 'manager', 'staff', 'demo'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Эзэмшигч',
  manager: 'Менежер',
  staff: 'Ажилтан',
  demo: 'Демо зочин',
}

export const PERMISSIONS = [
  'dashboard.view',
  'products.view',
  'products.edit',
  'media.upload',
  'inventory.view',
  'inventory.adjust',
  'orders.view',
  'orders.update',
  'customers.view',
  'settings.view',
  'settings.edit',
  'audit.view',
  /** AI Chatbot section: read conversations, analytics, usage, problems; try the chatbot. */
  'assistant.view',
  /** Take a chat over, reply as staff, hand it back, notes. */
  'assistant.reply',
  /** Chatbot settings and the owner's knowledge (FAQ). */
  'assistant.manage',
] as const
export type Permission = (typeof PERMISSIONS)[number]

const STAFF: Permission[] = [
  'dashboard.view',
  'products.view',
  'inventory.view',
  'inventory.adjust',
  'orders.view',
  'orders.update',
  'customers.view',
  'assistant.view',
  'assistant.reply',
]
const MANAGER: Permission[] = [...STAFF, 'products.edit', 'media.upload', 'settings.view', 'audit.view', 'assistant.manage']

/**
 * The public demo can look at everything that holds no secrets, and may move
 * only its *own* demo orders through their statuses (enforced in the order
 * service) and take over / answer only its *own* chats (enforced in the
 * assistant admin service). It cannot edit the catalogue, stock, settings or
 * the chatbot's knowledge and settings.
 */
const DEMO: Permission[] = [
  'dashboard.view',
  'products.view',
  'inventory.view',
  'orders.view',
  'orders.update',
  'customers.view',
  'settings.view',
  'assistant.view',
  'assistant.reply',
]

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  manager: new Set(MANAGER),
  staff: new Set(STAFF),
  demo: new Set(DEMO),
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return MATRIX[role].has(permission)
}

/** Why a demo visitor sees a disabled control. */
export const DEMO_READ_ONLY_REASON =
  'Демо горимд энэ үйлдэл хаалттай. Эзэмшигчийн бүртгэлээр нэвтэрвэл бүтээгдэхүүн, үлдэгдэл, тохиргоог засна.'
