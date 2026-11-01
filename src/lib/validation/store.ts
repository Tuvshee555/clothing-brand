// Customer-facing inputs: cart and checkout. Prices and totals are never part of
// these payloads — the server reads them from the database.
import { z } from 'zod'
import { MAX_LINE_QUANTITY } from '@/lib/catalog'
import { id, optionalEmail, optionalText, personName, phone } from './common'

export const quantity = z
  .number({ error: 'Тоо ширхэг оруулна уу.' })
  .int({ error: 'Бүхэл тоо оруулна уу.' })
  .min(1, { error: 'Хамгийн багадаа 1 ширхэг.' })
  .max(MAX_LINE_QUANTITY, { error: `Нэг удаад хамгийн ихдээ ${MAX_LINE_QUANTITY} ширхэг.` })

export const addToCartInput = z.object({ variantId: id, quantity })

export const updateCartInput = z.object({
  itemId: id,
  /** 0 removes the line. */
  quantity: z
    .number({ error: 'Тоо ширхэг оруулна уу.' })
    .int({ error: 'Бүхэл тоо оруулна уу.' })
    .min(0, { error: 'Тоо ширхэг сөрөг байж болохгүй.' })
    .max(MAX_LINE_QUANTITY, { error: `Нэг удаад хамгийн ихдээ ${MAX_LINE_QUANTITY} ширхэг.` }),
})

export const checkoutInput = z.object({
  name: personName,
  phone,
  email: optionalEmail,
  shippingMethod: z.string({ error: 'Хүргэлтийн хэлбэрээ сонгоно уу.' }).trim().min(1, { error: 'Хүргэлтийн хэлбэрээ сонгоно уу.' }).max(40),
  district: z.string({ error: 'Дүүрэг эсвэл аймгаа сонгоно уу.' }).trim().min(2, { error: 'Дүүрэг эсвэл аймгаа сонгоно уу.' }).max(60),
  address: z
    .string({ error: 'Хүргэлтийн хаягаа оруулна уу.' })
    .trim()
    .min(8, { error: 'Хаягаа дэлгэрэнгүй бичнэ үү: хороо, байр, орц, тоот.' })
    .max(300, { error: 'Хаяг хэт урт байна.' }),
  deliveryNote: optionalText(300),
  paymentMethod: z.enum(['qpay', 'cash_on_delivery'], { error: 'Төлбөрийн хэлбэрээ сонгоно уу.' }),
  acceptDemo: z.literal(true, { error: 'Энэ нь демо захиалга гэдгийг зөвшөөрнө үү.' }),
  /** The total the visitor saw. If prices or stock changed meanwhile the server refuses and shows the new total. */
  expectedTotal: z.number().int().nonnegative().optional(),
})
export type CheckoutInput = z.input<typeof checkoutInput>

export const newsletterInput = z.object({
  email: z
    .string({ error: 'И-мэйл хаягаа оруулна уу.' })
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email({ error: 'И-мэйл хаяг буруу байна.' })),
})
