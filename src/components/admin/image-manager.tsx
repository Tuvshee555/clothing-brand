'use client'

import { Trash2, Upload } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { removeImageAction, uploadImageAction } from '@/server/actions/admin'
import { AButton, ainput } from './ui'
import { ActionFeedback, useAdminAction } from './use-admin-action'

/** Shrinks large photos in the browser before upload (max 2000px, JPEG). */
async function downscale(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/avif') return file
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size < 3_000_000) return file
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  return blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file
}

export function ImageManager({
  productId,
  images,
  colors,
  canEdit,
  canUpload,
  uploadsConfigured,
}: {
  productId: string
  images: { id: string; url: string; alt: string; colorId: string | null; credit: string | null }[]
  colors: { id: string; name: string }[]
  canEdit: boolean
  canUpload: boolean
  uploadsConfigured: boolean
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [colorId, setColorId] = useState('')
  const [alt, setAlt] = useState('')
  const { pending, error, message, run } = useAdminAction()

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {images.map((img) => (
          <figure key={img.id} className="group relative">
            <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-bone">
              <Image src={img.url} alt={img.alt} fill sizes="160px" className="object-cover" />
            </div>
            <figcaption className="mt-1 text-[11px] text-stone-600">{colors.find((c) => c.id === img.colorId)?.name ?? 'Бүх өнгө'}</figcaption>
            {canEdit && (
              <button
                type="button"
                onClick={() => run(() => removeImageAction(img.id), 'Зураг устгагдлаа.', () => router.refresh())}
                className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-white/90 text-danger opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100"
                aria-label="Зураг устгах"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </figure>
        ))}
      </div>
      {canUpload ? (
        uploadsConfigured ? (
          <form
            className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-stone-300 p-3"
            onSubmit={(e) => {
              e.preventDefault()
              const file = fileRef.current?.files?.[0]
              if (!file) return
              run(
                async () => {
                  const fd = new FormData()
                  fd.set('file', await downscale(file))
                  fd.set('productId', productId)
                  fd.set('colorId', colorId)
                  fd.set('alt', alt)
                  return uploadImageAction(fd)
                },
                'Зураг нэмэгдлээ.',
                () => {
                  if (fileRef.current) fileRef.current.value = ''
                  setAlt('')
                  router.refresh()
                },
              )
            }}
          >
            <div>
              <label className="mb-1 block text-[12px] font-medium" htmlFor="img-file">
                Зураг (JPG, PNG, WebP)
              </label>
              <input id="img-file" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="block text-[12.5px]" required />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium" htmlFor="img-color">
                Өнгө
              </label>
              <select id="img-color" className={`${ainput} w-40`} value={colorId} onChange={(e) => setColorId(e.target.value)}>
                <option value="">Бүх өнгө</option>
                {colors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-48 flex-1">
              <label className="mb-1 block text-[12px] font-medium" htmlFor="img-alt">
                Тайлбар (alt текст)
              </label>
              <input id="img-alt" className={ainput} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Жишээ: Хар hoodie, урд тал" maxLength={200} />
            </div>
            <AButton type="submit" variant="secondary" disabled={pending}>
              <Upload className="h-4 w-4" /> {pending ? 'Байршуулж байна…' : 'Байршуулах'}
            </AButton>
          </form>
        ) : (
          <p className="rounded-lg bg-paper-2 px-3 py-2 text-[12.5px] text-stone-600">Зураг хадгалах сан (Cloudinary) тохируулагдаагүй тул байршуулах боломжгүй.</p>
        )
      ) : (
        <p className="rounded-lg bg-paper-2 px-3 py-2 text-[12.5px] text-stone-600">Демо горимд зураг байршуулах, устгах боломжгүй.</p>
      )}
      <ActionFeedback error={error} message={message} />
    </div>
  )
}
