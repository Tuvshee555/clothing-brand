// Admin inputs. Every mutation is validated here on the server before any
// permission-checked service touches the database.
import { z } from 'zod'
import { ORDER_STATUSES } from '@/lib/orders'
import { email, id, optionalText, password, price } from './common'

export const slugField = z
  .string({ error: 'Вэб хаяг оруулна уу.' })
  .trim()
  .toLowerCase()
  .min(2, { error: 'Вэб хаяг хэт богино байна.' })
  .max(80, { error: 'Вэб хаяг хэт урт байна.' })
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'Зөвхөн латин жижиг үсэг, тоо, зураас (-) ашиглана.' })

export const productInput = z.object({
  name: z.string({ error: 'Нэр оруулна уу.' }).trim().min(2, { error: 'Нэр хэт богино байна.' }).max(120),
  slug: slugField,
  categoryId: id,
  audience: z.enum(['women', 'men', 'unisex']),
  shortDescription: z.string().trim().min(10, { error: 'Товч тайлбар хамгийн багадаа 10 тэмдэгт.' }).max(240),
  description: z.string().trim().min(20, { error: 'Дэлгэрэнгүй тайлбар хамгийн багадаа 20 тэмдэгт.' }).max(4000),
  material: z.string().trim().min(2, { error: 'Материалаа бичнэ үү.' }).max(300),
  care: z.string().trim().min(2, { error: 'Арчилгааны зааврыг бичнэ үү.' }).max(500),
  fit: optionalText(120),
  basePrice: price,
  status: z.enum(['draft', 'active', 'archived']),
  isFeatured: z.boolean(),
  isNewArrival: z.boolean(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(12, { error: 'Хамгийн ихдээ 12 шошго.' }),
  collectionIds: z.array(id).max(12),
  seoTitle: optionalText(70),
  seoDescription: optionalText(170),
})
export type ProductInput = z.input<typeof productInput>

export const colorInput = z.object({
  productId: id,
  name: z.string({ error: 'Өнгөний нэр оруулна уу.' }).trim().min(2).max(40),
  code: slugField,
  hex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, { error: 'Өнгөний код #000000 хэлбэртэй байна.' }),
})

export const sizeField = z
  .string({ error: 'Хэмжээ оруулна уу.' })
  .trim()
  .toUpperCase()
  .min(1, { error: 'Хэмжээ оруулна уу.' })
  .max(12, { error: 'Хэмжээ хэт урт байна.' })
  .regex(/^[A-Z0-9/ ]+$/, { error: 'Хэмжээг латин үсэг, тоогоор бичнэ (жишээ: M, 32, ONE SIZE).' })

export const skuField = z
  .string({ error: 'SKU оруулна уу.' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/, { error: 'SKU нь латин том үсэг, тоо, зураасаас бүрдэнэ (3–40 тэмдэгт).' })

export const variantCreateInput = z.object({
  productId: id,
  colorId: id,
  sizes: z.array(sizeField).min(1, { error: 'Дор хаяж нэг хэмжээ оруулна уу.' }).max(12),
  initialStock: z.number().int().min(0).max(10_000),
})

export const variantUpdateInput = z.object({
  variantId: id,
  sku: skuField,
  priceOverride: price.nullable(),
  lowStockThreshold: z.number().int().min(0, { error: 'Сөрөг байж болохгүй.' }).max(1000),
  isActive: z.boolean(),
})

export const STOCK_REASONS = ['restock', 'adjustment', 'damaged', 'return'] as const
export const stockAdjustInput = z
  .object({
    variantId: id,
    mode: z.enum(['set', 'delta']),
    value: z.number({ error: 'Тоо оруулна уу.' }).int({ error: 'Бүхэл тоо оруулна уу.' }),
    reason: z.enum(STOCK_REASONS, { error: 'Шалтгаанаа сонгоно уу.' }),
    note: optionalText(200),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'set' && (v.value < 0 || v.value > 10_000)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Үлдэгдэл 0–10,000 хооронд байна.' })
    }
    if (v.mode === 'delta' && (v.value === 0 || Math.abs(v.value) > 1_000)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Өөрчлөлт 0 биш, ±1,000-аас хэтрэхгүй байна.' })
    }
  })

export const orderStatusInput = z.object({
  orderId: id,
  to: z.enum(ORDER_STATUSES),
  note: optionalText(300),
})

export const markPaidInput = z.object({ orderId: id })

export const categoryInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(2).max(60),
  slug: slugField,
  description: optionalText(300),
  sortOrder: z.number().int().min(0).max(999),
  isActive: z.boolean(),
})

export const collectionInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(2).max(60),
  slug: slugField,
  eyebrow: optionalText(60),
  description: optionalText(400),
  sortOrder: z.number().int().min(0).max(999),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
})

export const shippingMethodInput = z.object({
  id,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(240),
  fee: z.number().int().min(0).max(1_000_000),
  freeThreshold: z.number().int().min(0).max(100_000_000).nullable(),
  eta: z.string().trim().min(2).max(80),
  isActive: z.boolean(),
})

export const storeInfoInput = z.object({
  storeName: z.string().trim().min(2).max(60),
  tagline: z.string().trim().min(2).max(120),
  contactEmail: email,
  contactHours: z.string().trim().min(2).max(120),
  announcement: z.string().trim().max(160),
  announcementEnabled: z.boolean(),
})

export const POLICY_KEYS = ['delivery', 'returns', 'exchange', 'ordering', 'payment', 'privacy'] as const
export type PolicyKey = (typeof POLICY_KEYS)[number]
export const policyInput = z.object({
  key: z.enum(POLICY_KEYS),
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(20, { error: 'Нөхцөлийн текст хэт богино байна.' }).max(6000),
})

export const loginInput = z.object({
  email,
  password: z.string({ error: 'Нууц үгээ оруулна уу.' }).min(1, { error: 'Нууц үгээ оруулна уу.' }).max(128),
})

export const changePasswordInput = z
  .object({ current: z.string().min(1, { error: 'Одоогийн нууц үгээ оруулна уу.' }).max(128), next: password, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'Шинэ нууц үг таарахгүй байна.' })
