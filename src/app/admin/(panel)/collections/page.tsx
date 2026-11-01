import type { Metadata } from 'next'
import { TaxonomyForm } from '@/components/admin/settings-forms'
import { Card, PageHeader } from '@/components/admin/ui'
import { SMART_COLLECTIONS } from '@/lib/catalog-filter'
import { hasPermission } from '@/lib/roles'
import { requireAdminPage } from '@/server/auth/current'
import { getCatalogOptions } from '@/server/queries/admin'

export const metadata: Metadata = { title: 'Ангилал, цуглуулга' }

export default async function CollectionsPage() {
  const actor = await requireAdminPage('/admin/collections', 'products.view')
  const { categories, collections } = await getCatalogOptions()
  const readOnly = !hasPermission(actor.role, 'products.edit')
  return (
    <>
      <PageHeader title="Ангилал, цуглуулга" description="Ангилал нь барааны төрөл (футболк, жинс…). Цуглуулга нь худалдааны сонголт (өвлийн цуглуулга, суурь хувцас…)." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Ангилал">
          <div className="space-y-4 divide-y divide-stone-100">
            {categories.map((c) => (
              <div key={c.id} className="pt-4 first:pt-0">
                <TaxonomyForm kind="category" readOnly={readOnly} initial={{ id: c.id, name: c.name, slug: c.slug, description: c.description, sortOrder: c.sortOrder, isActive: c.isActive }} />
              </div>
            ))}
            {!readOnly && (
              <div className="pt-4">
                <p className="mb-2 text-[12.5px] font-medium">Шинэ ангилал</p>
                <TaxonomyForm kind="category" readOnly={false} initial={{ name: '', slug: '', description: null, sortOrder: categories.length + 1, isActive: true }} />
              </div>
            )}
          </div>
        </Card>
        <Card title="Цуглуулга">
          <div className="space-y-4 divide-y divide-stone-100">
            {collections.map((c) => (
              <div key={c.id} className="pt-4 first:pt-0">
                <TaxonomyForm
                  kind="collection"
                  readOnly={readOnly}
                  smartRule={SMART_COLLECTIONS[c.slug]?.rule}
                  initial={{ id: c.id, name: c.name, slug: c.slug, description: c.description, eyebrow: c.eyebrow, sortOrder: c.sortOrder, isActive: c.isActive, isFeatured: c.isFeatured }}
                />
              </div>
            ))}
            {!readOnly && (
              <div className="pt-4">
                <p className="mb-2 text-[12.5px] font-medium">Шинэ цуглуулга</p>
                <TaxonomyForm kind="collection" readOnly={false} initial={{ name: '', slug: '', description: null, sortOrder: collections.length + 1, isActive: true, isFeatured: false }} />
              </div>
            )}
          </div>
          <p className="mt-4 text-[12px] text-stone-500">Цуглуулгад бараа нэмэхдээ тухайн барааны хуудаснаас сонгоно.</p>
        </Card>
      </div>
    </>
  )
}
