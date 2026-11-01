// Admin photo uploads to Cloudinary (signed, server-side — the API secret never
// reaches the browser). Catalogue photos shipped with the demo are static files;
// this is only for photos added later from /admin.
import 'server-only'
import { createHash } from 'node:crypto'
import { ServiceError } from '@/server/context'

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
const MAX_BYTES = 8 * 1024 * 1024

export function cloudinaryConfigured(): boolean {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
}

export async function uploadProductImage(file: File): Promise<{ url: string; width: number; height: number }> {
  if (!cloudinaryConfigured()) throw new ServiceError('storage_off', 'Зураг хадгалах сан (Cloudinary) тохируулагдаагүй байна.')
  if (!ALLOWED.has(file.type)) throw new ServiceError('bad_type', 'Зөвхөн JPG, PNG, WebP, AVIF зураг байршуулна.')
  if (file.size > MAX_BYTES) throw new ServiceError('too_big', 'Зургийн хэмжээ 8 MB-аас ихгүй байна.')
  const cloud = process.env.CLOUDINARY_CLOUD_NAME!
  const folder = `${process.env.CLOUDINARY_FOLDER || 'manan-store'}/products`
  const timestamp = Math.floor(Date.now() / 1000)
  // Signature: parameters sorted alphabetically, joined, followed by the API secret.
  const signature = createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`).digest('hex')
  const form = new FormData()
  form.set('file', file)
  form.set('api_key', process.env.CLOUDINARY_API_KEY!)
  form.set('timestamp', String(timestamp))
  form.set('folder', folder)
  form.set('signature', signature)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`, { method: 'POST', body: form, signal: controller.signal })
    const data = (await res.json().catch(() => ({}))) as { secure_url?: string; width?: number; height?: number; error?: { message?: string } }
    if (!res.ok || !data.secure_url) {
      console.error('[cloudinary] upload failed', res.status, data.error?.message)
      throw new ServiceError('upload_failed', 'Зураг байршуулж чадсангүй. Дахин оролдоно уу.')
    }
    return { url: data.secure_url, width: data.width ?? 1440, height: data.height ?? 1800 }
  } finally {
    clearTimeout(timer)
  }
}
