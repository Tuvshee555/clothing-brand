import { ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ImageManager } from '@/components/admin/image-manager'
import { ProductForm } from '@/components/admin/product-form'
import { Card, PageHeader } from '@/components/admin/ui'
import { VariantManager } from '@/components/admin/variant-manager'
import { PRODUCT_STATUS_LABELS } from '@/lib/catalog'
import { DEMO_READ_ONLY_REASON, hasPermission } from '@/lib/roles'
import { requireAdminPage } from '@/server/auth/current'
import { getCatalogOptions, getProductForEdit } from '@/server/queries/admin'
import { cloudinaryConfigured } from '@/server/storage/cloudinary'

export const metadata: Metadata = { title: 'Бараа засах' }

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [actor, { id }, sp] = await Promise.all([requireAdminPage('/admin/products', 'products.view'), params, searchParams])
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [data, options] = await Promise.all([getProductForEdit(id), getCatalogOptions()])
  if (!data) notFound()
  const { product, colors, variants, images, collectionIds } = data
  const canEdit = hasPermission(actor.role, 'products.edit')
  const canAdjust = hasPermission(actor.role, 'inventory.adjust')
  return (
    <>
      <PageHeader
        back={{ href: '/admin/products', label: 'Бүтээгдэхүүн' }}
        title={product.name}
        description={`${PRODUCT_STATUS_LABELS[product.status]} · ${variants.length} хувилбар · ${variants.reduce((s, v) => s + v.stock, 0)} ширхэг үлдэгдэл`}
        actions={
          product.status === 'active' ? (
            <Link href={`/products/${product.slug}`} target="_blank" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-4 text-[13.5px] hover:bg-paper">
              Дэлгүүрт харах <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : undefined
        }
      />
      {sp.created && <p className="mb-4 rounded-lg bg-success-soft px-3 py-2 text-[13px] text-success">Бараа үүслээ. Одоо өнгө, хэмжээ, үлдэгдэл, зургаа нэмээд «Нийтлэгдсэн» болгоно уу.</p>}
      {!canEdit && <p className="mb-4 rounded-lg bg-info-soft px-3 py-2 text-[12.5px] text-info">{DEMO_READ_ONLY_REASON}</p>}
      <div className="space-y-4">
        <Card title="Хувилбар, үнэ, үлдэгдэл" actions={<span className="text-[12px] text-stone-500">Өнгө × хэмжээ бүр тусдаа SKU, үлдэгдэлтэй</span>}>
          <VariantManager
            productId={product.id}
            basePrice={product.basePrice}
            colors={colors.map((c) => ({ id: c.id, name: c.name, code: c.code, hex: c.hex }))}
            variants={variants.map((v) => ({
              id: v.id,
              colorId: v.colorId,
              size: v.size,
              sku: v.sku,
              priceOverride: v.priceOverride,
              stock: v.stock,
              lowStockThreshold: v.lowStockThreshold,
              isActive: v.isActive,
            }))}
            readOnly={!canEdit}
            canAdjust={canAdjust}
          />
        </Card>
        <Card title="Мэдээлэл">
          <ProductForm
            productId={product.id}
            readOnly={!canEdit}
            initial={{
              name: product.name,
              slug: product.slug,
              categoryId: product.categoryId,
              audience: product.audience,
              shortDescription: product.shortDescription,
              description: product.description,
              material: product.material,
              care: product.care,
              fit: product.fit ?? '',
              basePrice: product.basePrice,
              status: product.status,
              isFeatured: product.isFeatured,
              isNewArrival: product.isNewArrival,
              tags: product.tags,
              collectionIds,
              seoTitle: product.seoTitle ?? '',
              seoDescription: product.seoDescription ?? '',
            }}
            categories={options.categories.map((c) => ({ id: c.id, name: c.name }))}
            collections={options.collections.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
          />
        </Card>
        <Card title={`Зураг (${images.length})`} actions={<span className="text-[12px] text-stone-500">Өнгөнд оноосон зураг тухайн өнгийг сонгоход гарна</span>}>
          <ImageManager
            productId={product.id}
            images={images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, colorId: i.colorId, credit: i.credit }))}
            colors={colors.map((c) => ({ id: c.id, name: c.name }))}
            canEdit={canEdit}
            canUpload={hasPermission(actor.role, 'media.upload')}
            uploadsConfigured={cloudinaryConfigured()}
          />
        </Card>
      </div>
    </>
  )
}
