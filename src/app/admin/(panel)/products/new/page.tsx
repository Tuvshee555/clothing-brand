import type { Metadata } from 'next'
import { ProductForm } from '@/components/admin/product-form'
import { Card, PageHeader } from '@/components/admin/ui'
import { requireAdminPage } from '@/server/auth/current'
import { getCatalogOptions } from '@/server/queries/admin'

export const metadata: Metadata = { title: 'Шинэ бараа' }

export default async function NewProductPage() {
  await requireAdminPage('/admin/products/new', 'products.edit')
  const options = await getCatalogOptions()
  return (
    <>
      <PageHeader back={{ href: '/admin/products', label: 'Бүтээгдэхүүн' }} title="Шинэ бараа" description="Эхлээд үндсэн мэдээллээ оруулна. Дараагийн алхамд өнгө, хэмжээ, үлдэгдэл, зургаа нэмнэ." />
      <Card>
        <ProductForm
          initial={{
            name: '',
            slug: '',
            categoryId: options.categories[0]?.id ?? '',
            audience: 'unisex',
            shortDescription: '',
            description: '',
            material: '',
            care: '',
            fit: '',
            basePrice: 0,
            status: 'draft',
            isFeatured: false,
            isNewArrival: true,
            tags: [],
            collectionIds: [],
            seoTitle: '',
            seoDescription: '',
          }}
          categories={options.categories.map((c) => ({ id: c.id, name: c.name }))}
          collections={options.collections.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
        />
      </Card>
    </>
  )
}
