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
]
const MANAGER: Permission[] = [...STAFF, 'products.edit', 'media.upload', 'settings.view', 'audit.view']

/**
 * The public demo can look at everything that holds no secrets, and may move
 * only its *own* demo orders through their statuses (enforced in the order
 * service). It cannot edit the catalogue, stock or settings.
 */
const DEMO: Permission[] = [
  'dashboard.view',
  'products.view',
  'inventory.view',
  'orders.view',
  'orders.update',
  'customers.view',
  'settings.view',
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
