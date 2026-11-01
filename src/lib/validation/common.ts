import { z } from 'zod'
import './mn-errors'
import { normalizePhone } from '@/lib/phone'

export const id = z.guid({ error: 'Буруу дугаар.' })

export const phone = z
  .string({ error: 'Утасны дугаараа оруулна уу.' })
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhone(v)
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Утасны дугаар 8 оронтой байх ёстой. Жишээ: 9911 2233' })
      return z.NEVER
    }
    return n
  })

export const personName = z
  .string({ error: 'Нэрээ оруулна уу.' })
  .trim()
  .min(2, { error: 'Нэрээ бүтэн оруулна уу.' })
  .max(80, { error: 'Нэр хэт урт байна.' })

const emailFormat = z.email()
export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, { error: 'И-мэйл хаяг хэт урт байна.' })
  .refine((v) => v === '' || emailFormat.safeParse(v).success, { error: 'И-мэйл хаяг буруу байна.' })
  .nullish()
  .transform((v) => (v ? v : null))

export const email = z
  .string({ error: 'И-мэйл хаягаа оруулна уу.' })
  .trim()
  .toLowerCase()
  .max(254, { error: 'И-мэйл хаяг хэт урт байна.' })
  .pipe(z.email({ error: 'И-мэйл хаяг буруу байна.' }))

export const password = z
  .string({ error: 'Нууц үгээ оруулна уу.' })
  .min(10, { error: 'Нууц үг хамгийн багадаа 10 тэмдэгт байна.' })
  .max(128, { error: 'Нууц үг хэт урт байна.' })

export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: `Хамгийн ихдээ ${max} тэмдэгт.` })
    .nullish()
    .transform((v) => (v ? v : null))
}

export const price = z
  .number({ error: 'Үнэ оруулна уу.' })
  .int({ error: 'Бүхэл тоо оруулна уу.' })
  .min(1_000, { error: 'Үнэ хамгийн багадаа 1,000₮ байна.' })
  .max(50_000_000, { error: 'Үнэ хэт өндөр байна.' })

/** Reads a FormData field as a trimmed string ('' when missing). */
export function formString(fd: FormData, key: string): string {
  const v = fd.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

export function formBool(fd: FormData, key: string): boolean {
  const v = fd.get(key)
  return v === 'on' || v === 'true' || v === '1'
}

/** Integer from a form field; tolerates "125,000₮". Null when empty or not a number. */
export function formInt(fd: FormData, key: string): number | null {
  const v = formString(fd, key).replace(/[\s,₮]/g, '')
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/** First error message per field, for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form'
    if (!out[key]) out[key] = issue.message
  }
  return out
}
