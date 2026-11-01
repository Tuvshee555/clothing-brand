import type { Metadata } from 'next'
import { PasswordForm, PolicyForm, ShippingMethodForm, StoreInfoForm } from '@/components/admin/settings-forms'
import { Card, PageHeader } from '@/components/admin/ui'
import { hasPermission } from '@/lib/roles'
import type { PolicyKey } from '@/lib/settings'
import { requireAdminPage } from '@/server/auth/current'
import { qpayMode } from '@/server/payments'
import { getSettingsData } from '@/server/queries/admin'
import { cloudinaryConfigured } from '@/server/storage/cloudinary'

export const metadata: Metadata = { title: 'Тохиргоо' }

const POLICY_ORDER: PolicyKey[] = ['delivery', 'returns', 'exchange', 'ordering', 'payment', 'privacy']

export default async function SettingsPage() {
  const actor = await requireAdminPage('/admin/settings', 'settings.view')
  const data = await getSettingsData()
  const readOnly = !hasPermission(actor.role, 'settings.edit')
  const mode = qpayMode()
  return (
    <>
      <PageHeader title="Тохиргоо" description="Дэлгүүрийн мэдээлэл, хүргэлт, нөхцөлүүд. Өөрчлөлт дэлгүүрт шууд харагдана." />
      {readOnly && <p className="mb-4 rounded-lg bg-info-soft px-3 py-2 text-[12.5px] text-info">Демо горимд тохиргоог зөвхөн харна.</p>}
      <div className="space-y-4">
        <Card title="Дэлгүүрийн мэдээлэл">
          <StoreInfoForm initial={data.info} readOnly={readOnly} />
        </Card>
        <Card title="Хүргэлт">
          <div className="space-y-5 divide-y divide-stone-100">
            {data.shipping.map((m) => (
              <div key={m.id} className="pt-5 first:pt-0">
                <ShippingMethodForm method={m} readOnly={readOnly} />
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12px] text-stone-500">Хүргэлтийн төлбөрийг захиалга үүсэх мөчид сервер эдгээр утгаар тооцоолно.</p>
        </Card>
        <Card title="Нөхцөл, бодлого">
          <div className="grid gap-6 lg:grid-cols-2">
            {POLICY_ORDER.map((key) => (
              <div key={key}>
                <PolicyForm policyKey={key} initial={data.policies[key]} readOnly={readOnly} />
              </div>
            ))}
          </div>
        </Card>
        <Card title="Холболтууд">
          <dl className="grid gap-3 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-stone-600">QPay</dt>
              <dd className="font-medium">{mode === 'mock' ? 'Симуляц (бодит төлбөр авахгүй)' : mode === 'sandbox' ? 'Sandbox' : 'Бодит'}</dd>
            </div>
            <div>
              <dt className="text-stone-600">Зураг хадгалах (Cloudinary)</dt>
              <dd className="font-medium">{cloudinaryConfigured() ? 'Холбогдсон' : 'Тохируулаагүй'}</dd>
            </div>
            <div>
              <dt className="text-stone-600">Туслах</dt>
              <dd className="font-medium">{process.env.OPENAI_API_KEY && process.env.ASSISTANT_AI !== 'off' ? 'AI горим' : 'Сангийн хайлтын горим'}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[12px] text-stone-500">Нууц түлхүүрүүд серверийн орчинд хадгалагддаг бөгөөд энд хэзээ ч харагдахгүй.</p>
        </Card>
        {actor.role !== 'demo' && (
          <Card title="Нууц үг">
            <PasswordForm />
          </Card>
        )}
      </div>
    </>
  )
}
